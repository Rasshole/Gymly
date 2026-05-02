import {supabase} from '@/services/supabase/supabaseClient';
import {getMyFriendIds, getPublicProfilesByIds} from '@/services/supabase/friendService';

export type ActiveNowFriendRow = {
  userId: string;
  displayName: string;
  gymName: string;
  workoutType: string | null;
  startedAt: string;
  avatarUrl: string | null;
};

type CheckInRow = {
  user_id: string;
  gym_name: string;
  workout_type: string | null;
  started_at: string;
  user_display_name: string;
};

/**
 * Globalt: sum af aktive tjek (ét center pr. række i rollup, ingen dobbelttælling).
 */
export async function fetchGlobalActiveUserCount(): Promise<number> {
  const {data, error} = await supabase
    .from('gym_active_checkin_rollup')
    .select('active_count');
  if (error) {
    throw error;
  }
  return (data ?? []).reduce(
    (sum, r) => sum + (Number((r as {active_count: number}).active_count) || 0),
    0,
  );
}

/**
 * Venner med aktiv check_in. RLS returnerer egne+venners rækker; vi filtrerer til venner.
 * Sortering: længst aktiv først = tidligst started_at.
 */
export async function loadActiveFriendsNow(
  currentUserId: string,
): Promise<ActiveNowFriendRow[]> {
  const friendIdSet = await getMyFriendIds(currentUserId);
  const {data, error} = await supabase
    .from('check_ins')
    .select('user_id, gym_name, workout_type, started_at, user_display_name')
    .eq('is_active', true)
    .is('ended_at', null);
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as CheckInRow[];
  const onlyFriends = rows.filter(
    r =>
      r.user_id &&
      r.user_id !== currentUserId &&
      friendIdSet.has(r.user_id),
  );
  onlyFriends.sort(
    (a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime() ||
      (a.user_display_name || '').localeCompare(b.user_display_name || '', 'da'),
  );
  const ids = [...new Set(onlyFriends.map(r => r.user_id))];
  const profiles = await getPublicProfilesByIds(ids);
  return onlyFriends.map(r => {
    const p = profiles.get(r.user_id);
    const nameFromProfile =
      p?.displayName?.trim() || p?.username?.trim() || '';
    return {
      userId: r.user_id,
      displayName: nameFromProfile || r.user_display_name?.trim() || 'Bruger',
      gymName: r.gym_name?.trim() || '—',
      workoutType: r.workout_type,
      startedAt: r.started_at,
      avatarUrl: p?.avatarUrl ?? null,
    };
  });
}

export async function loadGymlyActiveNowData(
  currentUserId: string,
): Promise<{totalActive: number; friends: ActiveNowFriendRow[]}> {
  const [totalActive, friends] = await Promise.all([
    fetchGlobalActiveUserCount(),
    loadActiveFriendsNow(currentUserId),
  ]);
  return {totalActive, friends};
}
