/**
 * Personal records — baselines from workout_sets history + persist events.
 */

import {supabase} from '@/services/supabase/supabaseClient';
import type {
  DetectedPersonalRecord,
  ExercisePrBaseline,
  ProfilePersonalRecord,
  SessionPersonalRecords,
  SharedWorkoutSnapshot,
} from '@/types/personalRecord.types';
import type {WorkoutExercise} from '@/types/workoutLog.types';
import {fetchWorkoutLogForSession} from '@/services/supabase/workoutLogService';
import {summarizeWorkoutLog} from '@/utils/workoutLogMath';
import {
  detectSetPersonalRecord,
  emptyBaseline,
  exercisePrKey,
  mergeSessionRecords,
  weightKey,
} from '@/utils/personalRecordEngine';
import {
  exerciseNamesMatch,
  normalizeExerciseName,
} from '@/utils/workoutLogHistory';
import {checkAndUnlockBadges} from '@/store/badgeStore';

type HistRow = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  exercise_name: string;
  created_at?: string;
  workout_sets?: Array<{
    weight_kg: number | string | null;
    reps: number | null;
    set_number: number;
  }> | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === '') {
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function quoteOrValue(value: string): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildMatchOr(exerciseName: string, exerciseId: string | null): string {
  const nameClause = `exercise_name.ilike.${quoteOrValue(exerciseName)}`;
  if (exerciseId) {
    return `exercise_id.eq.${exerciseId},${nameClause}`;
  }
  return nameClause;
}

function stableExerciseId(exerciseId: string | null | undefined): string | null {
  if (
    !exerciseId ||
    exerciseId.startsWith('ex-') ||
    exerciseId.startsWith('temp-')
  ) {
    return null;
  }
  return exerciseId;
}

/**
 * Historical PR baseline for one exercise (excludes current session).
 */
export async function fetchExercisePrBaseline(
  userId: string,
  exerciseName: string,
  options?: {
    excludeSessionId?: string | null;
    exerciseId?: string | null;
  },
): Promise<ExercisePrBaseline> {
  const name = exerciseName.trim();
  const exerciseId = stableExerciseId(options?.exerciseId ?? null);
  const baseline = emptyBaseline(name, exerciseId);
  if (!userId || !name) {
    return baseline;
  }

  try {
    let query = supabase
      .from('workout_exercises')
      .select(
        `
        id, session_id, exercise_id, exercise_name,
        workout_sets ( weight_kg, reps, set_number )
      `,
      )
      .eq('user_id', userId)
      .or(buildMatchOr(name, exerciseId))
      .order('created_at', {ascending: false})
      .limit(80);

    if (options?.excludeSessionId) {
      query = query.neq('session_id', options.excludeSessionId);
    }

    const {data, error} = await query;
    if (error) {
      throw error;
    }

    let maxW: number | null = null;
    const repsByWeight: Record<string, number> = {};
    let sessionsWithSets = 0;

    for (const row of (data ?? []) as HistRow[]) {
      const idMatch = Boolean(
        exerciseId && row.exercise_id && row.exercise_id === exerciseId,
      );
      const nameMatch = exerciseNamesMatch(row.exercise_name, name);
      if (!idMatch && !nameMatch) {
        continue;
      }
      const sets = row.workout_sets ?? [];
      if (sets.length === 0) {
        continue;
      }
      sessionsWithSets += 1;
      for (const s of sets) {
        const w = num(s.weight_kg);
        const r = s.reps;
        if (w == null || r == null || r < 1) {
          continue;
        }
        if (maxW == null || w > maxW) {
          maxW = w;
        }
        const wk = weightKey(w);
        const prev = repsByWeight[wk];
        if (prev == null || r > prev) {
          repsByWeight[wk] = r;
        }
      }
    }

    return {
      ...baseline,
      exerciseId: exerciseId ?? baseline.exerciseId,
      hasPriorSessions: sessionsWithSets > 0,
      maxWeightKg: maxW,
      repsByWeight,
    };
  } catch (e) {
    console.warn('[pr] fetchExercisePrBaseline', e);
    return baseline;
  }
}

/**
 * Evaluate final PRs for a completed session vs all prior history.
 */
export async function evaluateSessionPersonalRecords(
  userId: string,
  sessionId: string,
  exercises?: WorkoutExercise[],
): Promise<SessionPersonalRecords> {
  const log = exercises ?? (await fetchWorkoutLogForSession(sessionId));
  const withSets = log.filter(e => e.sets.length > 0);

  let all: DetectedPersonalRecord[] = [];
  const firsts: string[] = [];

  for (const ex of withSets) {
    const baseline = await fetchExercisePrBaseline(userId, ex.exerciseName, {
      excludeSessionId: sessionId,
      exerciseId: ex.exerciseId,
    });

    if (!baseline.hasPriorSessions) {
      firsts.push(ex.exerciseName);
      continue;
    }

    let sessionBestWeight: number | null = null;
    const sessionBestRepsAtWeight: Record<string, number> = {};

    for (const set of [...ex.sets].sort((a, b) => a.setNumber - b.setNumber)) {
      if (set.weightKg == null || set.reps == null) {
        continue;
      }
      const wk = weightKey(set.weightKg);
      const detected = detectSetPersonalRecord({
        baseline,
        weightKg: set.weightKg,
        reps: set.reps,
        sessionBestWeightKg: sessionBestWeight,
        sessionBestRepsAtWeight: sessionBestRepsAtWeight[wk] ?? null,
      });

      if (sessionBestWeight == null || set.weightKg > sessionBestWeight) {
        sessionBestWeight = set.weightKg;
      }
      const prevR = sessionBestRepsAtWeight[wk];
      if (prevR == null || set.reps > prevR) {
        sessionBestRepsAtWeight[wk] = set.reps;
      }

      if (detected) {
        all = mergeSessionRecords(all, {
          ...detected,
          workoutExerciseId: ex.id.startsWith('temp-') ? undefined : ex.id,
          setId: set.id.startsWith('temp-') ? undefined : set.id,
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
        });
      }
    }
  }

  return {
    sessionId,
    records: all,
    firstTimeExerciseNames: [...new Set(firsts)],
  };
}

export async function persistSessionPersonalRecords(
  userId: string,
  session: SessionPersonalRecords,
): Promise<void> {
  if (!session.records.length) {
    return;
  }
  await supabase
    .from('personal_record_events')
    .delete()
    .eq('user_id', userId)
    .eq('workout_session_id', session.sessionId);

  const rows = session.records.map(r => ({
    user_id: userId,
    workout_session_id: session.sessionId,
    workout_exercise_id: r.workoutExerciseId ?? null,
    set_id: r.setId ?? null,
    exercise_id: stableExerciseId(r.exerciseId),
    exercise_name: r.exerciseName,
    record_type: r.recordType,
    weight_kg: r.weightKg,
    reps: r.reps,
    previous_weight_kg: r.previousWeightKg,
    previous_reps: r.previousReps,
  }));

  const {error} = await supabase.from('personal_record_events').insert(rows);
  if (error) {
    console.warn('[pr] persistSessionPersonalRecords', error.message);
  } else {
    void checkAndUnlockBadges(userId);
  }
}

export async function buildSharedWorkoutSnapshot(
  sessionId: string,
  durationMinutes: number,
  prs: DetectedPersonalRecord[],
  exercises?: WorkoutExercise[],
): Promise<SharedWorkoutSnapshot> {
  const log = exercises ?? (await fetchWorkoutLogForSession(sessionId));
  const withSets = log.filter(e => e.sets.length > 0);
  const summary = summarizeWorkoutLog(sessionId, withSets, durationMinutes);

  return {
    sessionId,
    exerciseCount: summary.exerciseCount,
    setCount: summary.setCount,
    totalVolumeKg: summary.totalVolumeKg,
    durationMinutes,
    exercises: withSets.map(ex => ({
      name: ex.exerciseName,
      trackingType: ex.trackingType,
      sets: ex.sets.map(s => ({
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
        isPr: prs.some(
          p =>
            normalizeExerciseName(p.exerciseName) ===
              normalizeExerciseName(ex.exerciseName) &&
            p.weightKg === s.weightKg &&
            p.reps === s.reps,
        ),
      })),
    })),
    prs: prs.map(p => ({
      recordType: p.recordType,
      exerciseName: p.exerciseName,
      weightKg: p.weightKg,
      reps: p.reps,
    })),
  };
}

export async function fetchSessionPersonalRecordSetIds(
  userId: string,
  sessionId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!userId || !sessionId) {
    return out;
  }
  try {
    const {data, error} = await supabase
      .from('personal_record_events')
      .select('set_id, exercise_name, weight_kg, reps, record_type')
      .eq('user_id', userId)
      .eq('workout_session_id', sessionId);
    if (error) {
      return out;
    }
    for (const row of data ?? []) {
      if (row.set_id) {
        out.add(row.set_id as string);
      }
    }
  } catch {
    /* optional */
  }
  return out;
}

/**
 * PRs for a completed session (Share Workout / history).
 * Bound to workout_session_id === sessionId only.
 */
export async function fetchSessionPersonalRecordsForShare(
  userId: string,
  sessionId: string,
): Promise<DetectedPersonalRecord[]> {
  if (!userId || !sessionId) {
    return [];
  }
  try {
    const {data, error} = await supabase
      .from('personal_record_events')
      .select(
        'exercise_id, exercise_name, record_type, weight_kg, reps, previous_weight_kg, previous_reps, set_id, workout_exercise_id',
      )
      .eq('user_id', userId)
      .eq('workout_session_id', sessionId)
      .order('created_at', {ascending: true});
    if (error) {
      return [];
    }
    const out: DetectedPersonalRecord[] = [];
    for (const row of data ?? []) {
      const w = num(row.weight_kg as number | string | null);
      const r = row.reps as number | null;
      if (w == null || r == null) {
        continue;
      }
      out.push({
        recordType: (row.record_type as DetectedPersonalRecord['recordType']) ?? 'weight_pr',
        exerciseId: (row.exercise_id as string | null) ?? null,
        exerciseName: (row.exercise_name as string) || 'Exercise',
        workoutExerciseId: (row.workout_exercise_id as string | undefined) ?? undefined,
        setId: (row.set_id as string | undefined) ?? undefined,
        weightKg: w,
        reps: Number(r),
        previousWeightKg: num(row.previous_weight_kg as number | string | null),
        previousReps:
          row.previous_reps == null ? null : Number(row.previous_reps),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Current Weight PRs per exercise for profile.
 */
export async function fetchProfilePersonalRecords(
  userId: string,
): Promise<ProfilePersonalRecord[]> {
  if (!userId) {
    return [];
  }
  try {
    const {data, error} = await supabase
      .from('personal_record_events')
      .select(
        'exercise_id, exercise_name, record_type, weight_kg, reps, created_at, workout_session_id',
      )
      .eq('user_id', userId)
      .eq('record_type', 'weight_pr')
      .order('created_at', {ascending: false})
      .limit(200);

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return deriveProfilePrsFromHistory(userId);
      }
      throw error;
    }

    const seen = new Set<string>();
    const out: ProfilePersonalRecord[] = [];
    for (const row of data ?? []) {
      const key = exercisePrKey(
        (row.exercise_id as string | null) ?? null,
        row.exercise_name as string,
      );
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const w = num(row.weight_kg as number | string | null);
      const r = row.reps as number | null;
      if (w == null || r == null) {
        continue;
      }
      out.push({
        exerciseKey: key,
        exerciseId: (row.exercise_id as string | null) ?? null,
        exerciseName: row.exercise_name as string,
        weightKg: w,
        reps: r,
        recordType: 'weight_pr',
        achievedAt: row.created_at as string,
        sessionId: row.workout_session_id as string,
      });
    }
    if (out.length === 0) {
      return deriveProfilePrsFromHistory(userId);
    }
    return out;
  } catch (e) {
    console.warn('[pr] fetchProfilePersonalRecords', e);
    return deriveProfilePrsFromHistory(userId);
  }
}

async function deriveProfilePrsFromHistory(
  userId: string,
): Promise<ProfilePersonalRecord[]> {
  const {data, error} = await supabase
    .from('workout_exercises')
    .select(
      `
      exercise_id, exercise_name, session_id, created_at,
      workout_sets ( weight_kg, reps, set_number )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', {ascending: false})
    .limit(300);

  if (error || !data) {
    return [];
  }

  const best = new Map<string, ProfilePersonalRecord>();

  for (const row of data as HistRow[]) {
    const key = exercisePrKey(row.exercise_id, row.exercise_name);
    for (const s of row.workout_sets ?? []) {
      const w = num(s.weight_kg);
      const r = s.reps;
      if (w == null || r == null || r < 1) {
        continue;
      }
      const prev = best.get(key);
      if (!prev || w > prev.weightKg || (w === prev.weightKg && r > prev.reps)) {
        best.set(key, {
          exerciseKey: key,
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          weightKg: w,
          reps: r,
          recordType: 'weight_pr',
          achievedAt: row.created_at ?? new Date().toISOString(),
          sessionId: row.session_id,
        });
      }
    }
  }

  return [...best.values()].sort((a, b) => b.weightKg - a.weightKg);
}
