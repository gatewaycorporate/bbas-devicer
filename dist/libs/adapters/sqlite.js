// ────────────────────────────────────────────────────────────
//  bbas-devicer — SQLite storage adapter (sync, better-sqlite3)
// ────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
// Use createRequire so this ESM module can load the CJS better-sqlite3 package.
const _require = createRequire(import.meta.url);
/**
 * Create a synchronous {@link BbasStorage} backed by a SQLite database via
 * `better-sqlite3`.
 *
 * Pass `':memory:'` for an ephemeral in-process store (useful for testing)
 * or a file-system path for persistent storage.
 *
 * @param dbPath       - SQLite file path or `':memory:'`. Default: `':memory:'`
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: `50`
 */
export function createSqliteBbasStorage(dbPath = ':memory:', maxPerDevice = 50) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = _require('better-sqlite3');
    const db = Database(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS bbas_snapshots (
      id          TEXT PRIMARY KEY,
      device_id   TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      enrichment  TEXT NOT NULL
    )
  `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_bbas_device ON bbas_snapshots(device_id, timestamp DESC)');
    const stmtInsert = db.prepare('INSERT INTO bbas_snapshots (id, device_id, timestamp, enrichment) VALUES (?, ?, ?, ?)');
    const stmtTrim = db.prepare(`
    DELETE FROM bbas_snapshots
    WHERE device_id = ?
    AND id NOT IN (
      SELECT id FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?
    )
  `);
    const stmtHistory = db.prepare('SELECT * FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC');
    const stmtHistoryLimit = db.prepare('SELECT * FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?');
    const stmtLatest = db.prepare('SELECT * FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1');
    const stmtDeleteDevice = db.prepare('DELETE FROM bbas_snapshots WHERE device_id = ?');
    const stmtDeviceCount = db.prepare('SELECT COUNT(DISTINCT device_id) AS n FROM bbas_snapshots');
    function rowToSnapshot(row) {
        return {
            id: row['id'],
            deviceId: row['device_id'],
            timestamp: new Date(row['timestamp']),
            enrichment: JSON.parse(row['enrichment']),
        };
    }
    return {
        save(snapshot) {
            const id = snapshot.id || randomUUID();
            const ts = snapshot.timestamp instanceof Date
                ? snapshot.timestamp.toISOString()
                : String(snapshot.timestamp);
            stmtInsert.run(id, snapshot.deviceId, ts, JSON.stringify(snapshot.enrichment));
            stmtTrim.run(snapshot.deviceId, snapshot.deviceId, maxPerDevice);
        },
        getHistory(deviceId, limit) {
            const rows = (limit !== undefined
                ? stmtHistoryLimit.all(deviceId, limit)
                : stmtHistory.all(deviceId));
            return rows.map(rowToSnapshot);
        },
        getLatest(deviceId) {
            const row = stmtLatest.get(deviceId);
            return row ? rowToSnapshot(row) : null;
        },
        clear(deviceId) {
            stmtDeleteDevice.run(deviceId);
        },
        size() {
            const row = stmtDeviceCount.get();
            return row.n;
        },
    };
}
//# sourceMappingURL=sqlite.js.map