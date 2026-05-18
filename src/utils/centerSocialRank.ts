/**
 * Sortering af centre: venner > aktive > afstand (højere score = bedre).
 */
export type LiveCounts = {total: number; friends: number};

const FRIEND_WEIGHT = 100_000;
const ACTIVE_WEIGHT = 120;
/** Afstand i meter — lavere bidrag når center er tættere på. */
const DIST_SCALE = 180;

export function centerSocialRankScore(live: LiveCounts, distanceMeters: number): number {
  const friends = Math.max(0, live.friends);
  const total = Math.max(0, live.total);
  const dist = Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters) : 800_000;
  const distanceTerm = dist / DIST_SCALE;
  return friends * FRIEND_WEIGHT + total * ACTIVE_WEIGHT - distanceTerm;
}
