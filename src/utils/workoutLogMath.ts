/**
 * Pure workout-log helpers (no Supabase) — safe for Jest.
 */

import type {WorkoutExercise, WorkoutLogSummary} from '@/types/workoutLog.types';

/** Parse vægt: accepterer "82,5" og "82.5". */
export function parseWeightInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) {
    return null;
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

export function parseRepsInput(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) {
    return null;
  }
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  return n;
}

export function computeWorkoutVolumeKg(exercises: WorkoutExercise[]): number {
  let total = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (s.weightKg == null || s.reps == null) {
        continue;
      }
      if (s.weightKg < 0 || s.reps < 1) {
        continue;
      }
      total += s.weightKg * s.reps;
    }
  }
  return Math.round(total * 10) / 10;
}

export function summarizeWorkoutLog(
  sessionId: string,
  exercises: WorkoutExercise[],
  durationMinutes: number,
): WorkoutLogSummary {
  const withSets = exercises.filter(e => e.sets.length > 0);
  return {
    sessionId,
    exerciseCount: withSets.length,
    setCount: withSets.reduce((n, e) => n + e.sets.length, 0),
    totalVolumeKg: computeWorkoutVolumeKg(withSets),
    durationMinutes,
  };
}
