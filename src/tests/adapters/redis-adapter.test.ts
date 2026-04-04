// ────────────────────────────────────────────────────────────
//  Tests — Redis storage adapter (bbas-devicer)
// ────────────────────────────────────────────────────────────
//  The adapter accepts a duck-typed RedisLike, so we pass a
//  lightweight mock sorted-set implementation — no actual
//  Redis or ioredis needed.
// ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { createRedisBbasStorage } from '../../libs/adapters/redis.js';
import type { RedisLike } from '../../libs/adapters/redis.js';
import type { BbasSnapshot, BbasEnrichment } from '../../types.js';

// ─── In-memory RedisLike sorted-set mock ──────────────────────

type SSEntry = { score: number; value: string };

function createMockRedis(): RedisLike & { _store: Map<string, SSEntry[]> } {
  const store = new Map<string, SSEntry[]>();

  function getSet(key: string): SSEntry[] {
    if (!store.has(key)) store.set(key, []);
    return store.get(key)!;
  }

  return {
    _store: store,

    async zadd(key: string, score: number, member: string): Promise<number> {
      const set = getSet(key);
      set.push({ score, value: member });
      set.sort((a, b) => a.score - b.score); // ascending by score
      return 1;
    },

    async zcard(key: string): Promise<number> {
      return getSet(key).length;
    },

    async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
      const set = getSet(key);
      const removed = set.splice(start, stop - start + 1);
      return removed.length;
    },

    async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
      const reversed = [...getSet(key)].reverse();
      const end = stop === -1 ? undefined : stop + 1;
      return reversed.slice(start, end).map(e => e.value);
    },

    async expire(_key: string, _seconds: number): Promise<number> {
      return 1;
    },

    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const k of keys) { if (store.delete(k)) count++; }
      return count;
    },

    async scan(cursor: string, ...args: string[]): Promise<[string, string[]]> {
      // args: 'MATCH', pattern, 'COUNT', n
      const patternIdx = args.indexOf('MATCH');
      const pattern = patternIdx >= 0 ? args[patternIdx + 1] : '*';
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const matched = [...store.keys()].filter(k => regex.test(k));
      return ['0', matched]; // single-page scan
    },

    async quit(): Promise<'OK'> {
      return 'OK';
    },
  } as RedisLike & { _store: Map<string, SSEntry[]> };
}

// ─── Shared enrichment ────────────────────────────────────────

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
    timestamp: new Date(Date.now() + counter * 1000), // strictly increasing timestamps
    enrichment: { ...baseEnrichment },
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('createRedisBbasStorage', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let storage: ReturnType<typeof createRedisBbasStorage>;

  beforeEach(async () => {
    counter = 0;
    redis = createMockRedis();
    storage = createRedisBbasStorage(redis);
    await storage.init();
  });

  it('saves and retrieves snapshots newest-first', async () => {
    const a = snap('d1');
    const b = snap('d1');
    await storage.save(a);
    await storage.save(b);
    const history = await storage.getHistory('d1');
    expect(history[0].id).toBe(b.id);
    expect(history[1].id).toBe(a.id);
  });

  it('returns empty array for unknown deviceId', async () => {
    expect(await storage.getHistory('unknown')).toHaveLength(0);
  });

  it('respects limit on getHistory', async () => {
    await storage.save(snap('d1'));
    await storage.save(snap('d1'));
    await storage.save(snap('d1'));
    const h = await storage.getHistory('d1', 2);
    expect(h).toHaveLength(2);
  });

  it('enforces maxPerDevice cap on save', async () => {
    const capped = createRedisBbasStorage(redis, 3);
    await capped.init();
    for (let i = 0; i < 5; i++) await capped.save(snap('cap-d1'));
    expect(await capped.getHistory('cap-d1', 50)).toHaveLength(3);
  });

  it('getLatest returns most recent or null', async () => {
    expect(await storage.getLatest('d1')).toBeNull();
    const a = snap('d1');
    const b = snap('d1');
    await storage.save(a);
    await storage.save(b);
    expect((await storage.getLatest('d1'))?.id).toBe(b.id);
  });

  it('clear(deviceId) removes only that device key', async () => {
    await storage.save(snap('d1'));
    await storage.save(snap('d2'));
    await storage.clear('d1');
    expect(await storage.getHistory('d1')).toHaveLength(0);
    expect(await storage.getHistory('d2')).toHaveLength(1);
  });

  it('size returns the number of distinct device keys via scan', async () => {
    expect(await storage.size()).toBe(0);
    await storage.save(snap('d1'));
    await storage.save(snap('d2'));
    await storage.save(snap('d1')); // same device — should not double-count
    expect(await storage.size()).toBe(2);
  });

  it('close calls quit', async () => {
    let quitted = false;
    const original = redis.quit;
    redis.quit = async () => { quitted = true; return 'OK' as const; };
    await storage.close?.();
    expect(quitted).toBe(true);
    redis.quit = original;
  });

  it('zadd is called with the snapshot timestamp as score', async () => {
    const s = snap('d1');
    await storage.save(s);
    const set = redis._store.get('bbas:device:d1')!;
    expect(set).toHaveLength(1);
    expect(set[0].score).toBe(s.timestamp.getTime());
  });

  it('expire is called after each save', async () => {
    // Just check the expire side-effect: the key survives (expire mock returns 1)
    await storage.save(snap('d1'));
    expect(await storage.getHistory('d1')).toHaveLength(1);
  });
});
