/**
 * User-scoped custom exercises for Log Workout.
 * Stored in AsyncStorage (not global exercise_library) so customs stay private.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '@/services/supabase/supabaseClient';
import type {
  ExerciseEquipment,
  ExerciseLibraryItem,
  WorkoutMuscleGroup,
  WorkoutTrackingType,
} from '@/types/workoutLog.types';

const STORAGE_PREFIX = '@gymly/custom_exercises:';

type CustomExerciseRecord = {
  id: string;
  name: string;
  muscleGroup: WorkoutMuscleGroup;
  equipment: ExerciseEquipment;
  trackingType: WorkoutTrackingType;
  createdAt: string;
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

async function resolveUserId(explicit?: string | null): Promise<string | null> {
  if (explicit) {
    return explicit;
  }
  try {
    const {data} = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function toLibraryItem(row: CustomExerciseRecord): ExerciseLibraryItem {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    trackingType: row.trackingType,
    equipment: row.equipment,
    sortOrder: 9999,
    isCustom: true,
  };
}

async function readRecords(userId: string): Promise<CustomExerciseRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CustomExerciseRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadCustomExercises(
  userId?: string | null,
): Promise<ExerciseLibraryItem[]> {
  const uid = await resolveUserId(userId);
  if (!uid) {
    return [];
  }
  const rows = await readRecords(uid);
  return rows.map(toLibraryItem);
}

export async function createCustomExercise(params: {
  name: string;
  muscleGroup: WorkoutMuscleGroup;
  equipment: ExerciseEquipment;
  trackingType?: WorkoutTrackingType;
  userId?: string | null;
}): Promise<ExerciseLibraryItem> {
  const uid = await resolveUserId(params.userId);
  if (!uid) {
    throw new Error('Not signed in');
  }
  const name = params.name.trim();
  if (!name) {
    throw new Error('Name required');
  }

  const existing = await readRecords(uid);
  const dup = existing.find(
    e => e.name.toLowerCase() === name.toLowerCase(),
  );
  if (dup) {
    return toLibraryItem(dup);
  }

  const row: CustomExerciseRecord = {
    id: `custom-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    name,
    muscleGroup: params.muscleGroup,
    equipment: params.equipment,
    trackingType: params.trackingType ?? 'weight_reps',
    createdAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    storageKey(uid),
    JSON.stringify([...existing, row]),
  );
  return toLibraryItem(row);
}
