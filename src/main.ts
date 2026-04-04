// ────────────────────────────────────────────────────────────
//  bbas-devicer — public API barrel
// ────────────────────────────────────────────────────────────

// ── Core ──────────────────────────────────────────────────────
export { BbasManager } from './core/BbasManager.js';

// ── Licensing ─────────────────────────────────────────────────
export {
  validateLicense,
  evictLicenseCache,
  POLAR_ORGANIZATION_ID,
  POLAR_BENEFIT_IDS,
  FREE_TIER_MAX_DEVICES,
  FREE_TIER_MAX_HISTORY,
} from './libs/license.js';
export type { LicenseTier, LicenseInfo } from './libs/license.js';

// ── Types ─────────────────────────────────────────────────────
export type {
  BotDecision,
  UaClassification,
  HeaderAnomalySignals,
  VelocitySignals,
  CrossPluginSignals,
  BbasEnrichment,
  BbasSnapshot,
  BbasStorage,
  AsyncBbasStorage,
  BbasRule,
  BbasManagerOptions,
  BbasIdentifyContext,
  IdentifyResult,
  EnrichedIdentifyResult,
} from './types.js';

// ── Analyzers ─────────────────────────────────────────────────
export { analyzeUserAgent } from './libs/analyzers/ua.js';
export { analyzeHeaders } from './libs/analyzers/headers.js';

// ── Velocity ──────────────────────────────────────────────────
export { computeVelocitySignals } from './libs/velocity.js';

// ── Scoring ───────────────────────────────────────────────────
export {
  computeBotScore,
  applyRules,
  computeConsistencyScore,
} from './libs/scoring.js';
export type { BotScoringInput } from './libs/scoring.js';

// ── Rules ─────────────────────────────────────────────────────
export { DEFAULT_RULES, mergeRules } from './libs/rules.js';

// ── Storage ───────────────────────────────────────────────────
export { createBbasStorage } from './libs/adapters/inmemory.js';
export { createSqliteBbasStorage } from './libs/adapters/sqlite.js';
export { createPostgresBbasStorage } from './libs/adapters/postgres.js';
export type { PgPoolLike } from './libs/adapters/postgres.js';
export { createRedisBbasStorage } from './libs/adapters/redis.js';
export type { RedisLike } from './libs/adapters/redis.js';

// ── Middleware ────────────────────────────────────────────────
export {
  createBbasMiddleware,
  extractBbasContext,
  resolveIp,
} from './libs/middleware.js';
export type {
  BbasRequest,
  BbasMiddlewareOptions,
  NextFunction,
} from './libs/middleware.js';
