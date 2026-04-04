// ────────────────────────────────────────────────────────────
//  bbas-devicer — Redis storage adapter (async, ioredis)
// ────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
const KEY_PREFIX = 'bbas:device:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
function deviceKey(deviceId) {
    return `${KEY_PREFIX}${deviceId}`;
}
function parseSnapshot(raw) {
    const s = JSON.parse(raw);
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
export function createRedisBbasStorage(client, maxPerDevice = 50, ttlSeconds = DEFAULT_TTL_SECONDS) {
    return {
        async init() {
            // No schema setup required for Redis.
        },
        async save(snapshot) {
            const id = snapshot.id || randomUUID();
            const s = { ...snapshot, id };
            const key = deviceKey(s.deviceId);
            const score = s.timestamp instanceof Date
                ? s.timestamp.getTime()
                : new Date(s.timestamp).getTime();
            await client.zadd(key, score, JSON.stringify(s));
            await client.expire(key, ttlSeconds);
            const count = await client.zcard(key);
            if (count > maxPerDevice) {
                await client.zremrangebyrank(key, 0, count - maxPerDevice - 1);
            }
        },
        async getHistory(deviceId, limit = 50) {
            const raws = await client.zrevrange(deviceKey(deviceId), 0, limit - 1);
            return raws.map(parseSnapshot);
        },
        async getLatest(deviceId) {
            const raws = await client.zrevrange(deviceKey(deviceId), 0, 0);
            return raws.length === 0 ? null : parseSnapshot(raws[0]);
        },
        async clear(deviceId) {
            await client.del(deviceKey(deviceId));
        },
        async size() {
            let cursor = '0';
            let count = 0;
            do {
                const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', '100');
                cursor = nextCursor;
                count += keys.length;
            } while (cursor !== '0');
            return count;
        },
        async close() {
            await client.quit();
        },
    };
}
//# sourceMappingURL=redis.js.map