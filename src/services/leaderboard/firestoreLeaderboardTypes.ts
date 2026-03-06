/**
 * Firestore Leaderboard Types
 * Data model for Firestore collections
 * Matcher spec: /users/{uid}/leaderboardStats og /gyms/{gymId}/leaderboards
 */

import {LeaderboardCategory, LeaderboardPeriod} from '@/types/leaderboard.types';

/** Per-period stats (weekly, monthly, allTime) */
export interface PeriodStats {
  weekly: number;
  monthly: number;
  allTime: number;
}

/** Leaderboard stats document: /users/{uid}/leaderboardStats */
export interface FirestoreLeaderboardStats {
  userId: string;
  checkIns: PeriodStats;
  prs: PeriodStats;
  trainingMinutes: PeriodStats;
  socialWorkouts: PeriodStats;
  streak: number;
  muscleGroupsTrained: PeriodStats;
  strengthPRs: {
    bench: number;
    squat: number;
    deadlift: number;
  };
  activityScore: PeriodStats;
  updatedAt: Date | {seconds: number; nanoseconds: number};
}

/** Per-gym leaderboard entry: /gyms/{gymId}/leaderboards/{period}/entries */
export interface FirestoreGymLeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  photoURL?: string;
  score: number;
  checkIns: number;
  updatedAt: Date | {seconds: number; nanoseconds: number};
}

/** Weekly Champion document: /gyms/{gymId}/weeklyChampion */
export interface FirestoreWeeklyChampion {
  gymId: number;
  gymName: string;
  userId: string;
  displayName: string;
  photoURL?: string;
  activityScore: number;
  weekStart: string; // YYYY-MM-DD (mandag)
  updatedAt: Date | {seconds: number; nanoseconds: number};
}

/** Mapping: LeaderboardCategory -> Firestore field path */
export const CATEGORY_TO_FIRESTORE_FIELD: Record<
  Exclude<LeaderboardCategory, 'gym' | 'friendsActivity'>,
  keyof FirestoreLeaderboardStats | string
> = {
  checkIns: 'checkIns',
  prs: 'prs',
  trainingTime: 'trainingMinutes',
  socialTraining: 'socialWorkouts',
  streak: 'streak',
  discipline: 'muscleGroupsTrained',
  benchPress: 'strengthPRs.bench',
  squat: 'strengthPRs.squat',
  deadlift: 'strengthPRs.deadlift',
  globalActivity: 'activityScore',
};

/** Mapping: LeaderboardPeriod -> Firestore period key */
export const PERIOD_TO_FIRESTORE_KEY: Record<LeaderboardPeriod, keyof PeriodStats> = {
  week: 'weekly',
  month: 'monthly',
  all: 'allTime',
};
