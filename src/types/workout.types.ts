/**
 * Workout Types
 * Types for workout tracking and history
 */

export interface Workout {
  id: string;
  userId: string;
  gymId?: number;
  gymName?: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // Duration in minutes
  workoutType?: string; // e.g., "cardio", "strength", "mixed"
  notes?: string;
}

export interface WeeklyStats {
  workouts: number; // Number of workouts this week
  totalDuration: number; // Total duration in minutes
  totalHours: number; // Total duration in hours (rounded)
  averageDuration: number; // Average duration per workout in minutes
}

export interface DailyWorkoutData {
  date: Date;
  duration: number; // Duration in minutes
  workouts: number; // Number of workouts that day
}

export type MuscleGroup = 
  | 'bryst'
  | 'triceps'
  | 'skulder'
  | 'ben'
  | 'biceps'
  | 'mave'
  | 'ryg'
  | 'hele_kroppen';

export interface WorkoutInvitation {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  scheduledTime: Date;
  muscleGroups: MuscleGroup[];
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: Date;
  groupWorkoutId?: string; // ID of the group workout if accepted
}

export interface GroupWorkout {
  id: string;
  participants: string[]; // User IDs
  scheduledTime: Date;
  muscleGroups: MuscleGroup[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
}
