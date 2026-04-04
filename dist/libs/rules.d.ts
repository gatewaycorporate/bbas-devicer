import type { BbasRule } from '../types.js';
/**
 * Built-in rules shipped with bbas-devicer.
 *
 * Priorities 100–900. Custom rules should use priorities < 100 to run first.
 * Rules are evaluated in ascending priority order; the first match wins.
 */
export declare const DEFAULT_RULES: BbasRule[];
/**
 * Merge custom rules with the default rule set.
 *
 * Custom rules with `priority < 100` run before all default rules.
 * The merged list is **not** pre-sorted — `applyRules` sorts on each call.
 */
export declare function mergeRules(custom: BbasRule[], defaults: BbasRule[]): BbasRule[];
//# sourceMappingURL=rules.d.ts.map