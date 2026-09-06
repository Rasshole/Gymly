/**
 * Workout log service — CRUD for workout_exercises + workout_sets.
 * sessionId = check_ins.id
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '@/services/supabase/supabaseClient';
import {EXERCISE_LIBRARY, isLocalExerciseId} from '@/data/exerciseLibrary';
import {loadCustomExercises} from '@/services/supabase/customExerciseService';
import type {
  ExerciseHistorySession,
  ExerciseLibraryItem,
  LastExercisePerformance,
  LastExerciseSetSnapshot,
  WorkoutExercise,
  WorkoutLogSummary,
  WorkoutSet,
  WorkoutTrackingType,
} from '@/types/workoutLog.types';
import {
  computeWorkoutVolumeKg,
  parseRepsInput,
  parseWeightInput,
  summarizeWorkoutLog,
} from '@/utils/workoutLogMath';
import {
  exerciseNamesMatch,
} from '@/utils/workoutLogHistory';

export {
  computeWorkoutVolumeKg,
  parseRepsInput,
  parseWeightInput,
  summarizeWorkoutLog,
};

const RECENT_EXERCISES_KEY = '@gymly/workout_log_recent_exercises';
const MAX_RECENT = 12;

type ExerciseRow = {
  id: string;
  session_id: string;
  user_id: string;
  exercise_id: string | null;
  exercise_name: string;
  muscle_group: string | null;
  tracking_type: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type SetRow = {
  id: string;
  workout_exercise_id: string;
  session_id: string;
  user_id: string;
  set_number: number;
  weight_kg: number | string | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | string | null;
  completed_at: string;
  created_at: string;
  updated_at: string;
};

type LibraryRow = {
  id: string;
  name: string;
  muscle_group: string;
  tracking_type: string;
  sort_order: number;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === '') {
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function mapSet(row: SetRow): WorkoutSet {
  return {
    id: row.id,
    workoutExerciseId: row.workout_exercise_id,
    sessionId: row.session_id,
    userId: row.user_id,
    setNumber: row.set_number,
    weightKg: num(row.weight_kg),
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: num(row.distance_meters),
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExercise(row: ExerciseRow, sets: WorkoutSet[]): WorkoutExercise {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    muscleGroup: row.muscle_group,
    trackingType: (row.tracking_type as WorkoutTrackingType) || 'weight_reps',
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sets: sets.sort((a, b) => a.setNumber - b.setNumber),
  };
}

/**
 * Local expanded catalog is the source of truth for names/aliases/equipment.
 * Server rows overlay UUID ids when the exercise name matches (history FK).
 * User customs are appended (device + user scoped).
 */
export async function fetchExerciseLibrary(): Promise<ExerciseLibraryItem[]> {
  const customs = await loadCustomExercises();
  let base: ExerciseLibraryItem[] = EXERCISE_LIBRARY.map(e => ({...e}));

  try {
    const {data, error} = await supabase
      .from('exercise_library')
      .select('id, name, muscle_group, tracking_type, sort_order')
      .order('muscle_group')
      .order('sort_order');

    if (!error && data?.length) {
      const serverByName = new Map<string, LibraryRow>();
      for (const row of data as LibraryRow[]) {
        serverByName.set(row.name.trim().toLowerCase(), row);
      }

      base = EXERCISE_LIBRARY.map(local => {
        const server = serverByName.get(local.name.trim().toLowerCase());
        if (!server) {
          return {...local};
        }
        // Keep local muscle/equipment/aliases; adopt server UUID for FK when present.
        return {
          ...local,
          id: server.id,
          trackingType:
            (server.tracking_type as WorkoutTrackingType) || local.trackingType,
        };
      });

      // Append any server-only rows not in the local catalog (legacy / rare).
      const localNames = new Set(
        EXERCISE_LIBRARY.map(e => e.name.trim().toLowerCase()),
      );
      for (const row of data as LibraryRow[]) {
        const key = row.name.trim().toLowerCase();
        if (localNames.has(key)) {
          continue;
        }
        base.push({
          id: row.id,
          name: row.name,
          muscleGroup: row.muscle_group as ExerciseLibraryItem['muscleGroup'],
          trackingType:
            (row.tracking_type as WorkoutTrackingType) || 'weight_reps',
          sortOrder: row.sort_order,
          equipment: 'other',
        });
      }
    }
  } catch {
    /* keep local base */
  }

  const customNames = new Set(customs.map(c => c.name.trim().toLowerCase()));
  const withoutCustomDupes = base.filter(
    e => !customNames.has(e.name.trim().toLowerCase()),
  );
  return [...withoutCustomDupes, ...customs];
}

export async function getRecentExerciseIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_EXERCISES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export async function pushRecentExerciseId(exerciseId: string): Promise<void> {
  try {
    const prev = await getRecentExerciseIds();
    const next = [exerciseId, ...prev.filter(id => id !== exerciseId)].slice(
      0,
      MAX_RECENT,
    );
    await AsyncStorage.setItem(RECENT_EXERCISES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export async function fetchWorkoutLogForSession(
  sessionId: string,
): Promise<WorkoutExercise[]> {
  const {data: exRows, error: exErr} = await supabase
    .from('workout_exercises')
    .select(
      'id, session_id, user_id, exercise_id, exercise_name, muscle_group, tracking_type, position, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('position', {ascending: true});

  if (exErr) {
    throw exErr;
  }

  const exercises = (exRows ?? []) as ExerciseRow[];
  if (exercises.length === 0) {
    return [];
  }

  const ids = exercises.map(e => e.id);
  const {data: setRows, error: setErr} = await supabase
    .from('workout_sets')
    .select(
      'id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at',
    )
    .in('workout_exercise_id', ids)
    .order('set_number', {ascending: true});

  if (setErr) {
    throw setErr;
  }

  const setsByEx = new Map<string, WorkoutSet[]>();
  for (const row of (setRows ?? []) as SetRow[]) {
    const list = setsByEx.get(row.workout_exercise_id) ?? [];
    list.push(mapSet(row));
    setsByEx.set(row.workout_exercise_id, list);
  }

  return exercises.map(e => mapExercise(e, setsByEx.get(e.id) ?? []));
}

export async function addWorkoutExercise(params: {
  sessionId: string;
  userId: string;
  exercise: ExerciseLibraryItem;
  position?: number;
}): Promise<WorkoutExercise> {
  const {sessionId, userId, exercise} = params;
  let position = params.position;
  if (position == null) {
    const {data: maxRow} = await supabase
      .from('workout_exercises')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', {ascending: false})
      .limit(1)
      .maybeSingle();
    position = ((maxRow as {position?: number} | null)?.position ?? -1) + 1;
  }

  // Prefer server library UUID; local seed (ex-*) / custom (custom-*) are not UUIDs.
  let exerciseId: string | null = isLocalExerciseId(exercise.id)
    ? null
    : exercise.id;
  if (exerciseId == null && !exercise.isCustom) {
    // Match by name only — local muscle groups may be finer than server seed.
    const {data: lib} = await supabase
      .from('exercise_library')
      .select('id')
      .eq('name', exercise.name)
      .limit(1)
      .maybeSingle();
    exerciseId = (lib as {id?: string} | null)?.id ?? null;
  }

  const {data, error} = await supabase
    .from('workout_exercises')
    .insert({
      session_id: sessionId,
      user_id: userId,
      exercise_id: exerciseId,
      exercise_name: exercise.name,
      muscle_group: exercise.muscleGroup,
      tracking_type: exercise.trackingType,
      position,
    })
    .select(
      'id, session_id, user_id, exercise_id, exercise_name, muscle_group, tracking_type, position, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  await pushRecentExerciseId(exercise.id);
  return mapExercise(data as ExerciseRow, []);
}

export async function addWorkoutSet(params: {
  workoutExerciseId: string;
  sessionId: string;
  userId: string;
  weightKg: number | null;
  reps: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  setNumber?: number;
}): Promise<WorkoutSet> {
  let setNumber = params.setNumber;
  if (setNumber == null) {
    const {data: maxRow} = await supabase
      .from('workout_sets')
      .select('set_number')
      .eq('workout_exercise_id', params.workoutExerciseId)
      .order('set_number', {ascending: false})
      .limit(1)
      .maybeSingle();
    setNumber = ((maxRow as {set_number?: number} | null)?.set_number ?? 0) + 1;
  }

  const now = new Date().toISOString();
  const {data, error} = await supabase
    .from('workout_sets')
    .insert({
      workout_exercise_id: params.workoutExerciseId,
      session_id: params.sessionId,
      user_id: params.userId,
      set_number: setNumber,
      weight_kg: params.weightKg,
      reps: params.reps,
      duration_seconds: params.durationSeconds ?? null,
      distance_meters: params.distanceMeters ?? null,
      completed_at: now,
    })
    .select(
      'id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  // Touch parent exercise so "latest" ordering for live status works
  await supabase
    .from('workout_exercises')
    .update({updated_at: now})
    .eq('id', params.workoutExerciseId);

  return mapSet(data as SetRow);
}

export async function updateWorkoutSet(params: {
  setId: string;
  weightKg: number | null;
  reps: number | null;
}): Promise<WorkoutSet> {
  const now = new Date().toISOString();
  const {data, error} = await supabase
    .from('workout_sets')
    .update({
      weight_kg: params.weightKg,
      reps: params.reps,
      updated_at: now,
    })
    .eq('id', params.setId)
    .select(
      'id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }
  return mapSet(data as SetRow);
}

export async function deleteWorkoutSet(setId: string): Promise<void> {
  const {error} = await supabase.from('workout_sets').delete().eq('id', setId);
  if (error) {
    throw error;
  }
}

export async function deleteWorkoutExercise(exerciseId: string): Promise<void> {
  const {error} = await supabase
    .from('workout_exercises')
    .delete()
    .eq('id', exerciseId);
  if (error) {
    throw error;
  }
}

/** Snapshot før checkout — til resume-modal. */
export async function fetchWorkoutLogSummary(
  sessionId: string,
  durationMinutes: number,
): Promise<WorkoutLogSummary | null> {
  try {
    const exercises = await fetchWorkoutLogForSession(sessionId);
    const summary = summarizeWorkoutLog(sessionId, exercises, durationMinutes);
    if (summary.setCount === 0) {
      return null;
    }
    return summary;
  } catch {
    return null;
  }
}

type HistoryExerciseRow = ExerciseRow & {
  workout_sets?: SetRow[] | null;
  check_ins?: {started_at?: string | null} | null;
};

function mapSetSnapshot(row: SetRow): LastExerciseSetSnapshot {
  return {
    setNumber: row.set_number,
    weightKg: num(row.weight_kg),
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: num(row.distance_meters),
  };
}

function rowToPerformance(row: HistoryExerciseRow): LastExercisePerformance | null {
  const sets = (row.workout_sets ?? [])
    .map(mapSetSnapshot)
    .sort((a, b) => a.setNumber - b.setNumber);
  if (sets.length === 0) {
    return null;
  }
  const performedAt =
    row.check_ins?.started_at || row.created_at || new Date().toISOString();
  return {
    workoutExerciseId: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    trackingType: (row.tracking_type as WorkoutTrackingType) || 'weight_reps',
    performedAt,
    sets,
  };
}

function quoteOrValue(value: string): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildExerciseMatchOr(
  exerciseName: string,
  exerciseId: string | null,
): string {
  const nameClause = `exercise_name.ilike.${quoteOrValue(exerciseName)}`;
  if (exerciseId) {
    return `exercise_id.eq.${exerciseId},${nameClause}`;
  }
  return nameClause;
}

/**
 * Most recent prior logging of this exercise for the user.
 * Excludes `excludeSessionId` (current check-in). Prefers exercise_id match,
 * falls back to case-insensitive exercise_name.
 */
export async function getLastExercisePerformance(
  userId: string,
  exerciseName: string,
  options?: {
    excludeSessionId?: string | null;
    exerciseId?: string | null;
  },
): Promise<LastExercisePerformance | null> {
  const name = exerciseName.trim();
  if (!userId || !name) {
    return null;
  }
  const excludeSessionId = options?.excludeSessionId ?? null;
  const exerciseId =
    options?.exerciseId && !options.exerciseId.startsWith('ex-')
      ? options.exerciseId
      : null;

  const selectWithJoin = `
        id, session_id, user_id, exercise_id, exercise_name, muscle_group, tracking_type, position, created_at, updated_at,
        workout_sets (
          id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at
        ),
        check_ins ( started_at )
      `;
  const selectPlain = `
        id, session_id, user_id, exercise_id, exercise_name, muscle_group, tracking_type, position, created_at, updated_at,
        workout_sets (
          id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at
        )
      `;

  async function run(select: string): Promise<HistoryExerciseRow[]> {
    let query = supabase
      .from('workout_exercises')
      .select(select)
      .eq('user_id', userId)
      .or(buildExerciseMatchOr(name, exerciseId))
      .order('created_at', {ascending: false})
      .limit(40);

    if (excludeSessionId) {
      query = query.neq('session_id', excludeSessionId);
    }

    const {data, error} = await query;
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as HistoryExerciseRow[];
  }

  try {
    let rows: HistoryExerciseRow[];
    try {
      rows = await run(selectWithJoin);
    } catch {
      rows = await run(selectPlain);
    }

    for (const row of rows) {
      const idMatch = Boolean(
        exerciseId && row.exercise_id && row.exercise_id === exerciseId,
      );
      const nameMatch = exerciseNamesMatch(row.exercise_name, name);
      if (!idMatch && !nameMatch) {
        continue;
      }
      const perf = rowToPerformance(row);
      if (perf) {
        return perf;
      }
    }
    return null;
  } catch (e) {
    console.warn('[workoutLog] getLastExercisePerformance', e);
    return null;
  }
}

/**
 * Recent sessions for an exercise (newest first), excluding current session.
 */
export async function getExerciseHistory(
  userId: string,
  exerciseName: string,
  options?: {
    excludeSessionId?: string | null;
    exerciseId?: string | null;
    limit?: number;
  },
): Promise<ExerciseHistorySession[]> {
  const name = exerciseName.trim();
  const limit = options?.limit ?? 12;
  if (!userId || !name) {
    return [];
  }
  const excludeSessionId = options?.excludeSessionId ?? null;
  const exerciseId =
    options?.exerciseId && !options.exerciseId.startsWith('ex-')
      ? options.exerciseId
      : null;

  const selectWithJoin = `
        id, session_id, user_id, exercise_id, exercise_name, muscle_group, tracking_type, position, created_at, updated_at,
        workout_sets (
          id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at
        ),
        check_ins ( started_at )
      `;
  const selectPlain = `
        id, session_id, user_id, exercise_id, exercise_name, muscle_group, tracking_type, position, created_at, updated_at,
        workout_sets (
          id, workout_exercise_id, session_id, user_id, set_number, weight_kg, reps, duration_seconds, distance_meters, completed_at, created_at, updated_at
        )
      `;

  async function run(select: string): Promise<HistoryExerciseRow[]> {
    let query = supabase
      .from('workout_exercises')
      .select(select)
      .eq('user_id', userId)
      .or(buildExerciseMatchOr(name, exerciseId))
      .order('created_at', {ascending: false})
      .limit(80);

    if (excludeSessionId) {
      query = query.neq('session_id', excludeSessionId);
    }

    const {data, error} = await query;
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as HistoryExerciseRow[];
  }

  try {
    let rows: HistoryExerciseRow[];
    try {
      rows = await run(selectWithJoin);
    } catch {
      rows = await run(selectPlain);
    }

    const bySession = new Map<string, ExerciseHistorySession>();

    for (const row of rows) {
      const idMatch = Boolean(
        exerciseId && row.exercise_id && row.exercise_id === exerciseId,
      );
      const nameMatch = exerciseNamesMatch(row.exercise_name, name);
      if (!idMatch && !nameMatch) {
        continue;
      }
      const perf = rowToPerformance(row);
      if (!perf) {
        continue;
      }
      const existing = bySession.get(perf.sessionId);
      if (
        !existing ||
        new Date(perf.performedAt).getTime() >
          new Date(existing.performedAt).getTime()
      ) {
        bySession.set(perf.sessionId, {
          sessionId: perf.sessionId,
          performedAt: perf.performedAt,
          trackingType: perf.trackingType,
          sets: perf.sets,
        });
      }
    }

    return [...bySession.values()]
      .sort(
        (a, b) =>
          new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime(),
      )
      .slice(0, limit);
  } catch (e) {
    console.warn('[workoutLog] getExerciseHistory', e);
    return [];
  }
}
