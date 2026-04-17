/**
 * Danish labels and helpers for muscle / training types (check-in, session, feed).
 */

import {MuscleGroup} from '@/types/workout.types';

export const MUSCLE_GROUP_LABELS_DK: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  hele_kroppen: 'Hele kroppen',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

const ALL_KEYS = new Set<string>(Object.keys(MUSCLE_GROUP_LABELS_DK));

/**
 * Serializes selected groups for session / workout history (comma-separated keys).
 */
export function encodeMuscleGroupsForSession(groups: MuscleGroup[]): string {
  const sorted = [...new Set(groups)].sort();
  if (sorted.length === 0) {
    return 'hele_kroppen';
  }
  if (sorted.length === 1 && sorted[0] === 'hele_kroppen') {
    return 'hele_kroppen';
  }
  const specific = sorted.filter(g => g !== 'hele_kroppen');
  return specific.length > 0 ? specific.join(',') : 'hele_kroppen';
}

/**
 * Firestore check-in: omit workout type when it is only "whole body" (same as before).
 */
export function workoutTypeForFirestoreCheckIn(encoded: string): string | undefined {
  return encoded === 'hele_kroppen' ? undefined : encoded;
}

/**
 * Human-readable list for UI (handles comma-separated keys from storage).
 */
export function formatWorkoutTypeDisplay(workoutType: string | undefined | null): string {
  if (!workoutType?.trim()) {
    return MUSCLE_GROUP_LABELS_DK.hele_kroppen;
  }
  const parts = workoutType.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return MUSCLE_GROUP_LABELS_DK.hele_kroppen;
  }
  return parts
    .map(p => (ALL_KEYS.has(p) ? MUSCLE_GROUP_LABELS_DK[p as MuscleGroup] : p))
    .join(', ');
}

/**
 * Check-in grid: "Hele kroppen" is exclusive; other types are multi-select.
 */
/**
 * Genskab muskelgrupper fra session-streng (kommaseparerede keys).
 */
export function parseMuscleGroupsFromSession(workoutType: string): MuscleGroup[] {
  if (!workoutType?.trim()) {
    return ['hele_kroppen'];
  }
  const parts = workoutType.split(',').map(s => s.trim()).filter(Boolean);
  const valid = parts.filter(p => ALL_KEYS.has(p)) as MuscleGroup[];
  return valid.length > 0 ? valid : ['hele_kroppen'];
}

export function toggleCheckInMuscleGroup(
  prev: MuscleGroup[],
  key: MuscleGroup,
): MuscleGroup[] {
  if (key === 'hele_kroppen') {
    return ['hele_kroppen'];
  }
  const withoutHele = prev.filter(k => k !== 'hele_kroppen');
  if (withoutHele.includes(key)) {
    const next = withoutHele.filter(k => k !== key);
    return next.length === 0 ? ['hele_kroppen'] : next;
  }
  return [...withoutHele, key];
}
