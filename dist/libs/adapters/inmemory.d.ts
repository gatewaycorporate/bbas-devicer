import type { BbasStorage } from '../../types.js';
export type { BbasStorage };
/**
 * Create a synchronous in-memory {@link BbasStorage}.
 *
 * Snapshots are stored newest-first per device. When `maxPerDevice` is
 * exceeded the oldest entries are trimmed automatically.
 *
 * @param maxPerDevice - Maximum snapshots per deviceId. Default: `50`
 */
export declare function createBbasStorage(maxPerDevice?: number): BbasStorage;
//# sourceMappingURL=inmemory.d.ts.map