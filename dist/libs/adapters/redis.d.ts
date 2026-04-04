import type { AsyncBbasStorage } from '../../types.js';
/**
 * Minimal duck-typed interface for an ioredis Redis client.
 */
export interface RedisLike {
    zadd(key: string, score: number, member: string): Promise<number>;
    zrevrange(key: string, start: number, stop: number): Promise<string[]>;
    zcard(key: string): Promise<number>;
    zremrangebyrank(key: string, start: number, stop: number): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    del(...keys: string[]): Promise<number>;
    scan(cursor: string, ...args: string[]): Promise<[string, string[]]>;
    quit(): Promise<'OK'>;
}
/**
 * Create an {@link AsyncBbasStorage} backed by Redis via `ioredis`.
 *
 * **Key schema:** `bbas:device:<deviceId>` — sorted set (score = timestamp ms).
 *
 * @param client       - An `ioredis` Redis instance or compatible duck-typed client.
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: `50`
 * @param ttlSeconds   - TTL for device keys in seconds. Default: 90 days
 */
export declare function createRedisBbasStorage(client: RedisLike, maxPerDevice?: number, ttlSeconds?: number): AsyncBbasStorage;
//# sourceMappingURL=redis.d.ts.map