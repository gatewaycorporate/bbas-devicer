// ────────────────────────────────────────────────────────────
//  Tests — SQLite storage adapter (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from 'vitest';
import { createSqliteBbasStorage } from '../../libs/adapters/sqlite.js';
import type { BbasSnapshot, BbasEnrichment } from '../../types.js';

const baseEnrichment: BbasEnrichment = {
  botScore: 0,
  botFactors: [],
  decision: 'allow',
  uaClassification: { isBot: false, isHeadless: false, isCrawler: false, uaString: '' },
  headerAnomalies: {
    missingBrowserHeaders: false,
    suspiciousHeaderOrder: false,
    anomalyFactors: [],
  },
  velocitySignals: {
    requestCount: 0,
    requestsPerMinute: 0,
    exceedsThreshold: false,
    windowMs: 60_000,
  },
  consistencyScore: 100,
};

let counter = 0;
function snap(deviceId: string): BbasSnapshot {
  return {
    id: `id-${++counter}`,
    deviceId,
    timestamp: new Date(),
    enrichment: { ...baseEnrichment },
  };
}

describe('createSqliteBbasStorage', () => {
  afterEach(() => { counter = 0; });

  it('saves and retrieves snapshots newest-first', () => {
    const s = createSqliteBbasStorage(':memory:');
    const a = snap('d1');
    const b = snap('d1');
    s.save(a);
    s.save(b);
    const history = s.getHistory('d1');
    expect(history[0].id).toBe(b.id);
    expect(history[1].id).toBe(a.id);
  });

  it('returns empty array for unknown deviceId', () => {
    const s = createSqliteBbasStorage(':memory:');
    expect(s.getHistory('unknown')).toHaveLength(0);
  });

  it('respects limit on getHistory', () => {
    const s = createSqliteBbasStorage(':memory:');
    s.save(snap('d1'));
    s.save(snap('d1'));
    s.save(snap('d1'));
    expect(s.getHistory('d1', 2)).toHaveLength(2);
  });

  it('enforces maxPerDevice cap', () => {
    const s = createSqliteBbasStorage(':memory:', 3);
    for (let i = 0; i < 5; i++) s.save(snap('d1'));
    expect(s.getHistory('d1')).toHaveLength(3);
  });

  it('getLatest returns most recent or null', () => {
    const s = createSqliteBbasStorage(':memory:');
    expect(s.getLatest('d1')).toBeNull();
    const a = snap('d1');
    const b = snap('d1');
    s.save(a);
    s.save(b);
    expect(s.getLatest('d1')?.id).toBe(b.id);
  });

  it('size returns count of distinct devices', () => {
    const s = createSqliteBbasStorage(':memory:');
    expect(s.size()).toBe(0);
    s.save(snap('d1'));
    s.save(snap('d2'));
    s.save(snap('d1'));
    expect(s.size()).toBe(2);
  });

  it('clear(deviceId) removes only that device', () => {
    const s = createSqliteBbasStorage(':memory:');
    s.save(snap('d1'));
    s.save(snap('d2'));
    s.clear('d1');
    expect(s.getHistory('d1')).toHaveLength(0);
    expect(s.getHistory('d2')).toHaveLength(1);
  });

  it('enrichment JSON-round-trips correctly', () => {
    const s = createSqliteBbasStorage(':memory:');
    const original = snap('d1');
    original.enrichment.botScore = 42;
    original.enrichment.botFactors = ['headless_browser'];
    s.save(original);
    const got = s.getLatest('d1');
    expect(got?.enrichment.botScore).toBe(42);
    expect(got?.enrichment.botFactors).toEqual(['headless_browser']);
  });
});
