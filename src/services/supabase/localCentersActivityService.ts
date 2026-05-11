import {supabase} from '@/services/supabase/supabaseClient';
import {getMyFriendIds, getPublicProfilesByIds} from '@/services/supabase/friendService';
import {findGymById, formatGymDisplayName, normalizeGymBrand} from '@/utils/gymDisplay';
import {
  dedupeCheckInRowsByUserId,
  isEffectiveActiveCheckIn,
  runStaleActiveSessionCleanup,
} from '@/services/supabase/activeSessionsSync';

type ActiveCheckInRow = {
  user_id: string;
  gym_id: string;
  gym_name: string;
  workout_type: string | null;
  started_at: string;
  user_display_name: string;
  last_seen_at?: string | null;
  is_active?: boolean;
  ended_at?: string | null;
};

export type LocalCenterFriend = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  workoutType: string | null;
  startedAt: string;
};

export type LocalCenterActivity = {
  centerId: string;
  displayName: string;
  brand: string | null;
  address: string | null;
  totalActiveCount: number;
  activeFriendsCount: number;
  activeFriends: LocalCenterFriend[];
};

export async function loadLocalCentersActivity(
  userId: string,
  localCenterIds: string[],
): Promise<LocalCenterActivity[]> {
  const ids = [...new Set(localCenterIds.filter(Boolean))].slice(0, 3);
  if (!userId || ids.length === 0) {
    return [];
  }

  const staleCleaned = await runStaleActiveSessionCleanup();
  const now = Date.now();
  const [friendIds, checkInsRes] = await Promise.all([
    getMyFriendIds(userId),
    supabase
      .from('check_ins')
      .select(
        'user_id, gym_id, gym_name, workout_type, started_at, last_seen_at, is_active, ended_at, user_display_name',
      )
      .in('gym_id', ids)
      .eq('is_active', true)
      .is('ended_at', null),
  ]);
  if (checkInsRes.error) {
    throw checkInsRes.error;
  }
  const rawRows = (checkInsRes.data ?? []) as ActiveCheckInRow[];
  const fresh = rawRows.filter(r => isEffectiveActiveCheckIn(r, now));
  const rows = dedupeCheckInRowsByUserId(fresh);
  if (__DEV__) {
    console.log('[ActiveSessions] loadLocalCentersActivity', {
      staleCleaned,
      rawCount: rawRows.length,
      filteredCount: fresh.length,
      uniqueUsers: rows.length,
    });
  }
  const byCenter = new Map<string, ActiveCheckInRow[]>();
  for (const id of ids) {
    byCenter.set(id, []);
  }
  for (const row of rows) {
    const list = byCenter.get(String(row.gym_id));
    if (list) {
      list.push(row);
    }
  }

  const friendRows = rows.filter(
    r => r.user_id && r.user_id !== userId && friendIds.has(r.user_id),
  );
  const profileMap = await getPublicProfilesByIds(
    [...new Set(friendRows.map(r => r.user_id))],
  );

  return ids.map(centerId => {
    const gym = findGymById(centerId);
    const centerRows = byCenter.get(centerId) ?? [];
    const uniqUsers = new Set(centerRows.map(r => r.user_id).filter(Boolean));
    const friendEntries: LocalCenterFriend[] = centerRows
      .filter(r => r.user_id && r.user_id !== userId && friendIds.has(r.user_id))
      .map(r => {
        const p = profileMap.get(r.user_id);
        const displayName =
          p?.displayName?.trim() ||
          p?.username?.trim() ||
          r.user_display_name?.trim() ||
          'Bruger';
        return {
          userId: r.user_id,
          displayName,
          avatarUrl: p?.avatarUrl ?? null,
          workoutType: r.workout_type,
          startedAt: r.started_at,
        };
      })
      .sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );

    return {
      centerId,
      displayName: gym ? formatGymDisplayName(gym) : centerRows[0]?.gym_name || 'Center',
      brand: normalizeGymBrand(gym?.brand) || null,
      address: gym?._center?.address ?? null,
      totalActiveCount: uniqUsers.size,
      activeFriendsCount: friendEntries.length,
      activeFriends: friendEntries,
    };
  });
}
