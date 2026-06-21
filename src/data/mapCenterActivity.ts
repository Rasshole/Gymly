/**
 * Kort – aktivitet pr. center fra rigtige tal (venner online + total når backend tilføjes).
 */

export type ActivityLevel = 'calm' | 'moderate' | 'busy';

export interface MapCenterActivity {
  gymId: string;
  totalActiveCount: number;
  friendsActiveCount: number;
  activityLevel: ActivityLevel;
}

function getActivityLevel(total: number): ActivityLevel {
  if (total >= 10) {
    return 'busy';
  }
  if (total >= 4) {
    return 'moderate';
  }
  return 'calm';
}

/**
 * totalActiveCount og friendsActiveCount fra `loadMapGymBadges` / mapCenters.
 */
export function getMapCenterActivity(
  gymId: string,
  friendsActiveCount: number,
  totalActiveCount: number,
): MapCenterActivity {
  const f = Math.max(0, Math.floor(friendsActiveCount));
  const t = Math.max(0, Math.floor(totalActiveCount));
  return {
    gymId,
    totalActiveCount: t,
    friendsActiveCount: f,
    activityLevel: getActivityLevel(t),
  };
}

export const ACTIVITY_LABEL_KEYS: Record<ActivityLevel, string> = {
  calm: 'map.activityCalm',
  moderate: 'map.activityModerate',
  busy: 'map.activityBusy',
};
