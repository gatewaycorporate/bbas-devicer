// ────────────────────────────────────────────────────────────
//  velocity — sliding-window request rate tracker
// ────────────────────────────────────────────────────────────
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
export function computeVelocitySignals(history, windowMs, maxRequestsPerWindow) {
    const windowStart = Date.now() - windowMs;
    const requestCount = history.filter((s) => s.timestamp.getTime() >= windowStart).length;
    const requestsPerMinute = requestCount / (windowMs / 60_000);
    const exceedsThreshold = requestCount >= maxRequestsPerWindow;
    return { requestCount, windowMs, requestsPerMinute, exceedsThreshold };
}
//# sourceMappingURL=velocity.js.map