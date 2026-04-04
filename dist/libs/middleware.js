// ────────────────────────────────────────────────────────────
//  middleware — Express/Connect-compatible BBAS context extractor
// ────────────────────────────────────────────────────────────
// ── IP resolution (mirrors ip-devicer priority chain) ─────────
function firstHeader(headers, name) {
    const v = headers[name];
    if (!v)
        return undefined;
    const raw = Array.isArray(v) ? v[0] : v;
    const trimmed = raw?.trim();
    return trimmed?.length ? trimmed : undefined;
}
/**
 * Resolve the real client IP from request headers using the same priority
 * chain as ip-devicer:
 *
 * CF-Connecting-IP → True-Client-IP → X-Real-IP → X-Forwarded-For → remoteAddress
 */
export function resolveIp(req) {
    const h = req.headers;
    const cf = firstHeader(h, 'cf-connecting-ip');
    if (cf)
        return cf;
    const tci = firstHeader(h, 'true-client-ip');
    if (tci)
        return tci;
    const xri = firstHeader(h, 'x-real-ip');
    if (xri)
        return xri;
    const xff = firstHeader(h, 'x-forwarded-for');
    if (xff) {
        const first = xff.split(',')[0]?.trim();
        if (first?.length)
            return first;
    }
    const remote = req.socket.remoteAddress;
    return remote ?? undefined;
}
// ── Context extraction ────────────────────────────────────────
/**
 * Extract a {@link BbasIdentifyContext} from an incoming request.
 *
 * - `ip`      — resolved via {@link resolveIp}
 * - `userId`  — reads the `x-user-id` header as a convenience; override
 *               after authentication if needed
 * - `headers` — full lower-cased header map copy
 */
export function extractBbasContext(req) {
    const ip = resolveIp(req);
    const userId = firstHeader(req.headers, 'x-user-id');
    // Shallow-copy headers so callers can mutate safely
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
        headers[k.toLowerCase()] = v;
    }
    return { ip, userId, headers };
}
// ── Factory ────────────────────────────────────────────────────
/**
 * Create an Express / Connect-compatible middleware that:
 * 1. Extracts BBAS context from the request and attaches it as `req.bbasContext`.
 * 2. In `'block'` mode, calls the `blockHandler` (or sends 403) when the
 *    decision reaches `'block'`.
 *
 * You must still pass `req.bbasContext` as the `context` argument when
 * calling `deviceManager.identify()` for the enrichment to run.
 *
 * @example
 * ```ts
 * app.use(createBbasMiddleware(bbasManager, { mode: 'block' }));
 *
 * app.post('/identify', (req, res) => {
 *   const result = await deviceManager.identify(req.body, req.bbasContext);
 *   if (result.bbasDecision === 'challenge') { … }
 *   res.json(result);
 * });
 * ```
 */
export function createBbasMiddleware(_bbasManager, opts = {}) {
    const mode = opts.mode ?? 'block';
    const blockHandler = opts.blockHandler ??
        ((_req, res) => {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden', reason: 'bot_detected' }));
        });
    return function bbasMiddleware(req, res, next) {
        req.bbasContext = extractBbasContext(req);
        if (mode === 'observe') {
            next();
            return;
        }
        // In 'block' mode we attach context and let the route handler call
        // identify(). The middleware itself cannot call block here because the
        // decision only becomes available after identify() has run. However,
        // consumers can use this middleware together with a post-identify guard:
        //
        //   const result = await deviceManager.identify(fp, req.bbasContext);
        //   if (result.bbasDecision === 'block') return blockHandler(req, res, 'block');
        //
        // For convenience, we expose blockHandler via the closure so callers can
        // import and use it directly.
        next();
    };
}
/** Re-exported for consumers who want to use the block handler directly. */
export { BbasManager } from '../core/BbasManager.js';
//# sourceMappingURL=middleware.js.map