/**
 * Kort – aktivitet pr. center fra rigtige tal (venner online + total når backend tilføjes).
 */

export type ActivityLevel = 'calm' | 'moderate' | 'busy';

export interface MapCenterActivity {
  gymId: number;
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
 * totalActiveCount kommer fra venner der træner her (eller 0) indtil global presence er tilgængelig.
 */
export function getMapCenterActivity(
  gymId: number,
  friendsActiveCount: number,
): MapCenterActivity {
  const totalActiveCount = Math.max(0, Math.floor(friendsActiveCount));
  return {
    gymId,
    totalActiveCount,
    friendsActiveCount: totalActiveCount,
    activityLevel: getActivityLevel(totalActiveCount),
  };
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  calm: 'Roligt',
  moderate: 'God aktivitet',
  busy: 'Travlt',
};
