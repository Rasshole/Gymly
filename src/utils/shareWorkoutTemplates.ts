import type {ShareWorkoutPayload, ShareWorkoutTemplate} from '@/types/shareWorkout.types';

/** Templates available for a payload (PR/Streak gated). */
export function availableShareTemplates(
  payload: ShareWorkoutPayload,
): ShareWorkoutTemplate[] {
  const out: ShareWorkoutTemplate[] = ['summary'];
  if (payload.prs.length > 0) {
    out.push('pr');
  }
  if (payload.streakDays > 0) {
    out.push('streak');
  }
  return out;
}
