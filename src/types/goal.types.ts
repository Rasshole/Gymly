/**
 * Goal Types
 * Types for workout goals and targets
 */

export type GoalType =
  | 'set_pr' // Set a personal record for a specific exercise
  | 'workouts'; // Complete a certain number of workouts in a period

export type GoalPeriod = 'week' | 'month' | 'year';

export interface Goal {
  id: string;
  userId: string;
  type: GoalType;
  title: string;
  description: string;
  target?: number; // Target value (e.g., weight for PR, number of workouts)
  period?: GoalPeriod; // Period for the goal (week, month, year)
  exercise?: string; // Exercise name for PR goals
  workoutDuration?: number; // Duration in minutes for workout goals
  createdAt: Date;
  completedAt?: Date;
  isCompleted: boolean;
  progress: number; // Current progress (0-100)
}

