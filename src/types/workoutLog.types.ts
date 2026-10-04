/**
 * Workout log (fase 1) — øvelser + sæt knyttet til aktiv check-in.
 * sessionId = check_ins.id
 */

export type WorkoutTrackingType =
  | 'weight_reps'
  | 'reps_only'
  | 'duration'
  | 'distance_duration';

export type WorkoutMuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'full_body'
  | 'cardio'
  /** Legacy snapshots / older library rows */
  | 'legs'
  | 'arms';

export type ExerciseEquipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'smith'
  | 'kettlebell'
  | 'cardio_machine'
  | 'other';

export type ExerciseLibraryItem = {
  id: string;
  name: string;
  muscleGroup: WorkoutMuscleGroup;
  trackingType: WorkoutTrackingType;
  sortOrder?: number;
  equipment?: ExerciseEquipment;
  /** Extra search terms (aliases / abbreviations) */
  aliases?: string[];
  /** True when created by the signed-in user (device-persisted) */
  isCustom?: boolean;
};

export type WorkoutSet = {
  id: string;
  workoutExerciseId: string;
  sessionId: string;
  userId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Vises med det samme, mens lagring kører i baggrunden. */
  pending?: boolean;
  /** Lagring fejlede. Rækken må ikke behandles som gemt. */
  failed?: boolean;
  /** Client clientKey til dedupe ved retry */
  clientKey?: string;
};

export type WorkoutExercise = {
  id: string;
  sessionId: string;
  userId: string;
  exerciseId: string | null;
  exerciseName: string;
  muscleGroup: string | null;
  trackingType: WorkoutTrackingType;
  position: number;
  createdAt: string;
  updatedAt: string;
  sets: WorkoutSet[];
};

export type WorkoutLogSummary = {
  sessionId: string;
  exerciseCount: number;
  setCount: number;
  /** Sum vægt × reps for weight_reps sæt */
  totalVolumeKg: number;
  durationMinutes: number;
};

export type WorkoutLiveStatus = {
  liveExerciseName: string | null;
  liveSetCount: number | null;
  liveExerciseCount: number | null;
};

/** Snapshot of a set from a previous session (last-time / history). */
export type LastExerciseSetSnapshot = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/** Most recent prior occurrence of an exercise (excludes current session). */
export type LastExercisePerformance = {
  workoutExerciseId: string;
  sessionId: string;
  exerciseId: string | null;
  exerciseName: string;
  trackingType: WorkoutTrackingType;
  /** ISO timestamp used for "Last time · Aug 5" (session started_at or exercise created_at). */
  performedAt: string;
  sets: LastExerciseSetSnapshot[];
};

/** One past session bucket for exercise history modal. */
export type ExerciseHistorySession = {
  sessionId: string;
  performedAt: string;
  trackingType: WorkoutTrackingType;
  sets: LastExerciseSetSnapshot[];
};

export type SetProgression =
  | {kind: 'weight'; deltaKg: number}
  | {kind: 'reps'; deltaReps: number};

/** Aggregated counts for a completed session (list cards). */
export type WorkoutSessionLogSummary = {
  sessionId: string;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
};
