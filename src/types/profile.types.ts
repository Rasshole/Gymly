/**
 * Profile types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export interface ProfileStats {
  totalCheckIns: number;
  currentStreak: number;
  longestStreak: number;
  totalTrainingMinutes: number;
  badgesCount: number;
  /** Gensidige følger (I følger hinanden) */
  friendsCount: number;
  followersCount: number;
  followingCount: number;
}

export interface ProfileBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Optional category for styling (badgeCategoryStyles); unknown keys fall back safely. */
  category?: string;
  unlockedAt?: Date;
  progress?: number; // 0-100 for locked badges
}

export interface ProfileDisplay {
  bio?: string;
  primaryGym?: string;
  city?: string;
  groupsCount?: number;
}

export interface WeeklyStats {
  checkInsThisWeek: number;
  trainingMinutesThisWeek: number;
  rankThisWeek: number;
  rankAboveUser: number;
  checkInsToTop10: number;
  checkInsToOvertake: number;
}

export interface Milestone {
  id: string;
  type: 'streak' | 'leaderboard' | 'overtake' | 'top10' | 'badge';
  message: string;
  icon: string;
  cta?: string;
}
