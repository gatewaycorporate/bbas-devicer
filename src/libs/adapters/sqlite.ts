// ────────────────────────────────────────────────────────────
//  bbas-devicer — SQLite storage adapter (sync, better-sqlite3)
// ────────────────────────────────────────────────────────────

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { BbasSnapshot, BbasStorage } from '../../types.js';

// Use createRequire so this ESM module can load the CJS better-sqlite3 package.
const _require = createRequire(import.meta.url);

// Minimal structural typing avoids a hard runtime dependency on @types/better-sqlite3
interface Sqlite3Database {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
}

type DatabaseFactory = (path: string, opts?: Record<string, unknown>) => Sqlite3Database;

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
export function createSqliteBbasStorage(
  dbPath: string = ':memory:',
  maxPerDevice: number = 50,
): BbasStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = _require('better-sqlite3') as DatabaseFactory;
  const db = Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bbas_snapshots (
      id          TEXT PRIMARY KEY,
      device_id   TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      enrichment  TEXT NOT NULL
    )
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_bbas_device ON bbas_snapshots(device_id, timestamp DESC)',
  );

  const stmtInsert = db.prepare(
    'INSERT INTO bbas_snapshots (id, device_id, timestamp, enrichment) VALUES (?, ?, ?, ?)',
  );
  const stmtTrim = db.prepare(`
    DELETE FROM bbas_snapshots
    WHERE device_id = ?
    AND id NOT IN (
      SELECT id FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?
    )
  `);
  const stmtHistory = db.prepare(
    'SELECT * FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC',
  );
  const stmtHistoryLimit = db.prepare(
    'SELECT * FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?',
  );
  const stmtLatest = db.prepare(
    'SELECT * FROM bbas_snapshots WHERE device_id = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1',
  );
  const stmtDeleteDevice = db.prepare(
    'DELETE FROM bbas_snapshots WHERE device_id = ?',
  );
  const stmtDeviceCount = db.prepare(
    'SELECT COUNT(DISTINCT device_id) AS n FROM bbas_snapshots',
  );

  function rowToSnapshot(row: Record<string, unknown>): BbasSnapshot {
    return {
      id: row['id'] as string,
      deviceId: row['device_id'] as string,
      timestamp: new Date(row['timestamp'] as string),
      enrichment: JSON.parse(row['enrichment'] as string) as BbasSnapshot['enrichment'],
    };
  }

  return {
    save(snapshot: BbasSnapshot): void {
      const id = snapshot.id || randomUUID();
      const ts =
        snapshot.timestamp instanceof Date
          ? snapshot.timestamp.toISOString()
          : String(snapshot.timestamp);
      stmtInsert.run(id, snapshot.deviceId, ts, JSON.stringify(snapshot.enrichment));
      stmtTrim.run(snapshot.deviceId, snapshot.deviceId, maxPerDevice);
    },

    getHistory(deviceId: string, limit?: number): BbasSnapshot[] {
      const rows = (
        limit !== undefined
          ? stmtHistoryLimit.all(deviceId, limit)
          : stmtHistory.all(deviceId)
      ) as Record<string, unknown>[];
      return rows.map(rowToSnapshot);
    },

    getLatest(deviceId: string): BbasSnapshot | null {
      const row = stmtLatest.get(deviceId) as Record<string, unknown> | undefined;
      return row ? rowToSnapshot(row) : null;
    },

    clear(deviceId: string): void {
      stmtDeleteDevice.run(deviceId);
    },

    size(): number {
      const row = stmtDeviceCount.get() as { n: number };
      return row.n;
    },
  };
}
