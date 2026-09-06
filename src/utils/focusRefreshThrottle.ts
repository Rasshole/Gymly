/**
 * Undgår tunge refetch på hvert tab-skift. Realtime hooks dækker live-opdateringer.
 */
const lastRefreshAt = new Map<string, number>();

export function isFocusRefreshStale(key: string, ttlMs = 45_000): boolean {
  const last = lastRefreshAt.get(key) ?? 0;
  return Date.now() - last >= ttlMs;
}

export function markFocusRefreshed(key: string): void {
  lastRefreshAt.set(key, Date.now());
}
