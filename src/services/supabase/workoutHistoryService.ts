/**
 * Completed workout history — list summaries + full detail.
 * Reuses check_ins + workout_exercises + workout_sets (same source as "Sidste gang").
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {
  fetchCompletedCheckInSessionsForUser,
  type ProfileCompletedSession,
} from '@/services/supabase/profileCheckInHistory';
import {fetchWorkoutLogForSession} from '@/services/supabase/workoutLogService';
import {detectGymChain} from '@/services/gymLogoService';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import type {
  WorkoutExercise,
  WorkoutSessionLogSummary,
} from '@/types/workoutLog.types';
import {summarizeWorkoutLog} from '@/utils/workoutLogMath';
import {resolveShareWorkoutDurationMinutes} from '@/utils/shareWorkoutFormat';

export type CompletedWorkoutDetail = {
  session: ProfileCompletedSession;
  exercises: WorkoutExercise[];
  summary: {
    exerciseCount: number;
    setCount: number;
    totalVolumeKg: number;
  };
};

function emptySummary(sessionId: string): WorkoutSessionLogSummary {
  return {
    sessionId,
    exerciseCount: 0,
    setCount: 0,
    totalVolumeKg: 0,
  };
}

/**
 * Batch summary stats for list cards (2 queries, no N+1).
 */
export async function fetchWorkoutLogSummariesForSessions(
  sessionIds: string[],
  userId: string,
): Promise<Record<string, WorkoutSessionLogSummary>> {
  const out: Record<string, WorkoutSessionLogSummary> = {};
  for (const id of sessionIds) {
    out[id] = emptySummary(id);
  }
  if (!sessionIds.length || !userId) {
    return out;
  }

  const {data: exRows, error: exErr} = await supabase
    .from('workout_exercises')
    .select('id, session_id')
    .eq('user_id', userId)
    .in('session_id', sessionIds);

  if (exErr) {
    throw new Error(exErr.message ?? 'Kunne ikke hente øvelser.');
  }

  const exercises = (exRows ?? []) as Array<{id: string; session_id: string}>;
  if (exercises.length === 0) {
    return out;
  }

  const exerciseIds = exercises.map(e => e.id);
  const sessionByExercise = new Map(
    exercises.map(e => [e.id, e.session_id] as const),
  );

  const {data: setRows, error: setErr} = await supabase
    .from('workout_sets')
    .select('workout_exercise_id, weight_kg, reps')
    .eq('user_id', userId)
    .in('workout_exercise_id', exerciseIds);

  if (setErr) {
    throw new Error(setErr.message ?? 'Kunne ikke hente sæt.');
  }

  const setsBySession = new Map<
    string,
    Array<{weightKg: number | null; reps: number | null}>
  >();
  const exercisesWithSets = new Set<string>();

  for (const row of setRows ?? []) {
    const exId = row.workout_exercise_id as string;
    const sessionId = sessionByExercise.get(exId);
    if (!sessionId) {
      continue;
    }
    exercisesWithSets.add(exId);
    const list = setsBySession.get(sessionId) ?? [];
    const w =
      row.weight_kg == null || row.weight_kg === ''
        ? null
        : Number(row.weight_kg);
    list.push({
      weightKg: Number.isFinite(w as number) ? (w as number) : null,
      reps: row.reps == null ? null : Number(row.reps),
    });
    setsBySession.set(sessionId, list);
  }

  const exerciseCountBySession = new Map<string, number>();
  for (const ex of exercises) {
    if (!exercisesWithSets.has(ex.id)) {
      continue;
    }
    exerciseCountBySession.set(
      ex.session_id,
      (exerciseCountBySession.get(ex.session_id) ?? 0) + 1,
    );
  }

  for (const sessionId of sessionIds) {
    const sets = setsBySession.get(sessionId) ?? [];
    let volume = 0;
    for (const s of sets) {
      if (s.weightKg == null || s.reps == null || s.reps < 1) {
        continue;
      }
      volume += s.weightKg * s.reps;
    }
    out[sessionId] = {
      sessionId,
      exerciseCount: exerciseCountBySession.get(sessionId) ?? 0,
      setCount: sets.length,
      totalVolumeKg: Math.round(volume * 10) / 10,
    };
  }

  return out;
}

/**
 * Full list payload: completed sessions + optional log summaries.
 */
export async function fetchWorkoutHistoryList(
  userId: string,
  limit = 80,
): Promise<{
  sessions: ProfileCompletedSession[];
  summaries: Record<string, WorkoutSessionLogSummary>;
}> {
  const sessions = await fetchCompletedCheckInSessionsForUser(userId, limit);
  try {
    const summaries = await fetchWorkoutLogSummariesForSessions(
      sessions.map(s => s.id),
      userId,
    );
    return {sessions, summaries};
  } catch {
    return {sessions, summaries: {}};
  }
}

/**
 * One completed check-in + its workout log (read-only detail).
 */
export async function fetchCompletedWorkoutDetail(
  sessionId: string,
  userId: string,
): Promise<CompletedWorkoutDetail> {
  const {data: row, error} = await supabase
    .from('check_ins')
    .select(
      'id, gym_name, workout_type, started_at, ended_at, duration_minutes, user_id, is_active',
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Kunne ikke hente træningen.');
  }
  if (!row) {
    throw new Error('Træningen findes ikke.');
  }
  if (row.user_id !== userId) {
    throw new Error('Ingen adgang til denne træning.');
  }
  if (!row.started_at || !row.ended_at) {
    throw new Error('Træningen er ikke afsluttet.');
  }

  const startedAt = new Date(row.started_at as string);
  const endedAt = new Date(row.ended_at as string);
  const durationMinutes = resolveShareWorkoutDurationMinutes({
    durationMinutesStored:
      row.duration_minutes == null ? null : Number(row.duration_minutes),
    startedAt,
    endedAt,
  });
  const gymRaw = String(row.gym_name ?? '').trim() || 'Center';
  const brand = detectGymChain(undefined, gymRaw).displayName;

  const session: ProfileCompletedSession = {
    id: sessionId,
    gymName: formatGymNameWithBrand(gymRaw, brand),
    startedAt,
    endedAt,
    durationMinutes,
    workoutType: (row.workout_type as string | null) ?? null,
    partnerDisplayName: null,
  };

  const exercises = await fetchWorkoutLogForSession(sessionId);
  const withSets = exercises.filter(e => e.sets.length > 0);
  const summary = summarizeWorkoutLog(
    sessionId,
    withSets,
    durationMinutes ?? 0,
  );

  return {
    session,
    exercises: withSets,
    summary: {
      exerciseCount: summary.exerciseCount,
      setCount: summary.setCount,
      totalVolumeKg: summary.totalVolumeKg,
    },
  };
}
