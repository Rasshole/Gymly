/**
 * Maps check-in session muscle groups → exercise-library muscle filters.
 */

import type {MuscleGroup} from '@/types/workout.types';
import type {ExerciseLibraryItem, WorkoutMuscleGroup} from '@/types/workoutLog.types';
import {MUSCLE_GROUP_ORDER} from '@/data/exerciseLibrary';
import {parseMuscleGroupsFromSession} from '@/utils/muscleGroupLabels';

/**
 * Active exercise-picker filters.
 * Empty array = Alle (no muscle filter).
 * Multiple values = OR match (exercise belongs to any selected group).
 */
export type ExerciseMuscleFilters = WorkoutMuscleGroup[];

/** @deprecated Prefer ExerciseMuscleFilters (multi-select). Kept for narrow call sites. */
export type ExerciseMuscleFilter = WorkoutMuscleGroup | null;

/** Muscle options in the Add Exercise filter sheet (canonical library order). */
export const EXERCISE_PICKER_MUSCLE_FILTERS: WorkoutMuscleGroup[] =
  MUSCLE_GROUP_ORDER.filter(
    mg => mg !== 'legs' && mg !== 'arms' && mg !== 'full_body',
  );

const CHECKIN_TO_EXERCISE_MUSCLE: Partial<
  Record<MuscleGroup, WorkoutMuscleGroup>
> = {
  bryst: 'chest',
  ryg: 'back',
  skulder: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  mave: 'core',
  cardio: 'cardio',
  // `ben` is ambiguous (quads/hamstrings/glutes/calves) — no 1:1 mapping.
  // reformer / pilates — no exercise-library bucket.
};

export function workoutMuscleFromCheckInKey(
  key: MuscleGroup,
): WorkoutMuscleGroup | null {
  return CHECKIN_TO_EXERCISE_MUSCLE[key] ?? null;
}

/**
 * Derive default Add Exercise filters from `activeSession.workoutType`.
 * Prefills all 1:1-mapped check-in groups (e.g. bryst,triceps → chest+triceps).
 * Ambiguous/empty (ben, reformer, …) → Alle (`[]`).
 * Does not mutate check-in data — picker-only.
 */
export function defaultExerciseMuscleFiltersFromSession(
  workoutType: string | undefined | null,
): ExerciseMuscleFilters {
  if (!workoutType?.trim()) {
    return [];
  }

  const checkInGroups = parseMuscleGroupsFromSession(workoutType);
  const mapped = checkInGroups
    .map(g => workoutMuscleFromCheckInKey(g))
    .filter((m): m is WorkoutMuscleGroup => m != null);

  return [...new Set(mapped)];
}

/**
 * @deprecated Use defaultExerciseMuscleFiltersFromSession for multi-select.
 * Returns a single muscle only when exactly one maps; otherwise Alle (null).
 */
export function defaultExerciseMuscleFilterFromSession(
  workoutType: string | undefined | null,
): ExerciseMuscleFilter {
  const filters = defaultExerciseMuscleFiltersFromSession(workoutType);
  return filters.length === 1 ? filters[0] : null;
}

export function filterExerciseLibraryByMuscle(
  items: ExerciseLibraryItem[],
  muscleFilters: ExerciseMuscleFilters | ExerciseMuscleFilter,
): ExerciseLibraryItem[] {
  const filters = normalizeMuscleFilters(muscleFilters);
  if (filters.length === 0) {
    return items;
  }
  const set = new Set(filters);
  return items.filter(e => set.has(e.muscleGroup));
}

export function normalizeMuscleFilters(
  muscleFilters: ExerciseMuscleFilters | ExerciseMuscleFilter,
): ExerciseMuscleFilters {
  if (muscleFilters == null) {
    return [];
  }
  if (typeof muscleFilters === 'string') {
    return [muscleFilters];
  }
  return muscleFilters;
}

export function toggleMuscleFilter(
  current: ExerciseMuscleFilters,
  muscle: WorkoutMuscleGroup,
): ExerciseMuscleFilters {
  if (current.includes(muscle)) {
    return current.filter(m => m !== muscle);
  }
  return [...current, muscle];
}
