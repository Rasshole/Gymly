/**
 * Bridges GymlyRealtimeHub → useUserTrainingStats without duplicating postgres channels.
 */

const listeners = new Map<string, Set<() => void>>();

export function subscribeProfileStatsSelf(userId: string, fn: () => void): () => void {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(fn);
  return () => {
    const s = listeners.get(userId);
    if (!s) {
      return;
    }
    s.delete(fn);
    if (s.size === 0) {
      listeners.delete(userId);
    }
  };
}

export function emitProfileStatsSelf(userId: string): void {
  const set = listeners.get(userId);
  if (!set) {
    return;
  }
  for (const fn of set) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
