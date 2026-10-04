/**
 * Chat thread window helpers.
 * Store order stays oldest → newest. The thread FlatList is inverted, so
 * index 0 is the newest message and the initial offset is already the bottom.
 */

/** How close to the newest edge (inverted offset 0) counts as "at the latest". */
export const CHAT_NEAR_LATEST_PX = 96;

export function toNewestFirst<T>(chronological: readonly T[]): T[] {
  if (chronological.length <= 1) {
    return chronological as T[];
  }
  return [...chronological].reverse();
}

/**
 * Descending Supabase page (newest row first) → oldest-first store order.
 * `order(created_at asc).limit(n)` would keep the oldest page instead.
 */
export function chronologicalFromNewestQuery<T>(newestFirst: readonly T[]): T[] {
  if (newestFirst.length <= 1) {
    return newestFirst as T[];
  }
  return [...newestFirst].reverse();
}

/** Date chip sits above the first message of a day. `list` is newest-first. */
export function showChatDateSeparator(
  list: readonly {timestamp: Date}[],
  index: number,
  sameDay: (a: Date, b: Date) => boolean,
): boolean {
  const current = list[index];
  if (!current) {
    return false;
  }
  const older = list[index + 1];
  if (!older) {
    return true;
  }
  return !sameDay(current.timestamp, older.timestamp);
}

export function isNearLatestEdge(offsetY: number): boolean {
  return offsetY <= CHAT_NEAR_LATEST_PX;
}
