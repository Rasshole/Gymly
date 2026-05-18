import {supabase} from '@/services/supabase/supabaseClient';
import {getMyFriendIds} from '@/services/supabase/friendService';
import {findGymById, formatGymDisplayName} from '@/utils/gymDisplay';
import type {GymPresence, UserPresence} from '@/types/gymPresence.types';
import type {LiveWorkoutSessionRow} from '@/services/supabase/liveWorkoutSessionService';
import {
  fetchGymLiveSessionTotals,
  fetchVisibleLiveSessions,
} from '@/services/supabase/liveWorkoutSessionService';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {buildDemoMapGymBadgesFromCenters} from '@/demo/demoMapAndOnline';

export const PRESENCE_WINDOW_HOURS = 3;

export type CheckInRow = {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string;
  city: string | null;
  workout_type: string | null;
  note: string | null;
  user_display_name: string;
  created_at: string;
};

function sinceIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export async function fetchRecentCheckIns(
  hours: number = PRESENCE_WINDOW_HOURS,
): Promise<CheckInRow[]> {
  const {data, error} = await supabase
    .from('check_ins')
    .select(
      'id, user_id, gym_id, gym_name, city, workout_type, note, user_display_name, created_at',
    )
    .gte('created_at', sinceIso(hours))
    .order('created_at', {ascending: false});

  if (error) {
    throw error;
  }
  return (data ?? []) as CheckInRow[];
}

export async function fetchGymActiveTotals(
  hours: number = PRESENCE_WINDOW_HOURS,
): Promise<Map<string, number>> {
  const {data, error} = await supabase.rpc('gym_active_user_totals', {p_hours: hours});

  if (error) {
    throw error;
  }
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const r = row as {gym_id: string; user_count: number | string};
    map.set(String(r.gym_id), Number(r.user_count) || 0);
  }
  return map;
}

export function dedupeLatestByUser(rows: CheckInRow[]): CheckInRow[] {
  const seen = new Set<string>();
  const out: CheckInRow[] = [];
  for (const r of rows) {
    if (seen.has(r.user_id)) {
      continue;
    }
    seen.add(r.user_id);
    out.push(r);
  }
  return out;
}

function rowToUserPresence(row: CheckInRow): UserPresence {
  const at = new Date(row.created_at).getTime();
  const minutesAgo = Math.max(0, Math.floor((Date.now() - at) / 60_000));
  let status: UserPresence['status'] = 'checked_in_minutes';
  if (minutesAgo < 2) {
    status = 'training_now';
  } else if (minutesAgo < 90) {
    status = 'active_minutes';
  }
  return {
    id: row.user_id,
    name: row.user_display_name?.trim() || 'Bruger',
    avatar: undefined,
    workoutType: row.workout_type ?? undefined,
    status,
    lastActivity: new Date(row.created_at),
    minutesAgo,
  };
}

export function buildGymPresenceList(
  currentUserId: string,
  friendIds: Set<string>,
  rows: CheckInRow[],
  totalsByGymId: Map<string, number>,
): GymPresence[] {
  const latest = dedupeLatestByUser(rows);
  const byGym = new Map<string, CheckInRow[]>();
  for (const r of latest) {
    const list = byGym.get(r.gym_id) ?? [];
    list.push(r);
    byGym.set(r.gym_id, list);
  }

  const gyms: GymPresence[] = [];
  const seen = new Set<string>();

  for (const [gymId, gymRows] of byGym) {
    seen.add(gymId);
    const gymName =
      gymRows[0]?.gym_name ??
      (findGymById(gymId) ? formatGymDisplayName(findGymById(gymId)!) : undefined) ??
      'Fitness center';
    const total = totalsByGymId.get(gymId) ?? gymRows.length;
    const userList = [...gymRows]
      .sort((a, b) => {
        const score = (x: CheckInRow) =>
          x.user_id === currentUserId ? 2 : friendIds.has(x.user_id) ? 0 : 1;
        return (
          score(a) - score(b) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      })
      .map(rowToUserPresence);

    gyms.push({
      gymId,
      gymName,
      activeUsers: Math.max(total, userList.length),
      userList,
    });
  }

  for (const [gymIdStr, count] of totalsByGymId) {
    if (count <= 0 || seen.has(gymIdStr)) {
      continue;
    }
    gyms.push({
      gymId: gymIdStr,
      gymName: findGymById(gymIdStr)
        ? formatGymDisplayName(findGymById(gymIdStr)!)
        : 'Fitness center',
      activeUsers: count,
      userList: [],
    });
  }

  gyms.sort((a, b) => b.activeUsers - a.activeUsers);
  return gyms;
}

function buildGymPresenceFromLiveSessions(
  currentUserId: string,
  friendIds: Set<string>,
  liveRows: LiveWorkoutSessionRow[],
  totalsByGymId: Map<string, number>,
): GymPresence[] {
  const asCheckins: CheckInRow[] = liveRows.map(r => ({
    id: r.user_id,
    user_id: r.user_id,
    gym_id: r.gym_id,
    gym_name: r.gym_name,
    city: r.city,
    workout_type: r.workout_type,
    note: null,
    user_display_name: r.user_display_name,
    created_at: r.started_at,
  }));
  return buildGymPresenceList(currentUserId, friendIds, asCheckins, totalsByGymId);
}

export async function loadGymPresenceForUser(userId: string): Promise<GymPresence[]> {
  const friendIds = await getMyFriendIds(userId);
  let liveRows: LiveWorkoutSessionRow[] = [];
  let totals = new Map<string, number>();
  try {
    [liveRows, totals] = await Promise.all([
      fetchVisibleLiveSessions(),
      fetchGymLiveSessionTotals(),
    ]);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (
      !msg.toLowerCase().includes('workout_live_sessions') &&
      !msg.toLowerCase().includes('gym_live_session_counts') &&
      !msg.toLowerCase().includes('relation') &&
      !msg.toLowerCase().includes('schema cache')
    ) {
      throw e;
    }
    return [];
  }
  if (totals.size === 0 && liveRows.length === 0) {
    return [];
  }
  return buildGymPresenceFromLiveSessions(userId, friendIds, liveRows, totals);
}

export async function loadMapGymBadges(userId: string): Promise<{
  friendsByGymId: Map<string, number>;
  totalByGymId: Map<string, number>;
}> {
  if (isDemoContentMode()) {
    const d = buildDemoPayload(userId);
    return buildDemoMapGymBadgesFromCenters(d.localCenters, d.demoMapExtraRollups);
  }
  const friendIds = await getMyFriendIds(userId);

  const {data: rollups, error: rollupErr} = await supabase
    .from('gym_active_checkin_rollup')
    .select('gym_id, active_count');
  if (!rollupErr && rollups) {
    const totalByGymId = new Map<string, number>();
    for (const r of rollups) {
      const row = r as {gym_id: string; active_count: number | string};
      totalByGymId.set(String(row.gym_id), Number(row.active_count) || 0);
    }

    const {data: activeRows, error: cinErr} = await supabase
      .from('check_ins')
      .select('gym_id, user_id')
      .eq('is_active', true)
      .is('ended_at', null);

    const friendsByGymId = new Map<string, number>();
    if (!cinErr && activeRows) {
      for (const r of activeRows) {
        const row = r as {gym_id: string; user_id: string};
        if (row.user_id === userId) {
          continue;
        }
        if (!friendIds.has(row.user_id)) {
          continue;
        }
        const gid = String(row.gym_id);
        if (!gid) {
          continue;
        }
        friendsByGymId.set(gid, (friendsByGymId.get(gid) ?? 0) + 1);
      }
    }
    return {friendsByGymId, totalByGymId};
  }

  let liveRows: LiveWorkoutSessionRow[] = [];
  let totals = new Map<string, number>();
  try {
    [liveRows, totals] = await Promise.all([
      fetchVisibleLiveSessions(),
      fetchGymLiveSessionTotals(),
    ]);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (
      !msg.toLowerCase().includes('workout_live_sessions') &&
      !msg.toLowerCase().includes('gym_live_session_counts')
    ) {
      throw e;
    }
  }
  const friendsByGymId = new Map<string, number>();
  for (const r of liveRows) {
    if (r.user_id === userId || !friendIds.has(r.user_id)) {
      continue;
    }
    const id = String(r.gym_id);
    if (!id) {
      continue;
    }
    friendsByGymId.set(id, (friendsByGymId.get(id) ?? 0) + 1);
  }
  const totalByGymId = new Map<string, number>();
  for (const [gymIdStr, count] of totals) {
    totalByGymId.set(String(gymIdStr), count);
  }
  return {friendsByGymId, totalByGymId};
}

/** Seneste check-in pr. bruger (nyeste først i datasættet). */
export async function fetchLatestCheckInPerUser(
  userIds: string[],
  maxRows = 2000,
): Promise<Map<string, CheckInRow>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const {data, error} = await supabase
    .from('check_ins')
    .select(
      'id, user_id, gym_id, gym_name, city, workout_type, note, user_display_name, created_at',
    )
    .in('user_id', userIds)
    .order('created_at', {ascending: false})
    .limit(maxRows);

  if (error) {
    throw error;
  }
  const map = new Map<string, CheckInRow>();
  for (const row of (data ?? []) as CheckInRow[]) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, row);
    }
  }
  return map;
}
