/**
 * Filtrer træninger efter periode — samme uge/måned/år-grænser som workoutStore.
 */

import type {Workout} from '@/types/workout.types';

export type WorkoutPeriod = 'week' | 'month' | 'year' | 'all';

const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

export function filterWorkoutsByPeriod(
  workouts: Workout[],
  period: WorkoutPeriod,
  now: Date = new Date(),
): Workout[] {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'all') {
    return [...workouts].sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime(),
    );
  }

  let start: Date;
  switch (period) {
    case 'week':
      start = getStartOfWeek(new Date(now));
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      return [...workouts].sort(
        (a, b) => b.startTime.getTime() - a.startTime.getTime(),
      );
  }

  return workouts
    .filter(w => w.startTime >= start && w.startTime <= end)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

export function sumWorkoutMinutes(workouts: Workout[]): number {
  return workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
}
