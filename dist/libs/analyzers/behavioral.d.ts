import type { BehavioralMetrics, BehavioralSignals } from '../../types.js';
/**
 * Analyze optional behavioral metrics and derive a human-likeness summary.
 *
 * The score starts from a neutral baseline and is adjusted using session timing,
 * pointer movement, and keyboard-rhythm heuristics. Advanced mouse/keyboard
 * signals are only applied when `enableAdvancedSignals` is enabled.
 *
 * @param metrics - Collected behavioral telemetry for the request, if available.
 * @param enableAdvancedSignals - Whether to apply mouse and keyboard heuristics.
 * @returns Behavioral summary including the final `humanScore` and triggered factors.
 */
export declare function analyzeBehavior(metrics: BehavioralMetrics | undefined, enableAdvancedSignals: boolean): BehavioralSignals;
//# sourceMappingURL=behavioral.d.ts.map