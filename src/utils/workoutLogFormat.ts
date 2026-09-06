/**
 * Format helpers for workout log UI.
 */

import {getIntlLocale, getRuntimeLanguage} from '@/i18n';

export function formatWeightKg(kg: number | null | undefined): string {
  if (kg == null) {
    return '—';
  }
  const rounded = Math.round(kg * 100) / 100;
  const str = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
  return `${str} kg`;
}

export function formatReps(reps: number | null | undefined): string {
  if (reps == null) {
    return '—';
  }
  return `${reps} reps`;
}

export function formatVolumeKg(volume: number): string {
  if (!Number.isFinite(volume) || volume <= 0) {
    return '0 kg';
  }
  const rounded = Math.round(volume);
  return `${rounded.toLocaleString(getIntlLocale(getRuntimeLanguage()))} kg`;
}

export function formatSessionElapsedMinutes(seconds: number): string {
  const m = Math.max(0, Math.floor(seconds / 60));
  return `${m} min.`;
}

export function muscleGroupLabelDa(group: string): string {
  switch (group) {
    case 'chest':
      return 'Bryst';
    case 'back':
      return 'Ryg';
    case 'shoulders':
      return 'Skuldre';
    case 'biceps':
      return 'Biceps';
    case 'triceps':
      return 'Triceps';
    case 'quads':
      return 'Quads';
    case 'hamstrings':
      return 'Hamstrings';
    case 'calves':
      return 'Calves';
    case 'legs':
      return 'Ben';
    case 'arms':
      return 'Arme';
    case 'glutes':
      return 'Glutes';
    case 'core':
      return 'Core';
    case 'full_body':
      return 'Full Body';
    case 'cardio':
      return 'Cardio';
    default:
      return group;
  }
}

export function equipmentLabelDa(equipment: string): string {
  switch (equipment) {
    case 'barbell':
      return 'Barbell';
    case 'dumbbell':
      return 'Dumbbell';
    case 'machine':
      return 'Machine';
    case 'cable':
      return 'Cable';
    case 'bodyweight':
      return 'Bodyweight';
    case 'smith':
      return 'Smith Machine';
    case 'kettlebell':
      return 'Kettlebell';
    case 'cardio_machine':
      return 'Cardio Machine';
    case 'other':
      return 'Other';
    default:
      return equipment;
  }
}
