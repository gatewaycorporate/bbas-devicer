// ────────────────────────────────────────────────────────────
//  bbas-devicer — in-memory storage adapter (sync)
// ────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { BbasSnapshot, BbasStorage } from '../../types.js';

export type { BbasStorage };

/**
 * Create a synchronous in-memory {@link BbasStorage}.
 *
 * Snapshots are stored newest-first per device. When `maxPerDevice` is
 * exceeded the oldest entries are trimmed automatically.
 *
 * @param maxPerDevice - Maximum snapshots per deviceId. Default: `50`
 */
export function createBbasStorage(maxPerDevice: number = 50): BbasStorage {
  const store = new Map<string, BbasSnapshot[]>();

  function getList(deviceId: string): BbasSnapshot[] {
    if (!store.has(deviceId)) store.set(deviceId, []);
    return store.get(deviceId)!;
  }

  return {
    save(snapshot: BbasSnapshot): void {
      const list = getList(snapshot.deviceId);
      // Ensure the snapshot has an id
      const s: BbasSnapshot = snapshot.id ? snapshot : { ...snapshot, id: randomUUID() };
      list.unshift(s);
      if (list.length > maxPerDevice) list.splice(maxPerDevice);
    },

    getHistory(deviceId: string, limit?: number): BbasSnapshot[] {
      const list = getList(deviceId);
      return limit !== undefined ? list.slice(0, limit) : list.slice();
    },

    getLatest(deviceId: string): BbasSnapshot | null {
      return getList(deviceId)[0] ?? null;
    },

    clear(deviceId: string): void {
      store.delete(deviceId);
    },

    size(): number {
      return store.size;
    },
  };
}
