/**
 * Minimal timestamped startup markers (Debug only).
 * Search Xcode console for `[GymlyStartup]`.
 */
const t0 =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as {performance?: {now?: () => number}}).performance?.now ===
    'function'
    ? (globalThis as {performance: {now: () => number}}).performance.now()
    : Date.now();

export function startupMark(step: string, extra?: Record<string, unknown>): void {
  if (!__DEV__) {
    return;
  }
  const now =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as {performance?: {now?: () => number}}).performance?.now ===
      'function'
      ? (globalThis as {performance: {now: () => number}}).performance.now()
      : Date.now();
  const ms = Math.round(now - t0);
  if (extra && Object.keys(extra).length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[GymlyStartup +${ms}ms] ${step}`, extra);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[GymlyStartup +${ms}ms] ${step}`);
  }
}
