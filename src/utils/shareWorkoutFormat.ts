/**
 * Pure formatters for Share Workout cards (locale-aware where needed).
 */

import type {AppLanguage} from '@/i18n/types';
import {getIntlLocale} from '@/i18n/locales';
import type {ShareWorkoutPrItem} from '@/types/shareWorkout.types';
import type {WorkoutExercise, WorkoutMuscleGroup} from '@/types/workoutLog.types';
import {formatWorkoutTypeDisplay, labelForMuscleToken} from '@/utils/muscleGroupLabels';
import {sessionDurationMinutes} from '@/utils/trainingStatsFromCheckIns';

const EXERCISE_MUSCLE_LABELS: Record<
  AppLanguage,
  Record<WorkoutMuscleGroup, string>
> = {
  da: {
    chest: 'Bryst',
    back: 'Ryg',
    shoulders: 'Skuldre',
    biceps: 'Biceps',
    triceps: 'Triceps',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Calves',
    core: 'Core',
    full_body: 'Hele kroppen',
    cardio: 'Cardio',
    legs: 'Ben',
    arms: 'Arme',
  },
  en: {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    biceps: 'Biceps',
    triceps: 'Triceps',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Calves',
    core: 'Core',
    full_body: 'Full body',
    cardio: 'Cardio',
    legs: 'Legs',
    arms: 'Arms',
  },
  sv: {
    chest: 'Bröst',
    back: 'Rygg',
    shoulders: 'Axlar',
    biceps: 'Biceps',
    triceps: 'Triceps',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Vader',
    core: 'Core',
    full_body: 'Helkropp',
    cardio: 'Cardio',
    legs: 'Ben',
    arms: 'Armar',
  },
  nb: {
    chest: 'Bryst',
    back: 'Rygg',
    shoulders: 'Skuldre',
    biceps: 'Biceps',
    triceps: 'Triceps',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Legger',
    core: 'Core',
    full_body: 'Helkropp',
    cardio: 'Cardio',
    legs: 'Ben',
    arms: 'Armer',
  },
};

const MAX_MUSCLE_GROUPS = 4;
const KG_TO_LB = 2.2046226218;

function labelExerciseMuscle(raw: string, language: AppLanguage): string | null {
  const key = raw.trim().toLowerCase() as WorkoutMuscleGroup;
  const table = EXERCISE_MUSCLE_LABELS[language];
  if (key in table) {
    return table[key];
  }
  const legacy = labelForMuscleToken(raw, language);
  return legacy || null;
}

/**
 * Authoritative share-card duration precedence:
 * 1. check_ins.duration_minutes when persisted and > 0
 * 2. sessionDurationMinutes(started_at, ended_at)
 * 3. null — hide duration on card (never show misleading values)
 */
export function resolveShareWorkoutDurationMinutes(params: {
  durationMinutesStored?: number | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
}): number | null {
  const stored = params.durationMinutesStored;
  if (stored != null && Number.isFinite(stored) && stored > 0) {
    return Math.round(stored);
  }

  const started =
    params.startedAt instanceof Date
      ? params.startedAt
      : params.startedAt
        ? new Date(params.startedAt)
        : null;
  const ended =
    params.endedAt instanceof Date
      ? params.endedAt
      : params.endedAt
        ? new Date(params.endedAt)
        : null;

  if (
    !started ||
    !ended ||
    Number.isNaN(started.getTime()) ||
    Number.isNaN(ended.getTime())
  ) {
    return null;
  }

  const deltaMs = ended.getTime() - started.getTime();
  if (deltaMs <= 0) {
    return null;
  }

  return sessionDurationMinutes(started, ended);
}

/** Share-card duration: "1h 24m" / "45m" — null when unreliable. */
export function formatShareDuration(
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const mins = Math.max(0, Math.round(minutes));
  if (mins < 60) {
    return `${mins}m`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

/** Volume for share cards — returns null when volume should be hidden. */
export function formatShareVolumeKg(
  volumeKg: number,
  language: AppLanguage,
  volumeLabel?: string,
  unit: 'kg' | 'lb' = 'kg',
): string | null {
  if (!Number.isFinite(volumeKg) || volumeKg <= 0) {
    return null;
  }
  const displayValue =
    unit === 'lb'
      ? Math.round(volumeKg * KG_TO_LB)
      : Math.round(volumeKg);
  const unitLabel = unit === 'lb' ? 'lb' : 'kg';
  const formatted = `${displayValue.toLocaleString(getIntlLocale(language))} ${unitLabel}`;
  return volumeLabel ? `${formatted} ${volumeLabel}` : formatted;
}

export function formatShareDate(iso: string, language: AppLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString(getIntlLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Legacy: workout type string → display with + separator. */
export function formatShareMuscleGroups(
  workoutType: string | null | undefined,
  language: AppLanguage,
): string {
  return formatShareMuscleGroupsList([], workoutType, language);
}

/**
 * Muscle groups for share card: dedupe, max 4, append "+N" for extras.
 * Prefers completed exercises; falls back to session workout type.
 */
export function formatShareMuscleGroupsList(
  exercises: WorkoutExercise[],
  workoutType: string | null | undefined,
  language: AppLanguage,
): string {
  const fromExercises: string[] = [];
  for (const ex of exercises) {
    const hasCompletedSet = ex.sets.some(
      s =>
        (s.weightKg != null && s.reps != null && s.reps >= 1) ||
        (s.reps != null && s.reps >= 1) ||
        s.durationSeconds != null ||
        s.distanceMeters != null,
    );
    if (!hasCompletedSet) {
      continue;
    }
    if (ex.muscleGroup?.trim()) {
      const label = labelExerciseMuscle(ex.muscleGroup, language);
      if (label) {
        fromExercises.push(label);
      }
    }
  }

  const unique = [...new Set(fromExercises)];
  if (unique.length === 0) {
    const fallback = formatWorkoutTypeDisplay(workoutType ?? '', language);
    if (!fallback.trim()) {
      return '';
    }
    const parts = fallback.split(',').map(s => s.trim()).filter(Boolean);
    return formatTruncatedMuscleList(parts);
  }
  return formatTruncatedMuscleList(unique);
}

export function formatTruncatedMuscleList(labels: string[]): string {
  const clean = [...new Set(labels.map(s => s.trim()).filter(Boolean))];
  if (clean.length === 0) {
    return '';
  }
  if (clean.length <= MAX_MUSCLE_GROUPS) {
    return clean.join(' · ');
  }
  const shown = clean.slice(0, MAX_MUSCLE_GROUPS);
  const extra = clean.length - MAX_MUSCLE_GROUPS;
  return `${shown.join(' · ')} · +${extra}`;
}

/** Strongest PR first (weight×reps), then weight, then reps. */
export function rankSharePrs(prs: ShareWorkoutPrItem[]): ShareWorkoutPrItem[] {
  return [...prs].sort((a, b) => {
    if (b.strengthScore !== a.strengthScore) {
      return b.strengthScore - a.strengthScore;
    }
    if (b.weightKg !== a.weightKg) {
      return b.weightKg - a.weightKg;
    }
    return b.reps - a.reps;
  });
}

export function formatSharePrLift(weightKg: number, reps: number): string {
  const w = Number.isInteger(weightKg) ? String(weightKg) : weightKg.toFixed(1);
  return `${w} KG × ${reps}`;
}
