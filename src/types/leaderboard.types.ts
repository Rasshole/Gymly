/**
 * Leaderboard Types
 * Skalerbar struktur – nem at tilføje nye kategorier
 * Data struktur kompatibel med Firestore
 */

export type LeaderboardPeriod = 'week' | 'month' | 'all';

export type LeaderboardTab = 'global' | 'friends' | 'gyms';

/** Alle 10 leaderboard-kategorier */
export type LeaderboardCategory =
  | 'checkIns'
  | 'prs'
  | 'trainingTime'
  | 'socialTraining'
  | 'gym'
  | 'streak'
  | 'discipline'
  | 'benchPress'
  | 'squat'
  | 'deadlift'
  | 'globalActivity'
  | 'friendsActivity';

/** Styrke-øvelser til separate ranglister */
export type StrengthExercise = 'benchPress' | 'squat' | 'deadlift';

/** Leaderboard-statistik per bruger (Firestore-kompatibel) */
export interface LeaderboardStats {
  userId: string;
  checkInsWeekly: number;
  checkInsMonthly: number;
  checkInsAllTime: number;
  prsWeekly: number;
  prsMonthly: number;
  prsAllTime: number;
  trainingMinutesWeekly: number;
  trainingMinutesMonthly: number;
  trainingMinutesAllTime: number;
  socialWorkoutsWeekly: number;
  socialWorkoutsMonthly: number;
  socialWorkoutsAllTime: number;
  currentStreak: number;
  muscleGroupsTrained: number;
  benchPR: number; // kg
  squatPR: number; // kg
  deadliftPR: number; // kg
  activityScore: number;
}

/** Enkel leaderboard-entry */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  value: number;
  valueLabel: string;
  gymName?: string;
  gymId?: number;
  isCurrentUser?: boolean;
  isFriend?: boolean;
  isWeeklyChampion?: boolean;
}

/** Konfiguration for en leaderboard-kategori – nem at tilføje nye */
export interface LeaderboardCategoryConfig {
  key: LeaderboardCategory;
  label: string;
  icon: string;
  /** Kun for gym-specifikke ranglister */
  isGymSpecific?: boolean;
  /** Kun for styrke-ranglister */
  strengthExercise?: StrengthExercise;
}

/** Weekly Champion – kronet per center */
export interface WeeklyChampion {
  gymId: number;
  gymName: string;
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  activityScore: number;
}
