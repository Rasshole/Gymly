/**
 * Personal record types — extensible for future PR kinds.
 */

export type PersonalRecordType = 'weight_pr' | 'rep_pr';

export type ExercisePrBaseline = {
  /** Stable key: exercise UUID or normalized name */
  exerciseKey: string;
  exerciseId: string | null;
  exerciseName: string;
  /** False = first prior session does not exist → baseline only */
  hasPriorSessions: boolean;
  maxWeightKg: number | null;
  /** Exact weight string key → best reps at that weight */
  repsByWeight: Record<string, number>;
};

export type DetectedPersonalRecord = {
  recordType: PersonalRecordType;
  exerciseId: string | null;
  exerciseName: string;
  workoutExerciseId?: string;
  setId?: string;
  weightKg: number;
  reps: number;
  previousWeightKg: number | null;
  previousReps: number | null;
};

export type SessionPersonalRecords = {
  sessionId: string;
  /** Final PRs for the session (deduped: one weight PR per exercise, etc.) */
  records: DetectedPersonalRecord[];
  /** Exercises logged for the first time ever (no prior sessions) */
  firstTimeExerciseNames: string[];
};

export type SharedWorkoutSetSnapshot = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  isPr?: boolean;
};

export type SharedWorkoutExerciseSnapshot = {
  name: string;
  trackingType: string;
  sets: SharedWorkoutSetSnapshot[];
};

export type SharedWorkoutSnapshot = {
  sessionId: string;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
  durationMinutes: number;
  exercises: SharedWorkoutExerciseSnapshot[];
  prs: Array<{
    recordType: PersonalRecordType;
    exerciseName: string;
    weightKg: number;
    reps: number;
  }>;
};

export type ProfilePersonalRecord = {
  exerciseKey: string;
  exerciseId: string | null;
  exerciseName: string;
  weightKg: number;
  reps: number;
  recordType: PersonalRecordType;
  achievedAt: string;
  sessionId: string;
};
