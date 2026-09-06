/**
 * Pure privacy / eligibility helpers for Share Workout entry points.
 */

export function canShareWorkoutFromFeedPost(params: {
  isOwn: boolean;
  checkInId?: string | null;
}): boolean {
  return params.isOwn && !!params.checkInId?.trim();
}

/** Gym name is the only location field exported; never address/coordinates. */
export function shareWorkoutGymLabel(
  gymName: string | null | undefined,
  showGym: boolean,
): string | null {
  if (!showGym) {
    return null;
  }
  const name = gymName?.trim();
  return name ? name : null;
}
