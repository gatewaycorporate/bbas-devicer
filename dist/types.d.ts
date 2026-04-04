/**
 * The action a consumer should take for the current request.
 *
 * | Value       | Meaning                                              |
 * |-------------|------------------------------------------------------|
 * | `allow`     | Low-confidence bot signal — serve normally.          |
 * | `challenge` | Medium-confidence — present a challenge (e.g. CAPTCHA). |
 * | `block`     | High-confidence bot/scraper — reject the request.   |
 */
export type BotDecision = 'allow' | 'challenge' | 'block';
/** Result of analysing the `User-Agent` header. */
export interface UaClassification {
    /** `true` when the UA is identified as an automated bot (not a crawler). */
    isBot: boolean;
    /** `true` when a headless browser runtime (Playwright, Puppeteer, etc.) is detected. */
    isHeadless: boolean;
    /** `true` for known search/social crawlers — usually **not** blocked but flagged. */
    isCrawler: boolean;
    /**
     * Category label when identified.  Examples: `'headless'`, `'scraper'`,
     * `'crawler'`, `'http-client'`.
     */
    botKind?: string;
    /** The raw `User-Agent` string that was analysed (empty string when absent). */
    uaString: string;
}
/** Anomalies detected in the HTTP request header set. */
export interface HeaderAnomalySignals {
    /**
     * `true` when one or more headers expected from a real browser
     * (`accept`, `accept-language`, `accept-encoding`) are absent.
     */
    missingBrowserHeaders: boolean;
    /**
     * `true` when the header order looks non-browser-like (e.g. `user-agent`
     * arrives after `content-type` in a typical HTTP-client pattern).
     */
    suspiciousHeaderOrder: boolean;
    /**
     * Human-readable factor strings describing each detected anomaly.
     * e.g. `['missing_accept', 'debug_scraper_header']`
     */
    anomalyFactors: string[];
}
/** Sliding-window request velocity signals for a single device. */
export interface VelocitySignals {
    /** Number of requests recorded within the measurement window. */
    requestCount: number;
    /** Length of the sliding window in milliseconds. */
    windowMs: number;
    /** Normalised request rate: `requestCount / (windowMs / 60_000)`. */
    requestsPerMinute: number;
    /** `true` when `requestCount >= maxRequestsPerWindow`. */
    exceedsThreshold: boolean;
}
/**
 * Signals pulled from sibling plugins' `enrichmentInfo.details` entries.
 * Only populated when `enableCrossPlugin` is `true` *and* the corresponding
 * plugins have already run (Pro / Enterprise tier).
 */
export interface CrossPluginSignals {
    /** IP risk score (0–100) from ip-devicer. */
    ipRiskScore?: number;
    /** Whether the IP was classified as a proxy by ip-devicer. */
    isProxy?: boolean;
    /** Whether the IP was classified as a VPN by ip-devicer. */
    isVpn?: boolean;
    /** Whether the IP was a Tor exit node. */
    isTor?: boolean;
    /** Whether the IP is from a hosting/cloud provider. */
    isHosting?: boolean;
    /** Whether the IP belongs to a known AI agent (scraper) range. */
    isAiAgent?: boolean;
    /** Canonical AI agent provider name, if detected. */
    aiAgentProvider?: string;
    /** TLS consistency score (0–100) from tls-devicer. */
    tlsConsistencyScore?: number;
    /** Anomaly factor strings from tls-devicer. */
    tlsFactors?: string[];
    /** Peer taint score (0–100) from peer-devicer. */
    peerTaintScore?: number;
    /** RDAP ASN organisation string, used for suspect-org detection. */
    rdapAsnOrg?: string;
}
/** Full enrichment payload added to `IdentifyResult` by bbas-devicer. */
export interface BbasEnrichment {
    /** Composite bot score (0–100). Higher = more likely a bot. */
    botScore: number;
    /**
     * Factor strings that contributed to `botScore`.
     * e.g. `['headless_browser', 'missing_browser_headers']`
     */
    botFactors: string[];
    /** The action decision derived from `botScore` and the rule engine. */
    decision: BotDecision;
    /** UA analysis result. */
    uaClassification: UaClassification;
    /** Header anomaly signals. */
    headerAnomalies: HeaderAnomalySignals;
    /** Request velocity for this device. */
    velocitySignals: VelocitySignals;
    /** Cross-plugin signals when `enableCrossPlugin` is active. */
    crossPluginSignals?: CrossPluginSignals;
    /**
     * Consistency of this request's bot signals vs device history (0–100).
     * High consistency with a low score means a reliably clean device.
     */
    consistencyScore: number;
}
/** A persisted BBAS snapshot saved after each `analyze()` call. */
export interface BbasSnapshot {
    /** UUID snapshot identifier. */
    id: string;
    /** Device identifier from fp-devicer. */
    deviceId: string;
    /** UTC timestamp of when the snapshot was saved. */
    timestamp: Date;
    /** The enrichment payload for this snapshot. */
    enrichment: BbasEnrichment;
}
/**
 * Synchronous storage interface (in-memory, SQLite).
 * Mirrors the IpStorage interface from ip-devicer.
 */
export interface BbasStorage {
    save(snapshot: BbasSnapshot): void;
    getHistory(deviceId: string, limit?: number): BbasSnapshot[];
    getLatest(deviceId: string): BbasSnapshot | null;
    clear(deviceId: string): void;
    size(): number;
}
/**
 * Asynchronous storage interface (Postgres, Redis).
 * Mirrors the AsyncIpStorage interface from ip-devicer.
 */
export interface AsyncBbasStorage {
    init(): Promise<void>;
    save(snapshot: BbasSnapshot): Promise<void>;
    getHistory(deviceId: string, limit?: number): Promise<BbasSnapshot[]>;
    getLatest(deviceId: string): Promise<BbasSnapshot | null>;
    clear(deviceId: string): Promise<void>;
    size(): Promise<number>;
    close(): Promise<void>;
}
/**
 * A single rule in the BBAS rule engine.
 *
 * Rules are evaluated in ascending `priority` order. The first rule whose
 * `condition` returns `true` determines the final `BotDecision`.
 */
export interface BbasRule {
    /** Unique name for logging and debugging. */
    name: string;
    /**
     * Evaluation order — lower numbers run first.
     * Default rules use priorities 100–900; set priorities < 100 for custom
     * rules that should run before defaults.
     */
    priority: number;
    /** Returns `true` when this rule should fire. */
    condition: (enrichment: BbasEnrichment) => boolean;
    /** The decision to emit when this rule fires. */
    action: BotDecision;
}
/** Options accepted by the {@link BbasManager} constructor. */
export interface BbasManagerOptions {
    /**
     * Polar license key that unlocks Pro or Enterprise tier features.
     *
     * | Tier         | Price    | Device limit | Servers   |
     * |--------------|---------|--------------|-----------|
     * | Free         | $0/mo    | 10,000       | —         |
     * | Pro          | $49/mo   | Unlimited    | 1 server  |
     * | Enterprise   | $299/mo  | Unlimited    | Unlimited |
     *
     * Cross-plugin signal enrichment (`enableCrossPlugin`) requires Pro or
     * Enterprise. Obtain a key at https://polar.sh.
     */
    licenseKey?: string;
    /**
     * Custom storage backend. Defaults to the built-in in-memory store.
     * Use `createSqliteBbasStorage`, `createPostgresBbasStorage`, or
     * `createRedisBbasStorage` for persistent backends.
     */
    storage?: BbasStorage | AsyncBbasStorage;
    /**
     * Bot score threshold at which requests are challenged.
     * Default: `50`.
     */
    challengeThreshold?: number;
    /**
     * Bot score threshold at which requests are blocked.
     * Default: `75`.
     */
    blockThreshold?: number;
    /**
     * Length of the request velocity sliding window in milliseconds.
     * Default: `60_000` (1 minute).
     */
    velocityWindowMs?: number;
    /**
     * Maximum allowed requests per `velocityWindowMs` before the velocity
     * signal fires. Default: `120`.
     */
    maxRequestsPerWindow?: number;
    /**
     * Enable request velocity tracking. Default: `true`.
     */
    enableVelocity?: boolean;
    /**
     * Enable user-agent analysis. Default: `true`.
     */
    enableUaAnalysis?: boolean;
    /**
     * Enable cross-plugin signal enrichment from ip-devicer, tls-devicer, and
     * peer-devicer. Requires Pro or Enterprise license. Default: `true`.
     */
    enableCrossPlugin?: boolean;
    /**
     * Custom rules to merge with the default rule set. Custom rules are
     * evaluated before default rules when their `priority` is < 100.
     * See {@link BbasRule}.
     */
    rules?: BbasRule[];
    /**
     * Maximum number of BBAS snapshots stored per device.
     * Default: `50` (Pro/Enterprise) or `10` (free tier).
     */
    maxHistoryPerDevice?: number;
}
/**
 * Context object passed alongside the fingerprint payload to
 * `deviceManager.identify(data, context)`.
 *
 * Populated by {@link extractBbasContext} or manually assembled.
 */
export interface BbasIdentifyContext {
    /** Resolved client IP address. */
    ip?: string;
    /** Authenticated user identifier. */
    userId?: string;
    /** Incoming request headers (lower-cased). */
    headers?: Record<string, string | string[] | undefined>;
}
/** Base IdentifyResult shape from devicer.js (reproduced for inference). */
export interface IdentifyResult {
    deviceId: string;
    confidence: number;
    isNewDevice: boolean;
    matchConfidence: number;
    linkedUserId?: string;
    enrichmentInfo: {
        plugins: string[];
        details: Record<string, Record<string, unknown>>;
        failures: Array<{
            plugin: string;
            message: string;
        }>;
    };
}
/** `IdentifyResult` extended with bbas-devicer fields. */
export interface EnrichedIdentifyResult extends IdentifyResult {
    /** Full BBAS enrichment payload. Present when bbas-devicer is registered. */
    bbasEnrichment?: BbasEnrichment;
    /** Convenience shorthand for `bbasEnrichment.decision`. */
    bbasDecision?: BotDecision;
}
//# sourceMappingURL=types.d.ts.map