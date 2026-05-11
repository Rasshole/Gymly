import type {ActiveUser} from '@/components/checkin/ActiveUsersList';

/** Self first, then accepted friends, then others. Within each tier: earliest check-in first; stable `id` tiebreaker. */
export function participantDisplayPriority(
  userId: string,
  currentUserId: string | undefined,
  friendIds: Set<string>,
): number {
  if (currentUserId && userId === currentUserId) {
    return 0;
  }
  if (friendIds.has(userId)) {
    return 1;
  }
  return 2;
}

function checkedInAtMs(iso: string | undefined | null): number {
  if (!iso) {
    return Number.MAX_SAFE_INTEGER;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

export function sortActiveUsersForDisplay(
  users: ActiveUser[],
  currentUserId: string | undefined,
  friendIds: Set<string>,
): ActiveUser[] {
  const deduped = Array.from(new Map(users.map(u => [u.id, u])).values());
  return [...deduped].sort((a, b) => {
    const pa = participantDisplayPriority(a.id, currentUserId, friendIds);
    const pb = participantDisplayPriority(b.id, currentUserId, friendIds);
    if (pa !== pb) {
      return pa - pb;
    }
    const ta = checkedInAtMs(a.startedAt);
    const tb = checkedInAtMs(b.startedAt);
    if (ta !== tb) {
      return ta - tb;
    }
    return a.id.localeCompare(b.id);
  });
}

export function sortActiveNowFriendRows<T extends {userId: string; startedAt: string}>(
  rows: T[],
  currentUserId: string | undefined,
  friendIds: Set<string>,
): T[] {
  const deduped = Array.from(new Map(rows.map(r => [r.userId, r])).values());
  return [...deduped].sort((a, b) => {
    const pa = participantDisplayPriority(a.userId, currentUserId, friendIds);
    const pb = participantDisplayPriority(b.userId, currentUserId, friendIds);
    if (pa !== pb) {
      return pa - pb;
    }
    const ta = checkedInAtMs(a.startedAt);
    const tb = checkedInAtMs(b.startedAt);
    if (ta !== tb) {
      return ta - tb;
    }
    return a.userId.localeCompare(b.userId);
  });
}
