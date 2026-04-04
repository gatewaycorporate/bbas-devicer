// ────────────────────────────────────────────────────────────
//  bbas-devicer — Redis storage adapter (async, ioredis)
// ────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { BbasSnapshot, AsyncBbasStorage } from '../../types.js';

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

const KEY_PREFIX = 'bbas:device:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

function deviceKey(deviceId: string): string {
  return `${KEY_PREFIX}${deviceId}`;
}

function parseSnapshot(raw: string): BbasSnapshot {
  const s = JSON.parse(raw) as BbasSnapshot & { timestamp: string };
  return { ...s, timestamp: new Date(s.timestamp) };
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
export function createRedisBbasStorage(
  client: RedisLike,
  maxPerDevice: number = 50,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): AsyncBbasStorage {
  return {
    async init(): Promise<void> {
      // No schema setup required for Redis.
    },

    async save(snapshot: BbasSnapshot): Promise<void> {
      const id = snapshot.id || randomUUID();
      const s: BbasSnapshot = { ...snapshot, id };
      const key = deviceKey(s.deviceId);
      const score =
        s.timestamp instanceof Date
          ? s.timestamp.getTime()
          : new Date(s.timestamp).getTime();

      await client.zadd(key, score, JSON.stringify(s));
      await client.expire(key, ttlSeconds);

      const count = await client.zcard(key);
      if (count > maxPerDevice) {
        await client.zremrangebyrank(key, 0, count - maxPerDevice - 1);
      }
    },

    async getHistory(deviceId: string, limit = 50): Promise<BbasSnapshot[]> {
      const raws = await client.zrevrange(deviceKey(deviceId), 0, limit - 1);
      return raws.map(parseSnapshot);
    },

    async getLatest(deviceId: string): Promise<BbasSnapshot | null> {
      const raws = await client.zrevrange(deviceKey(deviceId), 0, 0);
      return raws.length === 0 ? null : parseSnapshot(raws[0]);
    },

    async clear(deviceId: string): Promise<void> {
      await client.del(deviceKey(deviceId));
    },

    async size(): Promise<number> {
      let cursor = '0';
      let count = 0;
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          `${KEY_PREFIX}*`,
          'COUNT',
          '100',
        );
        cursor = nextCursor;
        count += keys.length;
      } while (cursor !== '0');
      return count;
    },

    async close(): Promise<void> {
      await client.quit();
    },
  };
}
