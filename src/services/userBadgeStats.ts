import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useGymStore} from '@/store/gymStore';
import {useWorkoutStore} from '@/store/workoutStore';
import type {UserBadgeStats} from '@/types/badge.types';

/**
 * Samler live stats fra eksisterende stores (ingen ekstra persist-lag for stats).
 */
export function buildUserBadgeStats(userId: string): UserBadgeStats {
  const dash = useDashboardStatsStore.getState();
  const workouts = useWorkoutStore
    .getState()
    .workouts.filter(w => w.userId === userId || w.userId === 'current_user');
  const checkIns = useGymStore.getState().checkIns.filter(c => c.userId === userId);

  let totalMinutes = 0;
  let longestSession = 0;
  for (const w of workouts) {
    totalMinutes += w.duration || 0;
    if ((w.duration || 0) > longestSession) {
      longestSession = w.duration || 0;
    }
  }

  const uniqueGymIds = new Set(checkIns.map(c => c.gymId));

  return {
    total_training_time_minutes: totalMinutes,
    total_sessions: workouts.length,
    current_streak_days: dash.streak,
    longest_session_minutes: longestSession,
    friends_trained_with_count: useWorkoutStore.getState().getWorkoutsWithFriends(),
    unique_gyms_count: uniqueGymIds.size,
  };
}
