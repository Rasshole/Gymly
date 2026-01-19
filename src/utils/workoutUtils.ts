/**
 * Workout Utilities
 * Shared utility functions for workout-related operations
 */

import {MuscleGroup} from '@/types/workout.types';

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: 'Bryst'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'skulder', label: 'Skulder'},
  {key: 'ben', label: 'Ben'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'mave', label: 'Mave'},
  {key: 'ryg', label: 'Ryg'},
  {key: 'hele_kroppen', label: 'Hele kroppen'},
];

/**
 * Format muscle group selection into readable text
 */
export const formatMuscleSelection = (groups: MuscleGroup[]): string => {
  if (groups.length === 0) {
    return 'Fri træning';
  }
  return groups
    .map(group => MUSCLE_GROUPS.find(item => item.key === group)?.label || group)
    .join(', ');
};

/**
 * Format duration in milliseconds to HH:MM:SS format
 */
export const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

