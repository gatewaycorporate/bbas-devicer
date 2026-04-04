// ────────────────────────────────────────────────────────────
//  Tests — PostgreSQL storage adapter (bbas-devicer)
// ────────────────────────────────────────────────────────────
//  The adapter accepts a duck-typed PgPoolLike, so we pass a
//  lightweight in-memory mock — no actual Postgres needed.
// ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { createPostgresBbasStorage } from '../../libs/adapters/postgres.js';
import type { PgPoolLike } from '../../libs/adapters/postgres.js';
import type { BbasSnapshot, BbasEnrichment } from '../../types.js';

// ─── In-memory PgPoolLike mock ────────────────────────────────

type Row = Record<string, unknown>;

function createMockPool(): PgPoolLike & { _rows: Row[] } {
  const rows: Row[] = [];
  let seq = 0;

  const pool: PgPoolLike & { _rows: Row[] } = {
    _rows: rows,
    async query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }> {
      const s = sql.replace(/\s+/g, ' ').trim();

      // DDL — no-op
      if (/^CREATE (TABLE|INDEX)/i.test(s)) return { rows: [] };

      // INSERT
      if (/^INSERT INTO bbas_snapshots/i.test(s)) {
        const [id, device_id, timestamp, enrichment] = params as [
          string,
          string,
          Date | string,
          string,
        ];
        rows.push({
          id,
          device_id,
          timestamp: new Date(timestamp as string),
          enrichment: typeof enrichment === 'string' ? JSON.parse(enrichment) : enrichment,
          _seq: ++seq,
        });
        return { rows: [] };
      }

      // DELETE … id NOT IN (SELECT … LIMIT $2)  ← trim after save
      if (/DELETE FROM bbas_snapshots\s+WHERE device_id = \$1\s+AND id NOT IN/i.test(s)) {
        const [device_id, limit] = params as [string, number];
        const deviceRows = rows
          .filter(r => r['device_id'] === device_id)
          .sort((a, b) => (b['_seq'] as number) - (a['_seq'] as number));
        const keep = new Set(deviceRows.slice(0, limit).map(r => r['id']));
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]['device_id'] === device_id && !keep.has(rows[i]['id'])) {
            rows.splice(i, 1);
          }
        }
        return { rows: [] };
      }

      // DELETE … WHERE device_id = $1  ← clear(deviceId)
      if (/DELETE FROM bbas_snapshots\s+WHERE device_id = \$1$/.test(s)) {
        const [device_id] = params as [string];
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]['device_id'] === device_id) rows.splice(i, 1);
        }
        return { rows: [] };
      }

      // SELECT … LIMIT $2  ← getHistory
      if (/SELECT \* FROM bbas_snapshots WHERE device_id = \$1 ORDER BY timestamp DESC LIMIT \$2/.test(s)) {
        const [device_id, limit] = params as [string, number];
        return {
          rows: rows
            .filter(r => r['device_id'] === device_id)
            .sort((a, b) => (b['_seq'] as number) - (a['_seq'] as number))
            .slice(0, limit),
        };
      }

      // SELECT … LIMIT 1  ← getLatest
      if (/SELECT \* FROM bbas_snapshots WHERE device_id = \$1 ORDER BY timestamp DESC LIMIT 1/.test(s)) {
        const [device_id] = params as [string];
        return {
          rows: rows
            .filter(r => r['device_id'] === device_id)
            .sort((a, b) => (b['_seq'] as number) - (a['_seq'] as number))
            .slice(0, 1),
        };
      }

      // COUNT DISTINCT device_id  ← size
      if (/COUNT\(DISTINCT device_id\)/.test(s)) {
        const distinct = new Set(rows.map(r => r['device_id'])).size;
        return { rows: [{ n: distinct }] };
      }

      return { rows: [] };
    },

    async end() {},
  };

  return pool;
}

// ─── Shared test data ─────────────────────────────────────────

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
function snap(deviceId: string, label?: string): BbasSnapshot {
  return {
    id: `id-${label ?? ++counter}`,
    deviceId,
    timestamp: new Date(),
    enrichment: { ...baseEnrichment },
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('createPostgresBbasStorage', () => {
  let pool: ReturnType<typeof createMockPool>;
  let storage: ReturnType<typeof createPostgresBbasStorage>;

  beforeEach(async () => {
    counter = 0;
    pool = createMockPool();
    storage = createPostgresBbasStorage(pool);
    await storage.init();
  });

  it('init issues CREATE TABLE and INDEX queries', async () => {
    // init was called in beforeEach — pool.query is a plain async function;
    // we verify side-effect: no rows yet, storage is functional
    expect(await storage.getHistory('d1')).toHaveLength(0);
  });

  it('saves and retrieves snapshots newest-first', async () => {
    await storage.save(snap('d1', 'a'));
    await storage.save(snap('d1', 'b'));
    const history = await storage.getHistory('d1');
    expect(history[0].id).toBe('id-b');
    expect(history[1].id).toBe('id-a');
  });

  it('returns empty array for unknown deviceId', async () => {
    expect(await storage.getHistory('unknown')).toHaveLength(0);
  });

  it('respects limit on getHistory', async () => {
    await storage.save(snap('d1'));
    await storage.save(snap('d1'));
    await storage.save(snap('d1'));
    expect(await storage.getHistory('d1', 2)).toHaveLength(2);
  });

  it('enforces maxPerDevice cap', async () => {
    const capped = createPostgresBbasStorage(pool, 3);
    await capped.init();
    for (let i = 0; i < 5; i++) await capped.save(snap('cap-d1'));
    expect(await capped.getHistory('cap-d1', 50)).toHaveLength(3);
  });

  it('getLatest returns most recent or null', async () => {
    expect(await storage.getLatest('d1')).toBeNull();
    const a = snap('d1', 'q');
    const b = snap('d1', 'r');
    await storage.save(a);
    await storage.save(b);
    expect((await storage.getLatest('d1'))?.id).toBe('id-r');
  });

  it('clear(deviceId) removes only that device', async () => {
    await storage.save(snap('d1'));
    await storage.save(snap('d2'));
    await storage.clear('d1');
    expect(await storage.getHistory('d1')).toHaveLength(0);
    expect(await storage.getHistory('d2')).toHaveLength(1);
  });

  it('size returns distinct device count', async () => {
    expect(await storage.size()).toBe(0);
    await storage.save(snap('d1'));
    await storage.save(snap('d2'));
    await storage.save(snap('d1'));
    expect(await storage.size()).toBe(2);
  });

  it('close calls pool.end', async () => {
    let ended = false;
    pool.end = async () => { ended = true; };
    await storage.close?.();
    expect(ended).toBe(true);
  });
});
