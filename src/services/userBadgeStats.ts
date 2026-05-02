import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useGymStore} from '@/store/gymStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {useSessionStore} from '@/store/sessionStore';
import {supabase} from '@/services/supabase/supabaseClient';
import type {UserBadgeStats} from '@/types/badge.types';

/**
 * Badge stats fra real check-in data (source of truth).
 */
export async function buildUserBadgeStats(userId: string): Promise<UserBadgeStats> {
  const dash = useDashboardStatsStore.getState();
  const workoutsWithUser = useWorkoutStore
    .getState()
    .workouts.filter(w => w.userId === userId || w.userId === 'current_user');
  const localCheckIns = useGymStore.getState().checkIns.filter(c => c.userId === userId);
  const elapsedSeconds = useSessionStore.getState().getElapsedSeconds();
  const localActiveMinutes = Math.floor(elapsedSeconds / 60);

  const uniqueDays = new Set<string>();
  const completedRows: Array<{
    started_at: string | null;
    ended_at: string | null;
    planned_workout_id?: string | null;
  }> = [];
  let completedMinutes = 0;
  let longestSession = 0;
  let activeMinutesFromDb = 0;

  try {
    const {data, error} = await supabase
      .from('check_ins')
      .select('started_at, ended_at, is_active, planned_workout_id')
      .eq('user_id', userId)
      .order('started_at', {ascending: false})
      .limit(3000);
    if (error) {
      throw error;
    }
    const rows = (data ?? []) as Array<{
      started_at: string | null;
      ended_at: string | null;
      is_active: boolean;
      planned_workout_id?: string | null;
    }>;
    for (const r of rows) {
      if (r.ended_at && r.started_at) {
        completedRows.push(r);
        const st = new Date(r.started_at);
        const en = new Date(r.ended_at);
        const minutes = Math.max(1, Math.floor((en.getTime() - st.getTime()) / 60000));
        completedMinutes += minutes;
        if (minutes > longestSession) {
          longestSession = minutes;
        }
        uniqueDays.add(en.toISOString().slice(0, 10));
      } else if (r.is_active && r.started_at) {
        const st = new Date(r.started_at);
        const mins = Math.max(0, Math.floor((Date.now() - st.getTime()) / 60000));
        if (mins > activeMinutesFromDb) {
          activeMinutesFromDb = mins;
        }
      }
    }
  } catch {
    // Falder tilbage til lokale stores.
    let localCompleted = 0;
    let localLongest = 0;
    workoutsWithUser.forEach(w => {
      localCompleted += w.duration || 0;
      if ((w.duration || 0) > localLongest) {
        localLongest = w.duration || 0;
      }
      if (w.endTime) {
        uniqueDays.add(w.endTime.toISOString().slice(0, 10));
      } else if (w.startTime) {
        uniqueDays.add(w.startTime.toISOString().slice(0, 10));
      }
    });
    completedMinutes = localCompleted;
    longestSession = localLongest;
  }

  const currentStreak = computeCurrentStreakDays(uniqueDays);
  const uniqueGymIds = new Set(localCheckIns.map(c => c.gymId));
  const completedSessions = Math.max(completedRows.length, workoutsWithUser.length);
  const socialSharedCount = new Set(
    completedRows
      .map(r => r.planned_workout_id || null)
      .filter((v): v is string => Boolean(v)),
  ).size;
  const activeSessionMinutes = Math.max(localActiveMinutes, activeMinutesFromDb);

  return {
    total_training_time_minutes: completedMinutes + activeSessionMinutes,
    total_sessions: completedSessions,
    current_streak_days: Math.max(currentStreak, dash.streak),
    longest_session_minutes: longestSession,
    friends_trained_with_count: Math.max(
      socialSharedCount,
      useWorkoutStore.getState().getWorkoutsWithFriends(),
    ),
    unique_gyms_count: uniqueGymIds.size,
  };
}

function computeCurrentStreakDays(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) {
    return 0;
  }
  const hasKey = (d: Date) => dayKeys.has(d.toISOString().slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let cursor: Date | null = null;
  if (hasKey(today)) {
    cursor = today;
  } else if (hasKey(yesterday)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (cursor && hasKey(cursor)) {
    streak += 1;
    const prevDay: Date = new Date(cursor.getTime());
    prevDay.setDate(prevDay.getDate() - 1);
    cursor = prevDay;
  }
  return streak;
}
