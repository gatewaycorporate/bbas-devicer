// ────────────────────────────────────────────────────────────
//  ua — user-agent bot / headless / crawler classifier
// ────────────────────────────────────────────────────────────
const MOST_LEGITIMATE_PATTERNS = [
    // ── Legitimate browsers (flagged, not blocked by default) ───────
    { pattern: /Mozilla\/5\.0/i, botKind: 'browser', isHeadless: false, isCrawler: false },
    { pattern: /AppleWebKit/i, botKind: 'browser', isHeadless: false, isCrawler: false },
    { pattern: /Safari/i, botKind: 'browser', isHeadless: false, isCrawler: false },
    { pattern: /Chrome/i, botKind: 'browser', isHeadless: false, isCrawler: false },
    { pattern: /Firefox/i, botKind: 'browser', isHeadless: false, isCrawler: false },
    { pattern: /Edge/i, botKind: 'browser', isHeadless: false, isCrawler: false },
];
const KNOWN_BOT_PATTERNS = [
    // ── Headless browsers ────────────────────────────────────────
    { pattern: /HeadlessChrome/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /Playwright/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /puppeteer/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /PhantomJS/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /SlimerJS/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /Splash\//i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /selenium/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    { pattern: /webdriver/i, botKind: 'headless', isHeadless: true, isCrawler: false },
    // ── Legitimate crawlers (flagged, not blocked by default) ────
    { pattern: /Googlebot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /Bingbot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /Slurp/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /DuckDuckBot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /Baiduspider/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /YandexBot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /facebookexternalhit/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /Twitterbot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /LinkedInBot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /AhrefsBot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /SemrushBot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /MJ12bot/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    { pattern: /ia_archiver/i, botKind: 'crawler', isHeadless: false, isCrawler: true },
    // ── HTTP clients / scrapers ───────────────────────────────────
    { pattern: /python-requests/i, botKind: 'scraper', isHeadless: false, isCrawler: false },
    { pattern: /python-httpx/i, botKind: 'scraper', isHeadless: false, isCrawler: false },
    { pattern: /aiohttp\//i, botKind: 'scraper', isHeadless: false, isCrawler: false },
    { pattern: /scrapy\//i, botKind: 'scraper', isHeadless: false, isCrawler: false },
    { pattern: /httpx\//i, botKind: 'scraper', isHeadless: false, isCrawler: false },
    { pattern: /^curl\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^Wget\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^axios\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^node-fetch\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^node-http\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /Go-http-client/i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^Java\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /libwww-perl/i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /HTTPie\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /okhttp\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^Faraday\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /^got\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
    { pattern: /undici\//i, botKind: 'http-client', isHeadless: false, isCrawler: false },
];
// ── Public API ─────────────────────────────────────────────────
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
export function analyzeUserAgent(ua) {
    const uaString = ua?.trim() ?? '';
    if (!uaString) {
        // Missing UA is suspicious but ambiguous — score it low; velocity /
        // header checks will act on it if needed.
        return {
            isBot: false,
            isHeadless: false,
            isCrawler: false,
            claimsLegitBrowser: false,
            uaString,
        };
    }
    for (const entry of KNOWN_BOT_PATTERNS) {
        if (entry.pattern.test(uaString)) {
            return {
                isBot: !entry.isCrawler,
                isHeadless: entry.isHeadless,
                isCrawler: entry.isCrawler,
                claimsLegitBrowser: false,
                botKind: entry.botKind,
                uaString,
            };
        }
    }
    for (const entry of MOST_LEGITIMATE_PATTERNS) {
        if (entry.pattern.test(uaString)) {
            return {
                isBot: false,
                isHeadless: false,
                isCrawler: false,
                claimsLegitBrowser: true,
                botKind: entry.botKind,
                uaString,
            };
        }
    }
    return {
        isBot: false,
        isHeadless: false,
        isCrawler: false,
        claimsLegitBrowser: false,
        uaString,
    };
}
//# sourceMappingURL=ua.js.map