/**
 * Pure PR detection helpers (no Supabase).
 */

import type {
  DetectedPersonalRecord,
  ExercisePrBaseline,
  PersonalRecordType,
} from '@/types/personalRecord.types';
import {normalizeExerciseName} from '@/utils/workoutLogHistory';

export function weightKey(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function exercisePrKey(
  exerciseId: string | null | undefined,
  exerciseName: string,
): string {
  if (exerciseId && !exerciseId.startsWith('ex-') && !exerciseId.startsWith('temp-')) {
    return `id:${exerciseId}`;
  }
  return `name:${normalizeExerciseName(exerciseName)}`;
}

export function emptyBaseline(
  exerciseName: string,
  exerciseId: string | null,
): ExercisePrBaseline {
  return {
    exerciseKey: exercisePrKey(exerciseId, exerciseName),
    exerciseId,
    exerciseName,
    hasPriorSessions: false,
    maxWeightKg: null,
    repsByWeight: {},
  };
}

/**
 * Compare one completed set against historical baseline + session-best so far.
 * Equaling a record is not a PR. First-ever exercise → no PR.
 */
export function detectSetPersonalRecord(params: {
  baseline: ExercisePrBaseline;
  weightKg: number;
  reps: number;
  /** Best weight PR achieved earlier in THIS session for this exercise */
  sessionBestWeightKg?: number | null;
  /** Best reps at this weight earlier in THIS session */
  sessionBestRepsAtWeight?: number | null;
}): DetectedPersonalRecord | null {
  const {baseline, weightKg, reps} = params;
  if (!Number.isFinite(weightKg) || weightKg < 0 || !Number.isFinite(reps) || reps < 1) {
    return null;
  }
  if (!baseline.hasPriorSessions) {
    return null;
  }

  const histMax = baseline.maxWeightKg;
  const sessionBestW = params.sessionBestWeightKg ?? null;
  const effectivePrevMax =
    sessionBestW != null && histMax != null
      ? Math.max(histMax, sessionBestW)
      : sessionBestW != null
        ? sessionBestW
        : histMax;

  // Weight PR: strictly heavier than historical + session best so far
  if (effectivePrevMax == null || weightKg > effectivePrevMax) {
    return {
      recordType: 'weight_pr',
      exerciseId: baseline.exerciseId,
      exerciseName: baseline.exerciseName,
      weightKg,
      reps,
      previousWeightKg: histMax,
      previousReps:
        histMax != null ? baseline.repsByWeight[weightKey(histMax)] ?? null : null,
    };
  }

  // Rep PR at exact same weight — must beat historical best at that weight.
  // First time at a weight is not a rep PR (baseline only).
  const wk = weightKey(weightKg);
  const histReps = baseline.repsByWeight[wk] ?? null;
  if (histReps == null) {
    return null;
  }
  const sessionReps = params.sessionBestRepsAtWeight ?? null;
  const effectivePrevReps =
    sessionReps != null ? Math.max(histReps, sessionReps) : histReps;

  if (reps > effectivePrevReps) {
    return {
      recordType: 'rep_pr',
      exerciseId: baseline.exerciseId,
      exerciseName: baseline.exerciseName,
      weightKg,
      reps,
      previousWeightKg: weightKg,
      previousReps: histReps,
    };
  }

  return null;
}

/** Prefer weight_pr over rep_pr when both apply (UI). */
export function preferRecordType(
  a: PersonalRecordType,
  b: PersonalRecordType,
): PersonalRecordType {
  if (a === 'weight_pr' || b === 'weight_pr') {
    return 'weight_pr';
  }
  return 'rep_pr';
}

/**
 * Merge session PR list: keep best weight_pr per exercise; keep best rep_pr per exercise+weight.
 */
export function mergeSessionRecords(
  existing: DetectedPersonalRecord[],
  next: DetectedPersonalRecord,
): DetectedPersonalRecord[] {
  if (next.recordType === 'weight_pr') {
    const without = existing.filter(
      r =>
        !(
          r.recordType === 'weight_pr' &&
          exercisePrKey(r.exerciseId, r.exerciseName) ===
            exercisePrKey(next.exerciseId, next.exerciseName)
        ),
    );
    // Drop rep_pr for same exercise if weight PR supersedes presentation
    const cleaned = without.filter(
      r =>
        !(
          r.recordType === 'rep_pr' &&
          exercisePrKey(r.exerciseId, r.exerciseName) ===
            exercisePrKey(next.exerciseId, next.exerciseName) &&
          weightKey(r.weightKg) === weightKey(next.weightKg)
        ),
    );
    return [...cleaned, next];
  }

  // rep_pr
  const without = existing.filter(
    r =>
      !(
        r.recordType === 'rep_pr' &&
        exercisePrKey(r.exerciseId, r.exerciseName) ===
          exercisePrKey(next.exerciseId, next.exerciseName) &&
        weightKey(r.weightKg) === weightKey(next.weightKg)
      ),
  );
  // If we already have a weight_pr for this lift at same/higher weight, skip rep badge clutter
  const hasWeightPr = without.some(
    r =>
      r.recordType === 'weight_pr' &&
      exercisePrKey(r.exerciseId, r.exerciseName) ===
        exercisePrKey(next.exerciseId, next.exerciseName),
  );
  if (hasWeightPr) {
    return without;
  }
  return [...without, next];
}

export function formatPrHeadline(
  record: DetectedPersonalRecord,
  lang: 'da' | 'en' = 'da',
): string {
  const w = weightKey(record.weightKg).replace('.', ',');
  if (lang === 'en') {
    return `${record.exerciseName} · ${w} kg × ${record.reps}`;
  }
  return `${record.exerciseName} · ${w} kg × ${record.reps}`;
}
