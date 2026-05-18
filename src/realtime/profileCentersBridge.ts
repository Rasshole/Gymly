/**
 * Signalerer at en brugers centre er ændret (egen gem eller realtime).
 */

type Listener = () => void;

const byUser = new Map<string, Set<Listener>>();

export function subscribeProfileCenters(userId: string, fn: () => void): () => void {
  let set = byUser.get(userId);
  if (!set) {
    set = new Set();
    byUser.set(userId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set?.size === 0) {
      byUser.delete(userId);
    }
  };
}

export function emitProfileCentersChanged(userId: string): void {
  const set = byUser.get(userId);
  if (!set) {
    return;
  }
  set.forEach(fn => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
