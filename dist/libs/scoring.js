// ────────────────────────────────────────────────────────────
//  scoring — bot score computation and confidence boosting
// ────────────────────────────────────────────────────────────
// ── Factor points ──────────────────────────────────────────────
/**
 * Point values for each scoring factor.
 * The sum is capped at 100.
 */
const FACTOR_POINTS = {
    // ── Free-tier signals ──────────────────────────────────────
    headless_browser: 45,
    known_scraper_ua: 40,
    missing_browser_headers: 30,
    velocity_exceeded: 25,
    suspicious_header_order: 15,
    known_crawler: 5,
    // ── Cross-plugin signals (Pro/Enterprise) ────────────────
    tor_exit_node: 40,
    tls_mismatch: 25,
    vpn_proxy: 20,
    hosting_ip: 15,
    ai_agent: 15,
    high_peer_taint: 15,
    rdap_suspect: 10,
};
// ── Thresholds ─────────────────────────────────────────────────
/** Peer taint score at which `high_peer_taint` fires. */
const PEER_TAINT_THRESHOLD = 60;
/** TLS consistency score below which `tls_mismatch` fires. */
const TLS_MISMATCH_THRESHOLD = 50;
/** Regex patterns matching suspect RDAP ASN org strings. */
const SUSPECT_ORG_PATTERN = /vpn|proxy|datacenter|hosting|anonymous|bulletproof|spam|abuse|scraper/i;
// ── Public API ─────────────────────────────────────────────────
/**
 * Compute a composite bot score (0–100) from all available signals.
 *
 * @returns `{ score, factors }` — `factors` lists every fired factor key.
 */
export function computeBotScore(input) {
    const { ua, headers, velocity, crossPlugin, enableCrossPlugin } = input;
    const factors = [];
    let raw = 0;
    function add(factor) {
        factors.push(factor);
        raw += FACTOR_POINTS[factor] ?? 0;
    }
    // ── UA signals ────────────────────────────────────────────────
    if (ua.isHeadless) {
        add('headless_browser');
    }
    else if (ua.isBot) {
        add('known_scraper_ua');
    }
    else if (ua.isCrawler) {
        add('known_crawler');
    }
    // ── Header signals ────────────────────────────────────────────
    if (headers.missingBrowserHeaders) {
        add('missing_browser_headers');
    }
    if (headers.suspiciousHeaderOrder) {
        add('suspicious_header_order');
    }
    // ── Velocity signals ──────────────────────────────────────────
    if (velocity.exceedsThreshold) {
        add('velocity_exceeded');
    }
    // ── Cross-plugin signals (Pro/Enterprise) ────────────────────
    if (enableCrossPlugin && crossPlugin) {
        if (crossPlugin.isTor)
            add('tor_exit_node');
        if (crossPlugin.isProxy || crossPlugin.isVpn)
            add('vpn_proxy');
        if (crossPlugin.isHosting)
            add('hosting_ip');
        if (crossPlugin.isAiAgent)
            add('ai_agent');
        if (crossPlugin.tlsConsistencyScore !== undefined &&
            crossPlugin.tlsConsistencyScore < TLS_MISMATCH_THRESHOLD) {
            add('tls_mismatch');
        }
        if (crossPlugin.peerTaintScore !== undefined &&
            crossPlugin.peerTaintScore >= PEER_TAINT_THRESHOLD) {
            add('high_peer_taint');
        }
        if (crossPlugin.rdapAsnOrg &&
            SUSPECT_ORG_PATTERN.test(crossPlugin.rdapAsnOrg)) {
            add('rdap_suspect');
        }
    }
    return { score: Math.min(100, raw), factors };
}
/**
 * Apply the rule chain to decide the final {@link BotDecision}.
 *
 * Rules are evaluated in ascending `priority` order; the first match wins.
 * If no rule fires, a synthetic catch-all returns the default decision based
 * on the `challengeThreshold` / `blockThreshold`.
 */
export function applyRules(enrichment, rules, challengeThreshold, blockThreshold) {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
        if (rule.condition(enrichment)) {
            return rule.action;
        }
    }
    // Fallback: threshold-based default
    if (enrichment.botScore >= blockThreshold)
        return 'block';
    if (enrichment.botScore >= challengeThreshold)
        return 'challenge';
    return 'allow';
}
/**
 * Compute a score (0–100) reflecting how consistent the current bot signals
 * are with the device's history.
 *
 * - A device with a stable, low `botScore` history → high consistency.
 * - A sudden spike in `botScore` → low consistency (suspicious change).
 * - No history (new device) → neutral 50.
 */
export function computeConsistencyScore(current, history) {
    if (history.length === 0)
        return 50;
    const recentScores = history
        .slice(0, 10)
        .map((s) => s.enrichment.botScore);
    const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const delta = Math.abs(current.botScore - mean);
    // delta=0  → consistency 100; delta=100 → consistency 0
    return Math.round(Math.max(0, 100 - delta));
}
//# sourceMappingURL=scoring.js.map