// ────────────────────────────────────────────────────────────
//  Tests — in-memory storage adapter (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { createBbasStorage } from '../../libs/adapters/inmemory.js';
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

function snap(deviceId: string, label: string): BbasSnapshot {
  return {
    id: `id-${label}`,
    deviceId,
    timestamp: new Date(),
    enrichment: { ...baseEnrichment },
  };
}

describe('createBbasStorage', () => {
  it('saves and retrieves snapshots newest-first', () => {
    const s = createBbasStorage();
    s.save(snap('d1', 'a'));
    s.save(snap('d1', 'b'));
    const history = s.getHistory('d1');
    expect(history[0].id).toBe('id-b');
    expect(history[1].id).toBe('id-a');
  });

  it('returns empty array for unknown deviceId', () => {
    const s = createBbasStorage();
    expect(s.getHistory('unknown')).toHaveLength(0);
  });

  it('respects limit on getHistory', () => {
    const s = createBbasStorage();
    s.save(snap('d1', 'a'));
    s.save(snap('d1', 'b'));
    s.save(snap('d1', 'c'));
    expect(s.getHistory('d1', 2)).toHaveLength(2);
  });

  it('enforces maxPerDevice cap', () => {
    const s = createBbasStorage(3);
    for (let i = 0; i < 5; i++) s.save(snap('d1', String(i)));
    expect(s.getHistory('d1')).toHaveLength(3);
  });

  it('getLatest returns most recent or null', () => {
    const s = createBbasStorage();
    expect(s.getLatest('d1')).toBeNull();
    s.save(snap('d1', 'a'));
    s.save(snap('d1', 'b'));
    expect(s.getLatest('d1')?.id).toBe('id-b');
  });

  it('size reflects distinct device count', () => {
    const s = createBbasStorage();
    expect(s.size()).toBe(0);
    s.save(snap('d1', 'a'));
    s.save(snap('d2', 'b'));
    expect(s.size()).toBe(2);
    s.save(snap('d1', 'c'));
    expect(s.size()).toBe(2);
  });

  it('clear(deviceId) removes only that device', () => {
    const s = createBbasStorage();
    s.save(snap('d1', 'a'));
    s.save(snap('d2', 'b'));
    s.clear('d1');
    // Check size before calling getHistory (getHistory lazily re-inserts an empty list)
    expect(s.size()).toBe(1);
    expect(s.getHistory('d1')).toHaveLength(0);
    expect(s.getHistory('d2')).toHaveLength(1);
  });

  it('auto-generates an id when none is provided', () => {
    const s = createBbasStorage();
    const raw: BbasSnapshot = { ...snap('d1', 'x'), id: '' };
    s.save(raw);
    const [saved] = s.getHistory('d1');
    expect(saved.id).toBeTruthy();
  });
});
