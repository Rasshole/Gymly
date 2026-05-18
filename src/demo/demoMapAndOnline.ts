/**
 * Kort-badges + online-venner til kort (demo).
 */

import type {OnlineUser} from '@/types/online.types';
import type {ActiveNowFriendRow} from '@/services/supabase/gymlyActiveNowService';
import type {LocalCenterActivity} from '@/services/supabase/localCentersActivityService';
import {DEMO_PROFILES} from '@/demo/demoPersonas';

function gymIdForName(gymName: string, centers: LocalCenterActivity[]): string | undefined {
  const q = gymName.toLowerCase();
  const hit = centers.find(
    c =>
      c.displayName.toLowerCase().includes(q) ||
      q.includes(c.displayName.toLowerCase().slice(0, 12)),
  );
  return hit?.centerId;
}

export function buildDemoMapGymBadgesFromCenters(
  localCenters: LocalCenterActivity[],
  extraTotals: {gymId: string; total: number; friends: number}[],
): {friendsByGymId: Map<string, number>; totalByGymId: Map<string, number>} {
  const friendsByGymId = new Map<string, number>();
  const totalByGymId = new Map<string, number>();
  for (const c of localCenters) {
    friendsByGymId.set(c.centerId, c.activeFriendsCount);
    totalByGymId.set(c.centerId, c.totalActiveCount);
  }
  for (const x of extraTotals) {
    if (!totalByGymId.has(x.gymId)) {
      totalByGymId.set(x.gymId, x.total);
      friendsByGymId.set(x.gymId, x.friends);
    }
  }
  return {friendsByGymId, totalByGymId};
}

const EXTRA_MAP_WORKOUT_TYPES = [
  'bryst',
  'ben',
  'ryg',
  'skulder',
  'cardio',
  'triceps',
  'biceps',
  'mave',
] as const;

/** Ekstra fiktive aktive på kortet (personas der ikke allerede er i activeFriends). */
const MAP_EXTRA_PERSONA_START = 9;
const MAP_EXTRA_PERSONA_COUNT = 14;

export function buildDemoOnlineUsersFromActiveFriends(
  activeFriends: ActiveNowFriendRow[],
  currentUserId: string,
  localCenters: LocalCenterActivity[],
): OnlineUser[] {
  const rows = activeFriends.filter(f => f.userId !== currentUserId);
  const out: OnlineUser[] = rows.map(f => {
    const start = new Date(f.startedAt).getTime();
    const activeMinutesAgo = Math.max(0, Math.floor((Date.now() - start) / 60_000));
    const status =
      activeMinutesAgo <= 12 ? 'training_now' : ('active_minutes' as const);
    return {
      userId: f.userId,
      displayName: f.displayName,
      gymName: f.gymName,
      gymId: gymIdForName(f.gymName, localCenters),
      lastActive: new Date(f.startedAt),
      status,
      activeMinutesAgo,
      muscleGroup: f.workoutType ?? undefined,
      isFriend: true,
    };
  });
  const byId = new Map(out.map(u => [u.userId, u]));
  const centerSlots = localCenters.filter(c => c.totalActiveCount > 0);
  const extras = DEMO_PROFILES.slice(
    MAP_EXTRA_PERSONA_START,
    MAP_EXTRA_PERSONA_START + MAP_EXTRA_PERSONA_COUNT,
  );
  extras.forEach((profile, i) => {
    if (byId.has(profile.id) || profile.id === currentUserId) {
      return;
    }
    const center = centerSlots[i % Math.max(1, centerSlots.length)];
    const minsAgo = 2 + (i % 11);
    const wt = EXTRA_MAP_WORKOUT_TYPES[i % EXTRA_MAP_WORKOUT_TYPES.length]!;
    byId.set(profile.id, {
      userId: profile.id,
      displayName: profile.displayName,
      gymName: center?.displayName ?? 'Fitness center',
      gymId: center?.centerId,
      lastActive: new Date(Date.now() - minsAgo * 60_000),
      status: minsAgo <= 12 ? 'training_now' : 'active_minutes',
      activeMinutesAgo: minsAgo,
      muscleGroup: wt,
      isFriend: true,
    });
  });
  return [...byId.values()].sort(
    (a, b) => b.lastActive.getTime() - a.lastActive.getTime(),
  );
}
