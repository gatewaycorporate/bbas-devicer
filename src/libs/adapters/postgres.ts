// ────────────────────────────────────────────────────────────
//  bbas-devicer — PostgreSQL storage adapter (async)
// ────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { BbasSnapshot, AsyncBbasStorage } from '../../types.js';

export type { AsyncBbasStorage };

/**
 * Minimal duck-typed interface for a `pg` Pool or PoolClient.
 * Avoids a hard runtime dependency on the `pg` package.
 */
export interface PgPoolLike {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
}

function rowToSnapshot(row: Record<string, unknown>): BbasSnapshot {
  return {
    id: row['id'] as string,
    deviceId: (row['device_id'] ?? row['deviceId']) as string,
    timestamp: new Date(row['timestamp'] as string),
    enrichment:
      typeof row['enrichment'] === 'string'
        ? (JSON.parse(row['enrichment'] as string) as BbasSnapshot['enrichment'])
        : (row['enrichment'] as BbasSnapshot['enrichment']),
  };
}

/**
 * Create an {@link AsyncBbasStorage} backed by PostgreSQL via the `pg` package.
 *
 * The adapter creates the `bbas_snapshots` table and its index on `init()`.
 *
 * @param pool         - A `pg.Pool` instance or compatible duck-typed pool.
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: `50`
 */
export function createPostgresBbasStorage(
  pool: PgPoolLike,
  maxPerDevice: number = 50,
): AsyncBbasStorage {
  return {
    async init(): Promise<void> {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bbas_snapshots (
          id          TEXT        PRIMARY KEY,
          device_id   TEXT        NOT NULL,
          timestamp   TIMESTAMPTZ NOT NULL,
          enrichment  JSONB       NOT NULL
        )
      `);
      await pool.query(
        'CREATE INDEX IF NOT EXISTS idx_bbas_device ON bbas_snapshots(device_id, timestamp DESC)',
      );
    },

    async save(snapshot: BbasSnapshot): Promise<void> {
      const id = snapshot.id || randomUUID();
      await pool.query(
        'INSERT INTO bbas_snapshots (id, device_id, timestamp, enrichment) VALUES ($1, $2, $3, $4)',
        [id, snapshot.deviceId, snapshot.timestamp, JSON.stringify(snapshot.enrichment)],
      );
      await pool.query(
        `DELETE FROM bbas_snapshots
         WHERE device_id = $1
         AND id NOT IN (
           SELECT id FROM bbas_snapshots WHERE device_id = $1
           ORDER BY timestamp DESC LIMIT $2
         )`,
        [snapshot.deviceId, maxPerDevice],
      );
    },

    async getHistory(deviceId: string, limit = 50): Promise<BbasSnapshot[]> {
      const res = await pool.query(
        'SELECT * FROM bbas_snapshots WHERE device_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [deviceId, limit],
      );
      return res.rows.map(rowToSnapshot);
    },

    async getLatest(deviceId: string): Promise<BbasSnapshot | null> {
      const res = await pool.query(
        'SELECT * FROM bbas_snapshots WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1',
        [deviceId],
      );
      return res.rows.length === 0 ? null : rowToSnapshot(res.rows[0]);
    },

    async clear(deviceId: string): Promise<void> {
      await pool.query('DELETE FROM bbas_snapshots WHERE device_id = $1', [deviceId]);
    },

    async size(): Promise<number> {
      const res = await pool.query(
        'SELECT COUNT(DISTINCT device_id)::int AS n FROM bbas_snapshots',
      );
      return (res.rows[0] as { n: number }).n;
    },

    async close(): Promise<void> {
      await pool.end?.();
    },
  };
}
