// ────────────────────────────────────────────────────────────
//  bbas-devicer — public API barrel
// ────────────────────────────────────────────────────────────
// ── Core ──────────────────────────────────────────────────────
export { BbasManager } from './core/BbasManager.js';
// ── Licensing ─────────────────────────────────────────────────
export { validateLicense, evictLicenseCache, POLAR_ORGANIZATION_ID, POLAR_BENEFIT_IDS, FREE_TIER_MAX_DEVICES, FREE_TIER_MAX_HISTORY, } from './libs/license.js';
// ── Analyzers ─────────────────────────────────────────────────
export { analyzeUserAgent } from './libs/analyzers/ua.js';
export { analyzeHeaders } from './libs/analyzers/headers.js';
export { analyzeBehavior } from './libs/analyzers/behavioral.js';
// ── Velocity ──────────────────────────────────────────────────
export { computeVelocitySignals } from './libs/velocity.js';
// ── Scoring ───────────────────────────────────────────────────
export { computeBotScore, applyRules, computeConsistencyScore, } from './libs/scoring.js';
// ── Rules ─────────────────────────────────────────────────────
export { DEFAULT_RULES, mergeRules } from './libs/rules.js';
// ── Storage ───────────────────────────────────────────────────
export { createBbasStorage } from './libs/adapters/inmemory.js';
export { createSqliteBbasStorage } from './libs/adapters/sqlite.js';
export { createPostgresBbasStorage } from './libs/adapters/postgres.js';
export { createRedisBbasStorage } from './libs/adapters/redis.js';
// ── Middleware ────────────────────────────────────────────────
export { createBbasMiddleware, extractBbasContext, resolveIp, } from './libs/middleware.js';
//# sourceMappingURL=main.js.map