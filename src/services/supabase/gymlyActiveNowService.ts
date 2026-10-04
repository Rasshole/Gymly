import {supabase} from '@/services/supabase/supabaseClient';
import {getMyFriendIds, getPublicProfilesByIds} from '@/services/supabase/friendService';
import {
  dedupeCheckInRowsByUserId,
  isEffectiveActiveCheckIn,
  runStaleActiveSessionCleanup,
  type ActiveCheckInSyncRow,
} from '@/services/supabase/activeSessionsSync';
import {getIntlLocale, getRuntimeLanguage} from '@/i18n';
import {resolveLiveDisplayName} from '@/utils/displayName';

export type ActiveNowFriendRow = {
  userId: string;
  displayName: string;
  gymName: string;
  workoutType: string | null;
  startedAt: string;
  avatarUrl: string | null;
  liveExerciseName?: string | null;
  liveSetCount?: number | null;
  liveExerciseCount?: number | null;
};

type CheckInRow = ActiveCheckInSyncRow & {
  user_id: string;
  gym_name: string;
  workout_type: string | null;
  started_at: string;
  user_display_name: string;
  live_exercise_name?: string | null;
  live_set_count?: number | null;
  live_exercise_count?: number | null;
};

/**
 * Globalt: sum af rollup pr. center (én tælling pr. aktiv bruger pr. center efter DB-cleanup).
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

function rowToFriendRow(
  r: CheckInRow,
  profiles: Map<string, {displayName?: string; username?: string; avatarUrl?: string | null}>,
): ActiveNowFriendRow {
  const p = profiles.get(r.user_id);
  return {
    userId: r.user_id,
    displayName: resolveLiveDisplayName({
      profileDisplayName: p?.displayName,
      profileUsername: p?.username,
      checkInDisplayName: r.user_display_name,
    }),
    gymName: r.gym_name?.trim() || '—',
    workoutType: r.workout_type,
    startedAt: r.started_at,
    avatarUrl: p?.avatarUrl ?? null,
    liveExerciseName: r.live_exercise_name ?? null,
    liveSetCount: r.live_set_count ?? null,
    liveExerciseCount: r.live_exercise_count ?? null,
  };
}

/**
 * Hjem “Aktive nu”: én round-trip til check_ins (egne+venner via RLS), filtrer + dedup.
 */
export async function loadGymlyActiveNowData(currentUserId: string): Promise<{
  totalActive: number;
  friends: ActiveNowFriendRow[];
  currentUserActive: ActiveNowFriendRow | null;
}> {
  const staleCleaned = await runStaleActiveSessionCleanup();
  const now = Date.now();

  const [friendIdSet, rollupTotal, checkInsRes] = await Promise.all([
    getMyFriendIds(currentUserId),
    fetchGlobalActiveUserCount(),
    supabase
      .from('check_ins')
      .select(
        'id, user_id, gym_name, workout_type, started_at, last_seen_at, is_active, ended_at, user_display_name, live_exercise_name, live_set_count, live_exercise_count',
      )
      .eq('is_active', true)
      .is('ended_at', null),
  ]);

  if (checkInsRes.error) {
    throw checkInsRes.error;
  }

  const rawRows = (checkInsRes.data ?? []) as CheckInRow[];
  const rawCount = rawRows.length;
  const freshRows = rawRows.filter(r => isEffectiveActiveCheckIn(r, now));
  const deduped = dedupeCheckInRowsByUserId(freshRows);
  const uniqueCount = deduped.length;

  const selfRow = deduped.find(r => r.user_id === currentUserId);
  const friendRows = deduped.filter(
    r => r.user_id && r.user_id !== currentUserId && friendIdSet.has(r.user_id),
  );
  friendRows.sort(
    (a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime() ||
      (a.user_display_name || '').localeCompare(
        b.user_display_name || '',
        getIntlLocale(getRuntimeLanguage()),
      ),
  );

  const profileIds = [
    ...new Set(
      [
        ...(selfRow ? [selfRow.user_id] : []),
        ...friendRows.map(r => r.user_id),
      ].filter(Boolean),
    ),
  ];
  const profiles = await getPublicProfilesByIds(profileIds);

  const currentUserActive = selfRow
    ? rowToFriendRow(selfRow, profiles)
    : null;

  const friends = friendRows.map(r => rowToFriendRow(r, profiles));

  if (__DEV__) {
    console.log('[ActiveSessions] loadGymlyActiveNowData', {
      staleCleaned,
      rawActiveSessionsCount: rawCount,
      filteredActiveSessionsCount: freshRows.length,
      uniqueActiveUsersCount: uniqueCount,
      currentUserActive: Boolean(selfRow),
      totalActiveRollup: rollupTotal,
    });
  }

  return {
    totalActive: rollupTotal,
    friends,
    currentUserActive,
  };
}
