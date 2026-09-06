/**
 * Pure helpers for last-time / exercise history (no Supabase).
 */

import type {
  LastExercisePerformance,
  LastExerciseSetSnapshot,
  SetProgression,
  WorkoutSet,
  WorkoutTrackingType,
} from '@/types/workoutLog.types';
import {formatReps, formatWeightKg} from '@/utils/workoutLogFormat';

export function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function exerciseNamesMatch(a: string, b: string): boolean {
  return normalizeExerciseName(a) === normalizeExerciseName(b);
}

/** Prefill for set number N (1-based) from last-time sets. */
export function prefillFromLastPerformance(
  last: LastExercisePerformance | null | undefined,
  setNumber: number,
): {weightKg: number | null; reps: number | null} {
  if (!last?.sets?.length) {
    return {weightKg: null, reps: null};
  }
  const exact = last.sets.find(s => s.setNumber === setNumber);
  const fallback = last.sets[last.sets.length - 1];
  const src = exact ?? fallback;
  return {
    weightKg: src.weightKg,
    reps: src.reps,
  };
}

/**
 * Positive-only progression vs matching previous set number.
 * Prefer weight increase; else same/higher weight with more reps.
 */
export function computeSetProgression(
  today: Pick<WorkoutSet, 'weightKg' | 'reps' | 'setNumber'>,
  previousSets: LastExerciseSetSnapshot[],
): SetProgression | null {
  const prev = previousSets.find(s => s.setNumber === today.setNumber);
  if (!prev) {
    return null;
  }
  const tw = today.weightKg;
  const tr = today.reps;
  const pw = prev.weightKg;
  const pr = prev.reps;

  if (tw != null && pw != null && tw > pw) {
    const delta = Math.round((tw - pw) * 100) / 100;
    return {kind: 'weight', deltaKg: delta};
  }
  if (
    tw != null &&
    pw != null &&
    tw >= pw &&
    tr != null &&
    pr != null &&
    tr > pr
  ) {
    return {kind: 'reps', deltaReps: tr - pr};
  }
  // Weight unknown / reps-only: compare reps only
  if (tw == null && pw == null && tr != null && pr != null && tr > pr) {
    return {kind: 'reps', deltaReps: tr - pr};
  }
  return null;
}

export function formatLastSetLine(
  set: LastExerciseSetSnapshot,
  trackingType: WorkoutTrackingType,
): string {
  if (trackingType === 'reps_only') {
    return formatReps(set.reps);
  }
  if (trackingType === 'duration') {
    const sec = set.durationSeconds;
    if (sec == null) {
      return '—';
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }
  if (trackingType === 'distance_duration') {
    const parts: string[] = [];
    if (set.distanceMeters != null) {
      const km = set.distanceMeters / 1000;
      parts.push(
        km >= 1
          ? `${(Math.round(km * 100) / 100).toString().replace('.', ',')} km`
          : `${Math.round(set.distanceMeters)} m`,
      );
    }
    if (set.durationSeconds != null) {
      const m = Math.floor(set.durationSeconds / 60);
      parts.push(`${m} min`);
    }
    return parts.length ? parts.join(' · ') : '—';
  }
  return `${formatWeightKg(set.weightKg)} · ${formatReps(set.reps)}`;
}

export function formatProgressionBadge(p: SetProgression): string {
  if (p.kind === 'weight') {
    const n = Number.isInteger(p.deltaKg)
      ? String(p.deltaKg)
      : String(p.deltaKg).replace('.', ',');
    return `↑ +${n} kg`;
  }
  return `↑ +${p.deltaReps} reps`;
}
