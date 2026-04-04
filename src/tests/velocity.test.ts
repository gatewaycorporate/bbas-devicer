// ────────────────────────────────────────────────────────────
//  Tests — velocity signals (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeVelocitySignals } from '../libs/velocity.js';
import type { BbasSnapshot, BbasEnrichment } from '../types.js';

// ── Helpers ────────────────────────────────────────────────────

function makeSnapshot(tsMs: number): BbasSnapshot {
  const enrichment: BbasEnrichment = {
    botScore: 0,
    botFactors: [],
    decision: 'allow',
    uaClassification: { isBot: false, isHeadless: false, isCrawler: false, uaString: '' },
    headerAnomalies: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
    velocitySignals: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
    consistencyScore: 100,
  };
  return { id: `snap-${tsMs}`, deviceId: 'dev-v', timestamp: new Date(tsMs), enrichment };
}

// ── computeVelocitySignals ─────────────────────────────────────

describe('computeVelocitySignals', () => {
  const WINDOW_MS = 60_000;
  const MAX_REQUESTS = 10;

  it('returns count 0 for an empty history', () => {
    const signals = computeVelocitySignals([], WINDOW_MS, MAX_REQUESTS);
    expect(signals.requestCount).toBe(0);
    expect(signals.exceedsThreshold).toBe(false);
    expect(signals.requestsPerMinute).toBe(0);
  });

  it('counts only snapshots within the window', () => {
    const now = Date.now();
    const history = [
      makeSnapshot(now - 10_000),   // 10s ago — inside window
      makeSnapshot(now - 30_000),   // 30s ago — inside window
      makeSnapshot(now - 90_000),   // 90s ago — OUTSIDE window
    ];
    const signals = computeVelocitySignals(history, WINDOW_MS, MAX_REQUESTS);
    expect(signals.requestCount).toBe(2);
    expect(signals.exceedsThreshold).toBe(false);
  });

  it('sets exceedsThreshold when count >= maxRequestsPerWindow', () => {
    const now = Date.now();
    const history = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(now - i * 1_000),
    );
    const signals = computeVelocitySignals(history, WINDOW_MS, MAX_REQUESTS);
    expect(signals.requestCount).toBe(10);
    expect(signals.exceedsThreshold).toBe(true);
  });

  it('does not flag when count is one below threshold', () => {
    const now = Date.now();
    const history = Array.from({ length: 9 }, (_, i) =>
      makeSnapshot(now - i * 1_000),
    );
    const signals = computeVelocitySignals(history, WINDOW_MS, MAX_REQUESTS);
    expect(signals.requestCount).toBe(9);
    expect(signals.exceedsThreshold).toBe(false);
  });

  it('computes requestsPerMinute correctly', () => {
    const now = Date.now();
    const history = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot(now - i * 2_000),
    );
    // 5 requests in 60s window → 5 RPM
    const signals = computeVelocitySignals(history, WINDOW_MS, MAX_REQUESTS);
    expect(signals.requestsPerMinute).toBe(5);
  });

  it('returns windowMs matching the provided value', () => {
    const signals = computeVelocitySignals([], 30_000, 5);
    expect(signals.windowMs).toBe(30_000);
  });
});
