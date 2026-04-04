import type { BbasEnrichment, BbasRule, BbasSnapshot, BotDecision, CrossPluginSignals, HeaderAnomalySignals, UaClassification, VelocitySignals } from '../types.js';
/** All signal inputs needed to compute a bot score. */
export interface BotScoringInput {
    ua: UaClassification;
    headers: HeaderAnomalySignals;
    velocity: VelocitySignals;
    crossPlugin?: CrossPluginSignals;
    /** When `false`, cross-plugin signals are ignored even if present. */
    enableCrossPlugin: boolean;
}
/**
 * Compute a composite bot score (0–100) from all available signals.
 *
 * @returns `{ score, factors }` — `factors` lists every fired factor key.
 */
export declare function computeBotScore(input: BotScoringInput): {
    score: number;
    factors: string[];
};
/**
 * Apply the rule chain to decide the final {@link BotDecision}.
 *
 * Rules are evaluated in ascending `priority` order; the first match wins.
 * If no rule fires, a synthetic catch-all returns the default decision based
 * on the `challengeThreshold` / `blockThreshold`.
 */
export declare function applyRules(enrichment: BbasEnrichment, rules: BbasRule[], challengeThreshold: number, blockThreshold: number): BotDecision;
/**
 * Compute a score (0–100) reflecting how consistent the current bot signals
 * are with the device's history.
 *
 * - A device with a stable, low `botScore` history → high consistency.
 * - A sudden spike in `botScore` → low consistency (suspicious change).
 * - No history (new device) → neutral 50.
 */
export declare function computeConsistencyScore(current: BbasEnrichment, history: BbasSnapshot[]): number;
//# sourceMappingURL=scoring.d.ts.map