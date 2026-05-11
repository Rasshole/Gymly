import type {WorkoutPlanEntry} from '@/store/workoutPlanStore';

/** Kalender + “kommende sessions”: kun egne sessioner eller invitationer du har accepteret */
export function isWorkoutOnUserCalendar(
  entry: WorkoutPlanEntry,
  userId: string | undefined,
): boolean {
  if (!userId) {
    return true;
  }
  const creatorId = entry.creatorUserId;
  if (!creatorId || creatorId === userId) {
    return true;
  }
  return entry.inviteStatusByUserId?.[userId] === 'accepted';
}

/** Invitationer-sektion: du er inviteret og har ikke svaret endnu */
export function isPendingInviteeSession(
  entry: WorkoutPlanEntry,
  userId: string | undefined,
): boolean {
  if (!userId) {
    return false;
  }
  const creatorId = entry.creatorUserId;
  if (!creatorId || creatorId === userId) {
    return false;
  }
  return entry.inviteStatusByUserId?.[userId] === 'pending';
}
