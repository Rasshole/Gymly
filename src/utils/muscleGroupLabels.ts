/**
 * Muscle / training type labels (check-in, session, feed) — locale-aware.
 */

import {MuscleGroup} from '@/types/workout.types';
import type {AppLanguage} from '@/i18n/types';

export const MUSCLE_GROUP_LABELS_DK: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  triceps: 'Triceps',
  skulder: 'Skulder',
  ben: 'Ben',
  biceps: 'Biceps',
  mave: 'Mave',
  ryg: 'Ryg',
  cardio: 'Cardio',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

export const MUSCLE_GROUP_LABELS_EN: Record<MuscleGroup, string> = {
  bryst: 'Chest',
  triceps: 'Triceps',
  skulder: 'Shoulder',
  ben: 'Legs',
  biceps: 'Biceps',
  mave: 'Abs',
  ryg: 'Back',
  cardio: 'Cardio',
  reformer: 'Reformer',
  pilates: 'Pilates',
};

const ALL_KEYS = new Set<string>(Object.keys(MUSCLE_GROUP_LABELS_DK));

export function getMuscleGroupLabel(key: MuscleGroup, language: AppLanguage): string {
  if (language === 'en') {
    return MUSCLE_GROUP_LABELS_EN[key];
  }
  return MUSCLE_GROUP_LABELS_DK[key];
}

export function labelForMuscleToken(raw: string, language: AppLanguage): string {
  const k = normalizeLegacyMuscleKey(raw.trim());
  if (k && ALL_KEYS.has(k)) {
    return getMuscleGroupLabel(k as MuscleGroup, language);
  }
  const u = raw.trim();
  if (u.toLowerCase() === 'fri') {
    return language === 'en' ? 'Open workout' : 'Fri træning';
  }
  return u || (language === 'en' ? 'Workout' : 'Træning');
}

/**
 * Træningstyper der på check-in fylder "hele kortet" alene (kan ikke kombineres med
 * specifikke muskelgrupper indtil produktet understøtter fx Cardio + Ben).
 */
export const CHECKIN_EXCLUSIVE_GROUP_KEYS: ReadonlySet<MuscleGroup> = new Set([
  'cardio',
]);

/** Normaliser ældre keys fra DB/notifikationer */
export function normalizeLegacyMuscleKey(part: string): string {
  const p = part.trim().toLowerCase().replace(/\s+/g, '_');
  if (p === 'hele_kroppen') {
    return 'cardio';
  }
  return p;
}

/** Brug til feed/API-strenge så `hele_kroppen` altid vises som cardio-ikon */
export function coerceMuscleGroup(raw: string): MuscleGroup {
  const k = normalizeLegacyMuscleKey(raw);
  return ALL_KEYS.has(k) ? (k as MuscleGroup) : 'cardio';
}

/**
 * Serializes selected groups for session / workout history (comma-separated keys).
 */
export function encodeMuscleGroupsForSession(groups: MuscleGroup[]): string {
  const sorted = [...new Set(groups)].sort();
  if (sorted.length === 0) {
    return 'cardio';
  }
  if (sorted.length === 1 && sorted[0] === 'cardio') {
    return 'cardio';
  }
  const specific = sorted.filter(g => !CHECKIN_EXCLUSIVE_GROUP_KEYS.has(g));
  return specific.length > 0 ? specific.join(',') : 'cardio';
}

/**
 * Gem tjek-ind: gem valgte typer som streng (cardio inkl.). Tom streng → undefined.
 */
export function workoutTypeForFirestoreCheckIn(encoded: string): string | undefined {
  const t = encoded.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Human-readable list for UI (handles comma-separated keys from storage).
 */
export function formatWorkoutTypeDisplay(
  workoutType: string | undefined | null,
  language: AppLanguage = 'da',
): string {
  if (!workoutType?.trim()) {
    return getMuscleGroupLabel('cardio', language);
  }
  const parts = workoutType.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return getMuscleGroupLabel('cardio', language);
  }
  return parts.map(p => labelForMuscleToken(p, language)).join(', ');
}

/**
 * Genskab muskelgrupper fra session-streng (kommaseparerede keys).
 * Legacy `hele_kroppen` mappes til `cardio`.
 */
export function parseMuscleGroupsFromSession(workoutType: string): MuscleGroup[] {
  if (!workoutType?.trim()) {
    return ['cardio'];
  }
  const parts = workoutType
    .split(',')
    .map(s => normalizeLegacyMuscleKey(s.trim()))
    .filter(Boolean);
  const valid = parts.filter(p => ALL_KEYS.has(p)) as MuscleGroup[];
  return valid.length > 0 ? valid : ['cardio'];
}

/**
 * Check-in grid: `cardio` er eksklusiv; andre typer er multi-select (indtil produktet udvider).
 */
export function toggleCheckInMuscleGroup(
  prev: MuscleGroup[],
  key: MuscleGroup,
): MuscleGroup[] {
  if (CHECKIN_EXCLUSIVE_GROUP_KEYS.has(key)) {
    return [key];
  }
  const withoutExclusive = prev.filter(k => !CHECKIN_EXCLUSIVE_GROUP_KEYS.has(k));
  if (withoutExclusive.includes(key)) {
    const next = withoutExclusive.filter(k => k !== key);
    return next.length === 0 ? ['cardio'] : next;
  }
  return [...withoutExclusive, key];
}
