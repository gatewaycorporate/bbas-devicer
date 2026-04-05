// ────────────────────────────────────────────────────────────
//  BbasManager — core orchestrator for bot blocking & anti-scrape
// ────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import { createBbasStorage } from '../libs/adapters/inmemory.js';
import { analyzeUserAgent } from '../libs/analyzers/ua.js';
import { analyzeHeaders } from '../libs/analyzers/headers.js';
import { analyzeBehavior } from '../libs/analyzers/behavioral.js';
import { computeVelocitySignals } from '../libs/velocity.js';
import { computeBotScore, computeConsistencyScore, applyRules } from '../libs/scoring.js';
import { DEFAULT_RULES, mergeRules } from '../libs/rules.js';
import {
  validateLicense,
  type LicenseInfo,
  type LicenseTier,
  FREE_TIER_MAX_DEVICES,
  FREE_TIER_MAX_HISTORY,
} from '../libs/license.js';
import type {
  AsyncBbasStorage,
  BbasEnrichment,
  BbasIdentifyContext,
  BbasManagerOptions,
  BbasRule,
  BbasSnapshot,
  BbasStorage,
  BotDecision,
  CrossPluginSignals,
  VelocitySignals,
} from '../types.js';
import type {
  DeviceManagerPlugin,
  DeviceManagerLike,
} from 'devicer.js';
import type {
  BehavioralFingerprintPayload,
  BehavioralMetrics,
} from '../types.js';

// ── Plugin name registered with DeviceManager ─────────────────
const PLUGIN_NAME = 'bbas';

// ── Warning messages ──────────────────────────────────────────
const LICENSE_WARN =
  '[bbas-devicer] No license key — running on the free tier ' +
  `(${FREE_TIER_MAX_HISTORY} snapshots/device, ${FREE_TIER_MAX_DEVICES.toLocaleString()} device limit, ` +
  'cross-plugin signals disabled). ' +
  'Visit https://polar.sh to upgrade to Pro or Enterprise.';
const LICENSE_INVALID_WARN =
  '[bbas-devicer] License key could not be validated — falling back to the free tier. ' +
  'Check your key or network connectivity.';
const DEVICE_LIMIT_WARN =
  `[bbas-devicer] Free-tier device limit reached (${FREE_TIER_MAX_DEVICES.toLocaleString()} devices). ` +
  'New device will not be tracked. Upgrade to Pro or Enterprise to remove this limit.';

// ── Storage normalisation (sync → async wrapper) ──────────────

function normalizeStorage(s: BbasStorage | AsyncBbasStorage): AsyncBbasStorage {
  if ('init' in s && typeof (s as AsyncBbasStorage).init === 'function') {
    return s as AsyncBbasStorage;
  }
  const sync = s as BbasStorage;
  return {
    init:       () => Promise.resolve(),
    save:       (p) => Promise.resolve(sync.save(p)),
    getHistory: (id, lim) => Promise.resolve(sync.getHistory(id, lim)),
    getLatest:  (id) => Promise.resolve(sync.getLatest(id)),
    clear:      (id) => Promise.resolve(sync.clear(id)),
    size:       () => Promise.resolve(sync.size()),
    close:      () => Promise.resolve(),
  };
}

// ── Cross-plugin signal extraction ────────────────────────────

/**
 * Pull signals from the enrichment details injected by ip-devicer,
 * tls-devicer, and peer-devicer into `result.enrichmentInfo.details`.
 */
function extractCrossPluginSignals(
  details: Record<string, Record<string, unknown>>,
): CrossPluginSignals {
  const ip  = details['ip']   ?? {};
  const tls = details['tls']  ?? {};
  const peer = details['peer'] ?? {};

  return {
    ipRiskScore:        typeof ip['riskScore']   === 'number' ? ip['riskScore']   : undefined,
    isProxy:            ip['isProxy']   === true,
    isVpn:              ip['isVpn']     === true,
    isTor:              ip['isTor']     === true,
    isHosting:          ip['isHosting'] === true,
    isAiAgent:          (ip['agentInfo'] as { isAiAgent?: boolean } | undefined)?.isAiAgent === true,
    aiAgentProvider:    (ip['agentInfo'] as { aiAgentProvider?: string } | undefined)?.aiAgentProvider,
    tlsConsistencyScore: typeof tls['consistencyScore'] === 'number'
      ? tls['consistencyScore']
      : undefined,
    tlsFactors:         Array.isArray(tls['factors']) ? (tls['factors'] as string[]) : undefined,
    peerTaintScore:     typeof peer['taintScore'] === 'number' ? peer['taintScore'] : undefined,
    rdapAsnOrg:         typeof ip['asnOrg'] === 'string' ? ip['asnOrg'] : undefined,
  };
}

// ── BbasManager ────────────────────────────────────────────────

/**
 * BbasManager — bot blocking and anti-scrape plugin for the FP-Devicer Suite.
 *
 * Computes a `botScore` (0–100) from three signal tiers:
 * 1. **UA analysis** — headless browsers, scrapers, HTTP clients
 * 2. **Header anomaly detection** — missing browser headers, debug headers
 * 3. **Request velocity** — sliding-window rate limiting per device
 * 4. **Cross-plugin correlation** — ip-devicer / tls-devicer / peer-devicer
 *    signals (Pro/Enterprise only)
 *
 * A configurable rule engine translates the score into a {@link BotDecision}
 * (`allow | challenge | block`).
 *
 * ### Integration
 * ```ts
 * // Register ip-devicer and tls-devicer FIRST so cross-plugin signals are
 * // available when bbas-devicer runs.
 * ipManager.registerWith(deviceManager);
 * tlsManager.registerWith(deviceManager);
 * peerManager.registerWith(deviceManager);
 * bbasManager.registerWith(deviceManager);
 *
 * const result = await deviceManager.identify(req.body, req.bbasContext);
 * // result.bbasDecision — 'allow' | 'challenge' | 'block'
 * // result.bbasEnrichment — full enrichment payload
 * ```
 */
export class BbasManager implements DeviceManagerPlugin {
  private storage: AsyncBbasStorage;
  private licenseInfo: LicenseInfo = {
    valid: false,
    tier: 'free',
    maxDevices: FREE_TIER_MAX_DEVICES,
  };
  private initPromise: Promise<void> | null = null;

  private readonly opts: {
    licenseKey?: string;
    challengeThreshold: number;
    blockThreshold: number;
    velocityWindowMs: number;
    maxRequestsPerWindow: number;
    enableVelocity: boolean;
    enableUaAnalysis: boolean;
    enableBehavioralAnalysis: boolean;
    enableCrossPlugin: boolean;
    rules: BbasRule[];
    maxHistoryPerDevice: number;
  };

  /**
   * Create a BBAS manager with optional scoring, rule, storage, and license configuration.
   *
   * When a license key is supplied the constructor optimistically uses the paid-tier
   * history depth until {@link init} validates the key. If validation fails, the
   * instance falls back to the free-tier limits.
   *
   * @param options - Optional runtime configuration.
   * @param options.licenseKey - Polar license key used to unlock paid tiers.
   * @param options.storage - Custom BBAS storage backend. Defaults to the in-memory adapter.
   * @param options.challengeThreshold - Bot score at or above which the default rules challenge. Defaults to the package default.
   * @param options.blockThreshold - Bot score at or above which the default rules block. Defaults to the package default.
   * @param options.velocityWindowMs - Sliding window used for per-device request-rate analysis.
   * @param options.maxRequestsPerWindow - Threshold above which the velocity factor fires.
   * @param options.enableVelocity - Whether velocity signals are included in scoring.
   * @param options.enableUaAnalysis - Whether User-Agent analysis is included in scoring.
   * @param options.enableBehavioralAnalysis - Whether advanced behavioral heuristics are included in scoring.
   * @param options.enableCrossPlugin - Whether ip/tls/peer enrichment signals are included in scoring.
   * @param options.rules - Custom rule overrides or additions merged with the defaults.
   * @param options.maxHistoryPerDevice - Maximum BBAS snapshots retained per device.
   */
  constructor(options: BbasManagerOptions = {}) {
    const hasKey = Boolean(options.licenseKey?.trim());

    if (!hasKey) {
      console.warn(LICENSE_WARN);
    }

    const maxHistory = hasKey
      ? (options.maxHistoryPerDevice ?? 50)
      : (options.maxHistoryPerDevice ?? FREE_TIER_MAX_HISTORY);

    this.opts = {
      licenseKey:            options.licenseKey,
      challengeThreshold:    options.challengeThreshold    ?? 50,
      blockThreshold:        options.blockThreshold        ?? 75,
      velocityWindowMs:      options.velocityWindowMs      ?? 60_000,
      maxRequestsPerWindow:  options.maxRequestsPerWindow  ?? 120,
      enableVelocity:        options.enableVelocity        ?? true,
      enableUaAnalysis:      options.enableUaAnalysis      ?? true,
      enableBehavioralAnalysis: options.enableBehavioralAnalysis ?? true,
      enableCrossPlugin:     options.enableCrossPlugin     ?? true,
      rules:                 mergeRules(options.rules ?? [], DEFAULT_RULES),
      maxHistoryPerDevice:   maxHistory,
    };

    this.storage = normalizeStorage(
      options.storage ?? createBbasStorage(maxHistory),
    );
  }

  // ── Accessors ─────────────────────────────────────────────────

  /** Active license tier. Resolves to `'free'` until {@link init} completes. */
  get tier(): LicenseTier {
    return this.licenseInfo.tier;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /**
   * Initialise the manager and validate the Polar license key if supplied.
   *
   * Call once at application startup. Safe to `await` multiple times —
   * subsequent calls return the cached promise.
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    const licenseKey = this.opts.licenseKey?.trim();

    const [licenseInfo] = await Promise.all([
      licenseKey ? validateLicense(licenseKey) : Promise.resolve(this.licenseInfo),
      this.storage.init(),
    ]);

    this.licenseInfo = licenseInfo;

    if (licenseKey && !licenseInfo.valid) {
      console.warn(LICENSE_INVALID_WARN);
      // If we over-provisioned history, recreate storage with free-tier cap.
      if (this.opts.maxHistoryPerDevice > FREE_TIER_MAX_HISTORY) {
        if (!this.opts.licenseKey) {
          this.storage = normalizeStorage(createBbasStorage(FREE_TIER_MAX_HISTORY));
        }
        (this.opts as { maxHistoryPerDevice: number }).maxHistoryPerDevice =
          FREE_TIER_MAX_HISTORY;
      }
    }
  }

  private async ensureInit(): Promise<void> {
    if (this.initPromise === null) await this.init();
    else await this.initPromise;
  }

  // ── Core analysis ─────────────────────────────────────────────

  /**
   * Analyse a request for bot signals and return the enrichment + decision.
   *
   * Call this directly or let {@link registerWith} call it automatically via
   * the `DeviceManager` post-processor pipeline.
   *
   * @param deviceId    - The `deviceId` resolved by fp-devicer.
   * @param context     - Request context (IP, headers, userId).
   * @param crossPlugin - Pre-extracted cross-plugin signals (optional; populated
   *                      automatically in the post-processor path).
   */
  async analyze(
    deviceId: string,
    context: BbasIdentifyContext,
    crossPlugin?: CrossPluginSignals,
    behavioralMetrics?: BehavioralMetrics,
  ): Promise<{ enrichment: BbasEnrichment; decision: BotDecision }> {
    await this.ensureInit();

    const headers = context.headers ?? {};

    // ── Free-tier device cap ──────────────────────────────────
    const isKnown = (await this.storage.getLatest(deviceId)) !== null;
    if (
      !isKnown &&
      this.licenseInfo.tier === 'free' &&
      (await this.storage.size()) >= FREE_TIER_MAX_DEVICES
    ) {
      console.warn(DEVICE_LIMIT_WARN);
      // Return a minimal allow result so callers are not disrupted.
      const empty = buildEmptyEnrichment(headers, this.opts.velocityWindowMs);
      return { enrichment: empty, decision: 'allow' };
    }

    // ── UA analysis ───────────────────────────────────────────
    const uaHeader = flattenHeader(headers['user-agent']);
    const ua = this.opts.enableUaAnalysis
      ? analyzeUserAgent(uaHeader)
      : analyzeUserAgent(undefined);

    // ── Header analysis ───────────────────────────────────────
    const headerAnomalies = analyzeHeaders(headers);

    // ── Velocity signals ──────────────────────────────────────
    let velocitySignals: VelocitySignals;
    if (this.opts.enableVelocity) {
      const history = await this.storage.getHistory(deviceId);
      velocitySignals = computeVelocitySignals(
        history,
        this.opts.velocityWindowMs,
        this.opts.maxRequestsPerWindow,
      );
    } else {
      velocitySignals = {
        requestCount: 0,
        windowMs: this.opts.velocityWindowMs,
        requestsPerMinute: 0,
        exceedsThreshold: false,
      };
    }

    // ── Cross-plugin gate (Pro/Enterprise) ────────────────────
    const isPaid = this.licenseInfo.tier !== 'free';
    const effectiveCrossPlugin =
      this.opts.enableCrossPlugin && isPaid ? crossPlugin : undefined;
    const behavioralSignals = analyzeBehavior(
      behavioralMetrics,
      this.opts.enableBehavioralAnalysis && isPaid,
    );

    // ── Bot score ─────────────────────────────────────────────
    const { score: botScore, factors: botFactors } = computeBotScore({
      ua,
      headers: headerAnomalies,
      velocity: velocitySignals,
      behavioral: behavioralSignals,
      crossPlugin: effectiveCrossPlugin,
      enableBehavioralAnalysis: this.opts.enableBehavioralAnalysis && isPaid,
      enableCrossPlugin: this.opts.enableCrossPlugin && isPaid,
    });

    // ── Consistency ───────────────────────────────────────────
    const history = await this.storage.getHistory(deviceId);

    // Build partial enrichment for consistency (without decision yet)
    const partialEnrichment: Omit<BbasEnrichment, 'decision' | 'consistencyScore'> = {
      botScore,
      botFactors,
      uaClassification:  ua,
      headerAnomalies,
      velocitySignals,
      behavioralSignals,
      crossPluginSignals: effectiveCrossPlugin,
    };

    const consistencyScore = computeConsistencyScore(
      { ...partialEnrichment, decision: 'allow', consistencyScore: 0 },
      history,
    );

    const enrichmentWithoutDecision: Omit<BbasEnrichment, 'decision'> = {
      ...partialEnrichment,
      consistencyScore,
    };

    // ── Rule engine ───────────────────────────────────────────
    const enrichment: BbasEnrichment = {
      ...enrichmentWithoutDecision,
      decision: 'allow', // placeholder; overwritten immediately
    };
    const decision = applyRules(
      enrichment,
      this.opts.rules,
      this.opts.challengeThreshold,
      this.opts.blockThreshold,
    );
    enrichment.decision = decision;

    // ── Persist snapshot ──────────────────────────────────────
    const snapshot: BbasSnapshot = {
      id: randomUUID(),
      deviceId,
      timestamp: new Date(),
      enrichment,
    };
    await this.storage.save(snapshot);

    return { enrichment, decision };
  }

  /**
   * Return the stored BBAS snapshot history for a device.
   */
  async getHistory(deviceId: string, limit?: number): Promise<BbasSnapshot[]> {
    await this.ensureInit();
    return this.storage.getHistory(deviceId, limit);
  }

  /**
   * Register this BbasManager as a `DeviceManager` post-processor plugin.
   *
   * **Plugin ordering matters.** Register `ip-devicer`, `tls-devicer`, and
   * `peer-devicer` *before* calling this method so that their signals are
   * available in `result.enrichmentInfo.details` when bbas-devicer runs.
   */
  registerWith(deviceManager: DeviceManagerLike): (() => void) | void {
    return deviceManager.registerIdentifyPostProcessor?.(
      PLUGIN_NAME,
      async ({ incoming, result, context }) => {
        const ctx = (context ?? {}) as BbasIdentifyContext;
        const behavioralMetrics = (incoming as BehavioralFingerprintPayload).behavioralMetrics;

        // Pull cross-plugin signals from sibling plugin enrichment details
        const details = result.enrichmentInfo?.details ?? {};
        const crossPlugin = extractCrossPluginSignals(
          details as Record<string, Record<string, unknown>>,
        );

        const { enrichment, decision } = await this.analyze(
          result.deviceId,
          ctx,
          crossPlugin,
          behavioralMetrics,
        );

        return {
          result: {
            bbasEnrichment: enrichment,
            bbasDecision: decision,
          },
          enrichmentInfo: {
            botScore:     enrichment.botScore,
            decision,
            factors:      enrichment.botFactors,
            consistency:  enrichment.consistencyScore,
            isHeadless:   enrichment.uaClassification.isHeadless,
            isBot:        enrichment.uaClassification.isBot,
            isCrawler:    enrichment.uaClassification.isCrawler,
            velocity:     enrichment.velocitySignals.requestsPerMinute,
            behavioralHumanScore: enrichment.behavioralSignals?.humanScore,
          },
          logMeta: {
            botScore: enrichment.botScore,
            decision,
            factors:  enrichment.botFactors,
            behavioralHumanScore: enrichment.behavioralSignals?.humanScore,
          },
        };
      },
    );
  }

  /** Release storage connections. */
  close(): Promise<void> {
    return this.storage.close();
  }
}

// ── Helpers ───────────────────────────────────────────────────

function flattenHeader(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function buildEmptyEnrichment(
  headers: Record<string, string | string[] | undefined>,
  windowMs: number,
): BbasEnrichment {
  return {
    botScore: 0,
    botFactors: [],
    decision: 'allow',
    uaClassification: {
      isBot: false,
      isHeadless: false,
      isCrawler: false,
      uaString: flattenHeader(headers['user-agent']) ?? '',
    },
    headerAnomalies: {
      missingBrowserHeaders: false,
      suspiciousHeaderOrder: false,
      anomalyFactors: [],
    },
    velocitySignals: {
      requestCount: 0,
      windowMs,
      requestsPerMinute: 0,
      exceedsThreshold: false,
    },
    consistencyScore: 50,
  };
}
