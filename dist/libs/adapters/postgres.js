// ────────────────────────────────────────────────────────────
//  bbas-devicer — PostgreSQL storage adapter (async)
// ────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
function rowToSnapshot(row) {
    return {
        id: row['id'],
        deviceId: (row['device_id'] ?? row['deviceId']),
        timestamp: new Date(row['timestamp']),
        enrichment: typeof row['enrichment'] === 'string'
            ? JSON.parse(row['enrichment'])
            : row['enrichment'],
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
export function createPostgresBbasStorage(pool, maxPerDevice = 50) {
    return {
        async init() {
            await pool.query(`
        CREATE TABLE IF NOT EXISTS bbas_snapshots (
          id          TEXT        PRIMARY KEY,
          device_id   TEXT        NOT NULL,
          timestamp   TIMESTAMPTZ NOT NULL,
          enrichment  JSONB       NOT NULL
        )
      `);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_bbas_device ON bbas_snapshots(device_id, timestamp DESC)');
        },
        async save(snapshot) {
            const id = snapshot.id || randomUUID();
            await pool.query('INSERT INTO bbas_snapshots (id, device_id, timestamp, enrichment) VALUES ($1, $2, $3, $4)', [id, snapshot.deviceId, snapshot.timestamp, JSON.stringify(snapshot.enrichment)]);
            await pool.query(`DELETE FROM bbas_snapshots
         WHERE device_id = $1
         AND id NOT IN (
           SELECT id FROM bbas_snapshots WHERE device_id = $1
           ORDER BY timestamp DESC LIMIT $2
         )`, [snapshot.deviceId, maxPerDevice]);
        },
        async getHistory(deviceId, limit = 50) {
            const res = await pool.query('SELECT * FROM bbas_snapshots WHERE device_id = $1 ORDER BY timestamp DESC LIMIT $2', [deviceId, limit]);
            return res.rows.map(rowToSnapshot);
        },
        async getLatest(deviceId) {
            const res = await pool.query('SELECT * FROM bbas_snapshots WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1', [deviceId]);
            return res.rows.length === 0 ? null : rowToSnapshot(res.rows[0]);
        },
        async clear(deviceId) {
            await pool.query('DELETE FROM bbas_snapshots WHERE device_id = $1', [deviceId]);
        },
        async size() {
            const res = await pool.query('SELECT COUNT(DISTINCT device_id)::int AS n FROM bbas_snapshots');
            return res.rows[0].n;
        },
        async close() {
            await pool.end?.();
        },
    };
}
//# sourceMappingURL=postgres.js.map