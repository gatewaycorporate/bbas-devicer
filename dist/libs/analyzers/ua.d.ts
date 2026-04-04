import type { UaClassification } from '../../types.js';
/**
 * Classify a `User-Agent` string and return a {@link UaClassification}.
 *
 * - Unknown / absent UAs are treated as potentially suspicious but **not**
 *   definitively a bot — let downstream scoring decide.
 * - Legitimate crawlers (`isCrawler: true`) have `isBot: false` so that the
 *   default rule engine does not block them.
 *
 * @param ua - The raw `User-Agent` header value; `undefined` when absent.
 */
export declare function analyzeUserAgent(ua: string | undefined): UaClassification;
//# sourceMappingURL=ua.d.ts.map