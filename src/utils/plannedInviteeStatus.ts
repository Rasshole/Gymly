import type {WorkoutPlanEntry} from '@/store/workoutPlanStore';

export function getPlanInviteeResponseStatus(
  plan: WorkoutPlanEntry,
  userId: string,
): 'pending' | 'accepted' | 'declined' {
  const s = plan.inviteStatusByUserId?.[userId];
  if (s) {
    return s;
  }
  if (plan.acceptedFriends?.includes(userId)) {
    return 'accepted';
  }
  if (plan.invitedFriends?.includes(userId)) {
    return 'pending';
  }
  return 'pending';
}
