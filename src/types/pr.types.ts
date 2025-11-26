/**
 * PR & Reps Types
 * Types for personal records and rep tracking
 */

export type ExerciseType =
  | 'Bænkpres'
  | 'Dødløft'
  | 'Benpres'
  | 'Squads'
  | 'Incline Dumbell'
  | 'Pull-Down'
  | 'Shoulder Pres Dumbell';

export interface PersonalRecord {
  id: string;
  userId: string;
  exercise: ExerciseType;
  weight: number; // Weight in kg
  videoUrl?: string; // Video URL (max 30 seconds)
  date: Date;
  notes?: string;
}

export interface RepRecord {
  id: string;
  userId: string;
  exercise: ExerciseType;
  weight: number; // Weight in kg for 10 reps
  date: Date;
  notes?: string;
}



