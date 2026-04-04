import type { AsyncBbasStorage, BbasSnapshot, VelocitySignals } from '../types.js';
/**
 * Record a new request for `deviceId` and return the current velocity
 * signals for the configured sliding window.
 *
 * This function reads history from storage, counts snapshots within the
 * window, and returns the computed signals. It does **not** persist a new
 * snapshot — that is done in `BbasManager.analyze()` after all signals are
 * assembled.
 *
 * @param history             - Pre-fetched snapshot history for this device.
 * @param windowMs            - Sliding window length in milliseconds.
 * @param maxRequestsPerWindow - Threshold above which `exceedsThreshold` fires.
 */
export declare function computeVelocitySignals(history: BbasSnapshot[], windowMs: number, maxRequestsPerWindow: number): VelocitySignals;
export type { AsyncBbasStorage };
//# sourceMappingURL=velocity.d.ts.map