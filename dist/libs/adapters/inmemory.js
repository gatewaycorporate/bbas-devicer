// ────────────────────────────────────────────────────────────
//  bbas-devicer — in-memory storage adapter (sync)
// ────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
/**
 * Create a synchronous in-memory {@link BbasStorage}.
 *
 * Snapshots are stored newest-first per device. When `maxPerDevice` is
 * exceeded the oldest entries are trimmed automatically.
 *
 * @param maxPerDevice - Maximum snapshots per deviceId. Default: `50`
 */
export function createBbasStorage(maxPerDevice = 50) {
    const store = new Map();
    function getList(deviceId) {
        if (!store.has(deviceId))
            store.set(deviceId, []);
        return store.get(deviceId);
    }
    return {
        save(snapshot) {
            const list = getList(snapshot.deviceId);
            // Ensure the snapshot has an id
            const s = snapshot.id ? snapshot : { ...snapshot, id: randomUUID() };
            list.unshift(s);
            if (list.length > maxPerDevice)
                list.splice(maxPerDevice);
        },
        getHistory(deviceId, limit) {
            const list = getList(deviceId);
            return limit !== undefined ? list.slice(0, limit) : list.slice();
        },
        getLatest(deviceId) {
            return getList(deviceId)[0] ?? null;
        },
        clear(deviceId) {
            store.delete(deviceId);
        },
        size() {
            return store.size;
        },
    };
}
//# sourceMappingURL=inmemory.js.map