import type { AsyncBbasStorage } from '../../types.js';
export type { AsyncBbasStorage };
/**
 * Minimal duck-typed interface for a `pg` Pool or PoolClient.
 * Avoids a hard runtime dependency on the `pg` package.
 */
export interface PgPoolLike {
    query(text: string, values?: unknown[]): Promise<{
        rows: Record<string, unknown>[];
    }>;
    end?(): Promise<void>;
}
/**
 * Create an {@link AsyncBbasStorage} backed by PostgreSQL via the `pg` package.
 *
 * The adapter creates the `bbas_snapshots` table and its index on `init()`.
 *
 * @param pool         - A `pg.Pool` instance or compatible duck-typed pool.
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: `50`
 */
export declare function createPostgresBbasStorage(pool: PgPoolLike, maxPerDevice?: number): AsyncBbasStorage;
//# sourceMappingURL=postgres.d.ts.map