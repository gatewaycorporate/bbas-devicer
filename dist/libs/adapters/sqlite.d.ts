import type { BbasStorage } from '../../types.js';
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
export declare function createSqliteBbasStorage(dbPath?: string, maxPerDevice?: number): BbasStorage;
//# sourceMappingURL=sqlite.d.ts.map