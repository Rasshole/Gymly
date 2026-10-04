/**
 * Share Workout — shareable story cards from a completed session.
 * sessionId is always check_ins.id (source of truth).
 */

import type {DetectedPersonalRecord} from '@/types/personalRecord.types';
import type {WorkoutExercise} from '@/types/workoutLog.types';

export type ShareWorkoutTemplate = 'summary' | 'pr' | 'streak';

export type ShareWorkoutBackground = 'transparent' | 'white' | 'purple' | 'photo';

/** Export canvas sizes — Stories first; feed/square/reels reserved for later. */
export type ShareExportFormatId = 'stories' | 'feed' | 'square' | 'reels';

export type ShareExportFormat = {
  id: ShareExportFormatId;
  width: number;
  height: number;
  /** Display label for future format picker */
  label: string;
};

export const SHARE_EXPORT_FORMATS: Record<ShareExportFormatId, ShareExportFormat> = {
  stories: {id: 'stories', width: 1080, height: 1920, label: 'Stories 9:16'},
  feed: {id: 'feed', width: 1080, height: 1350, label: 'Feed 4:5'},
  square: {id: 'square', width: 1080, height: 1080, label: 'Square 1:1'},
  reels: {id: 'reels', width: 1080, height: 1920, label: 'Reels 9:16'},
};

export const DEFAULT_SHARE_EXPORT_FORMAT: ShareExportFormatId = 'stories';

export type ShareWorkoutPrItem = {
  exerciseName: string;
  weightKg: number;
  reps: number;
  recordType: DetectedPersonalRecord['recordType'];
  /** Approximate “strength” score for default PR pick: weight * reps */
  strengthScore: number;
};

export type ShareWorkoutPayload = {
  sessionId: string;
  gymName: string;
  /** ISO started_at */
  startedAt: string;
  durationMinutes: number | null;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
  /** Display string e.g. "Chest + Triceps" */
  muscleGroupsLabel: string;
  /** Current active streak days (0 = none) */
  streakDays: number;
  prs: ShareWorkoutPrItem[];
  /** Saved exercises for the expandable log. Not used by the story export card. */
  exercises: WorkoutExercise[];
};

export type ShareWorkoutEditorState = {
  template: ShareWorkoutTemplate;
  background: ShareWorkoutBackground;
  /** Index into payload.prs when template === 'pr' */
  selectedPrIndex: number;
  formatId: ShareExportFormatId;
};
