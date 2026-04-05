import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BbasIdentifyContext, BotDecision } from '../types.js';
import type { BbasManager } from '../core/BbasManager.js';
/** Express/Connect-style continuation callback used by the BBAS middleware. */
export type NextFunction = (err?: unknown) => void;
/** Extended request with BBAS context attached by the middleware. */
export interface BbasRequest extends IncomingMessage {
    bbasContext?: BbasIdentifyContext;
}
/**
 * Resolve the real client IP from request headers using the same priority
 * chain as ip-devicer:
 *
 * CF-Connecting-IP → True-Client-IP → X-Real-IP → X-Forwarded-For → remoteAddress
 */
export declare function resolveIp(req: IncomingMessage): string | undefined;
/**
 * Extract a {@link BbasIdentifyContext} from an incoming request.
 *
 * - `ip`      — resolved via {@link resolveIp}
 * - `userId`  — reads the `x-user-id` header as a convenience; override
 *               after authentication if needed
 * - `headers` — full lower-cased header map copy
 */
export declare function extractBbasContext(req: IncomingMessage): BbasIdentifyContext;
export interface BbasMiddlewareOptions {
    /**
     * `'block'` (default) — sends `403 Forbidden` (or calls `blockHandler`)
     * when the BBAS decision is `'block'`.
     *
     * `'observe'` — never blocks; attaches context and calls `next()` always.
     * Useful for logging / shadow mode before enabling enforcement.
     */
    mode?: 'block' | 'observe';
    /**
     * Custom handler called instead of the default `403` response when
     * `mode === 'block'` and the decision is `'block'`.
     */
    blockHandler?: (req: IncomingMessage, res: ServerResponse, decision: BotDecision) => void;
}
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
export declare function createBbasMiddleware(_bbasManager: BbasManager, opts?: BbasMiddlewareOptions): (req: BbasRequest, res: ServerResponse, next: NextFunction) => void;
/** Re-exported for consumers who want to use the block handler directly. */
export { BbasManager } from '../core/BbasManager.js';
//# sourceMappingURL=middleware.d.ts.map