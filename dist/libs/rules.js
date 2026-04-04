// ────────────────────────────────────────────────────────────
//  rules — default BBAS rule engine definitions
// ────────────────────────────────────────────────────────────
// ── Default rule set ───────────────────────────────────────────
/**
 * Built-in rules shipped with bbas-devicer.
 *
 * Priorities 100–900. Custom rules should use priorities < 100 to run first.
 * Rules are evaluated in ascending priority order; the first match wins.
 */
export const DEFAULT_RULES = [
    {
        name: 'tor_block',
        priority: 100,
        condition: (e) => e.crossPluginSignals?.isTor === true,
        action: 'block',
    },
    {
        name: 'headless_block',
        priority: 200,
        condition: (e) => e.uaClassification.isHeadless,
        action: 'block',
    },
    {
        name: 'velocity_block',
        priority: 300,
        condition: (e) => e.velocitySignals.exceedsThreshold && e.botScore >= 75,
        action: 'block',
    },
    {
        name: 'scraper_ua_challenge',
        priority: 400,
        condition: (e) => e.uaClassification.isBot && !e.uaClassification.isHeadless,
        action: 'challenge',
    },
    {
        name: 'high_score_block',
        priority: 500,
        condition: (e, _blockThreshold) => e.botScore >= 75,
        action: 'block',
    },
    {
        name: 'mid_score_challenge',
        priority: 600,
        condition: (e, _challengeThreshold) => e.botScore >= 50,
        action: 'challenge',
    },
];
// ── Rule utilities ─────────────────────────────────────────────
/**
 * Merge custom rules with the default rule set.
 *
 * Custom rules with `priority < 100` run before all default rules.
 * The merged list is **not** pre-sorted — `applyRules` sorts on each call.
 */
export function mergeRules(custom, defaults) {
    return [...custom, ...defaults];
}
//# sourceMappingURL=rules.js.map