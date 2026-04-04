import type { HeaderAnomalySignals } from '../../types.js';
/**
 * Analyse HTTP request headers for bot/scraper anomalies.
 *
 * @param headers - Lower-cased header map from the incoming request.
 */
export declare function analyzeHeaders(headers: Record<string, string | string[] | undefined>): HeaderAnomalySignals;
//# sourceMappingURL=headers.d.ts.map