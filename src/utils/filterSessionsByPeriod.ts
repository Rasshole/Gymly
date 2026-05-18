import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import type {WorkoutPeriod} from '@/utils/workoutPeriodFilter';
import {filterWorkoutsByPeriod} from '@/utils/workoutPeriodFilter';
import {completedSessionsToWorkouts} from '@/services/supabase/profileCheckInHistory';

/** Filtrer afsluttede sessioner efter periode (nyeste først). */
export function filterSessionsByPeriod(
  sessions: ProfileCompletedSession[],
  period: WorkoutPeriod,
  now: Date = new Date(),
): ProfileCompletedSession[] {
  if (sessions.length === 0) {
    return [];
  }
  const workouts = completedSessionsToWorkouts(sessions, 'filter');
  const filtered = filterWorkoutsByPeriod(workouts, period, now);
  const idOrder = new Map(filtered.map((w, i) => [w.id, i]));
  return sessions
    .filter(s => idOrder.has(s.id))
    .sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
}

export function sortSessionsNewestFirst(
  sessions: ProfileCompletedSession[],
): ProfileCompletedSession[] {
  return [...sessions].sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
}
