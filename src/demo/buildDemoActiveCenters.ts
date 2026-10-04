/**
 * Aktive centre til Centres-fanen (samme type som Supabase `loadActiveCentersData`).
 *
 * Demo-only: intentionally keeps `localeCompare(..., 'da')` for stable demo sorting.
 * Production paths use `getIntlLocale(getRuntimeLanguage())` instead.
 */

import {findGymById, formatGymDisplayName, normalizeGymBrand} from '@/utils/gymDisplay';
import type {ActiveCenter, ActiveCenterSession} from '@/types/activeCenter.types';
import type {LocalCenterActivity} from '@/services/supabase/localCentersActivityService';

function toSessions(lc: LocalCenterActivity): ActiveCenterSession[] {
  const source =
    lc.activeVisible?.length > 0 ? lc.activeVisible : lc.activeFriends;
  return source.map((f, i) => ({
    checkInId: `demo-ac-${lc.centerId}-${i}`,
    userId: f.userId,
    displayName: f.displayName,
    workoutType: f.workoutType,
    startedAt: f.startedAt,
    avatarUrl: f.avatarUrl,
  }));
}

export function buildDemoActiveCentersFromLocal(
  localCenters: LocalCenterActivity[],
): ActiveCenter[] {
  const out: ActiveCenter[] = localCenters.map(lc => {
    const gym = findGymById(lc.centerId);
    const sessions = toSessions(lc);
    const friendSessions = lc.activeFriends.map((f, i) => ({
      checkInId: `demo-ac-friend-${lc.centerId}-${i}`,
      userId: f.userId,
      displayName: f.displayName,
      workoutType: f.workoutType,
      startedAt: f.startedAt,
      avatarUrl: f.avatarUrl,
    }));
    return {
      centerId: lc.centerId,
      displayName: gym ? formatGymDisplayName(gym) : lc.displayName,
      brandLabel: normalizeGymBrand(lc.brand ?? gym?.brand) || 'Center',
      address: lc.address ?? gym?.address ?? undefined,
      danishGym: gym,
      distanceMeters: null,
      totalActiveCount: lc.totalActiveCount,
      activeFriendsCount: lc.activeFriendsCount,
      activeFriends: friendSessions,
      activeSessions: sessions,
    };
  });
  return out.sort((a, b) => {
    if (b.totalActiveCount !== a.totalActiveCount) {
      return b.totalActiveCount - a.totalActiveCount;
    }
    return a.displayName.localeCompare(b.displayName, 'da');
  });
}
