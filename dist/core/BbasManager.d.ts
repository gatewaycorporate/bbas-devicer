import { type LicenseTier } from '../libs/license.js';
import type { BbasEnrichment, BbasIdentifyContext, BbasManagerOptions, BbasSnapshot, BotDecision, CrossPluginSignals } from '../types.js';
import type { DeviceManagerPlugin, DeviceManagerLike } from 'devicer.js';
import type { BehavioralMetrics } from '../types.js';
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
export declare class BbasManager implements DeviceManagerPlugin {
    private storage;
    private licenseInfo;
    private initPromise;
    private readonly opts;
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
    constructor(options?: BbasManagerOptions);
    /** Active license tier. Resolves to `'free'` until {@link init} completes. */
    get tier(): LicenseTier;
    /**
     * Initialise the manager and validate the Polar license key if supplied.
     *
     * Call once at application startup. Safe to `await` multiple times —
     * subsequent calls return the cached promise.
     */
    init(): Promise<void>;
    private _doInit;
    private ensureInit;
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
    analyze(deviceId: string, context: BbasIdentifyContext, crossPlugin?: CrossPluginSignals, behavioralMetrics?: BehavioralMetrics): Promise<{
        enrichment: BbasEnrichment;
        decision: BotDecision;
    }>;
    /**
     * Return the stored BBAS snapshot history for a device.
     */
    getHistory(deviceId: string, limit?: number): Promise<BbasSnapshot[]>;
    /**
     * Register this BbasManager as a `DeviceManager` post-processor plugin.
     *
     * **Plugin ordering matters.** Register `ip-devicer`, `tls-devicer`, and
     * `peer-devicer` *before* calling this method so that their signals are
     * available in `result.enrichmentInfo.details` when bbas-devicer runs.
     */
    registerWith(deviceManager: DeviceManagerLike): (() => void) | void;
    /** Release storage connections. */
    close(): Promise<void>;
}
//# sourceMappingURL=BbasManager.d.ts.map