import {supabase} from '@/services/supabase/supabaseClient';
import {getMyFriendIds, getPublicProfilesByIds} from '@/services/supabase/friendService';
import {
  formatGymDisplayName,
  findGymById,
  formatGymNameWithBrand,
  normalizeGymBrand,
} from '@/utils/gymDisplay';
import {detectGymChain} from '@/services/gymLogoService';
import {calculateDistance} from '@/utils/geoUtils';
import type {ActiveCenter, ActiveCenterSession} from '@/types/activeCenter.types';
import type {GymPresence, UserPresence} from '@/types/gymPresence.types';
import {
  dedupeCheckInRowsByUserId,
  isEffectiveActiveCheckIn,
  runStaleActiveSessionCleanup,
} from '@/services/supabase/activeSessionsSync';

type CheckInActiveRow = {
  id: string;
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

function toSession(
  r: CheckInActiveRow,
  avatars: Map<string, {avatarUrl: string | null}>,
): ActiveCenterSession {
  return {
    checkInId: r.id,
    userId: r.user_id,
    displayName: r.user_display_name?.trim() || 'Bruger',
    workoutType: r.workout_type,
    startedAt: r.started_at,
    avatarUrl: avatars.get(r.user_id)?.avatarUrl ?? null,
  };
}

function sortActiveCenters(a: ActiveCenter, b: ActiveCenter): number {
  if (b.totalActiveCount !== a.totalActiveCount) {
    return b.totalActiveCount - a.totalActiveCount;
  }
  if (b.activeFriendsCount !== a.activeFriendsCount) {
    return b.activeFriendsCount - a.activeFriendsCount;
  }
  const da = a.distanceMeters;
  const db = b.distanceMeters;
  if (da != null && db != null && da !== db) {
    return da - db;
  }
  if (da != null && db == null) {
    return -1;
  }
  if (da == null && db != null) {
    return 1;
  }
  return a.displayName.localeCompare(b.displayName, 'da');
}

export function mapSessionToUserPresence(s: ActiveCenterSession): UserPresence {
  const at = new Date(s.startedAt).getTime();
  const minutesAgo = Math.max(0, Math.floor((Date.now() - at) / 60_000));
  let status: UserPresence['status'] = 'checked_in_minutes';
  if (minutesAgo < 2) {
    status = 'training_now';
  } else if (minutesAgo < 90) {
    status = 'active_minutes';
  }
  return {
    id: s.userId,
    name: s.displayName,
    avatar: s.avatarUrl ?? undefined,
    status,
    lastActivity: new Date(s.startedAt),
    minutesAgo,
  };
}

export function mapActiveCenterToGymPresence(ac: ActiveCenter): GymPresence {
  return {
    gymId: ac.centerId,
    gymName: ac.displayName,
    activeUsers: ac.totalActiveCount,
    userList: ac.activeSessions.map(mapSessionToUserPresence),
  };
}

/**
 * Tæl aktive træninger pr. center (rollup) + venner via synlige check_ins.
 */
export async function loadActiveCentersData(
  currentUserId: string,
  options?: {userLatitude?: number; userLongitude?: number},
): Promise<ActiveCenter[]> {
  const staleCleaned = await runStaleActiveSessionCleanup();
  const now = Date.now();
  const [friendIdSet, rollupRes, checkInsRes] = await Promise.all([
    getMyFriendIds(currentUserId),
    supabase.from('gym_active_checkin_rollup').select('gym_id, active_count'),
    supabase
      .from('check_ins')
      .select(
        'id, user_id, gym_id, gym_name, workout_type, started_at, last_seen_at, is_active, ended_at, user_display_name',
      )
      .eq('is_active', true)
      .is('ended_at', null),
  ]);

  if (rollupRes.error) {
    throw rollupRes.error;
  }
  if (checkInsRes.error) {
    throw checkInsRes.error;
  }

  const byGym = new Map<string, CheckInActiveRow[]>();
  const rawRows = (checkInsRes.data ?? []) as CheckInActiveRow[];
  const fresh = rawRows.filter(r => isEffectiveActiveCheckIn(r, now));
  const rows = dedupeCheckInRowsByUserId(fresh);
  if (__DEV__) {
    console.log('[ActiveSessions] loadActiveCentersData', {
      staleCleaned,
      rawCount: rawRows.length,
      filteredCount: fresh.length,
      uniqueUsers: rows.length,
    });
  }
  for (const r of rows) {
    const gid = r.gym_id ? String(r.gym_id) : '';
    if (!gid) {
      continue;
    }
    const list = byGym.get(gid) ?? [];
    list.push(r);
    byGym.set(gid, list);
  }

  const friendOnlyIds = new Set(
    [...friendIdSet].filter(id => id && id !== currentUserId),
  );
  const allProfileIds = [
    ...new Set(
      rows
        .map(r => r.user_id)
        .filter(id => friendOnlyIds.has(id)),
    ),
  ];
  const profileMap = await getPublicProfilesByIds(allProfileIds);
  const avatars = new Map<string, {avatarUrl: string | null}>();
  for (const [id, p] of profileMap) {
    avatars.set(id, {avatarUrl: p.avatarUrl});
  }

  const rollupRows = (rollupRes.data ?? []) as Array<{
    gym_id: string;
    active_count: number;
  }>;

  const lat = options?.userLatitude;
  const lng = options?.userLongitude;

  const result: ActiveCenter[] = [];

  for (const roll of rollupRows) {
    const centerId = String(roll.gym_id);
    const total = Number(roll.active_count) || 0;
    if (total <= 0) {
      continue;
    }

    let atGym = byGym.get(centerId) ?? [];
    const dg = findGymById(centerId);
    if (atGym.length === 0 && dg) {
      const n = dg.name.trim().toLowerCase();
      for (const r of rows) {
        if (r.gym_name?.trim().toLowerCase() === n) {
          atGym.push(r);
        }
      }
    }

    const sessionsAll: ActiveCenterSession[] = atGym.map(r =>
      toSession(r, avatars),
    );
    const friendsAt = sessionsAll.filter(s => friendOnlyIds.has(s.userId));
    const activeFriends: ActiveCenterSession[] = friendsAt;

    const nameFromRow = atGym[0]?.gym_name?.trim();
    const displayName = dg
      ? formatGymDisplayName(dg)
      : nameFromRow && nameFromRow.length > 0
        ? nameFromRow
        : 'Fitness center';
    const chainDisplay = detectGymChain(dg?.brand, displayName).displayName;
    const brand = normalizeGymBrand(dg?.brand) || chainDisplay;
    const formattedName = formatGymNameWithBrand(displayName, brand);
    const address = dg
      ? [dg._center.address, dg._center.postal_code, dg._center.city]
          .filter(Boolean)
          .join(', ')
      : undefined;
    let distanceMeters: number | null = null;
    if (lat != null && lng != null && dg) {
      distanceMeters = calculateDistance(
        lat,
        lng,
        dg.latitude,
        dg.longitude,
      );
    }

    result.push({
      centerId,
      displayName: formattedName,
      brandLabel: brand,
      address,
      danishGym: dg,
      distanceMeters,
      totalActiveCount: total,
      activeFriendsCount: friendsAt.length,
      activeFriends,
      activeSessions: sessionsAll,
    });
  }

  result.sort(sortActiveCenters);
  return result;
}
