/**
 * Emoji-baseret badge-system — udvidbart til nye kategorier og krav.
 */

export type BadgeCategory =
  | 'streak'
  | 'time'
  | 'sessions'
  | 'social'
  | 'records'
  | 'exploration'
  | 'elite';

export type BadgeRequirementType =
  | 'streak_days'
  | 'total_time_minutes'
  | 'total_sessions'
  | 'longest_session_minutes'
  | 'friends_count'
  | 'gyms_count';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type BadgeDefinition = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: BadgeCategory;
  requirement_type: BadgeRequirementType;
  requirement_value: number;
  rarity: BadgeRarity;
  is_hidden: boolean;
};

/** Afledt brugerstatistik brugt til evaluering */
export type UserBadgeStats = {
  total_training_time_minutes: number;
  total_sessions: number;
  current_streak_days: number;
  longest_session_minutes: number;
  friends_trained_with_count: number;
  unique_gyms_count: number;
};

export type BadgeProgressStatus = 'unlocked' | 'almost_unlocked' | 'locked';

export type BadgeProgress = {
  badgeId: string;
  current: number;
  target: number;
  percent: number;
  status: BadgeProgressStatus;
};

export type UnlockedBadgeRecord = {
  badgeId: string;
  unlockedAt: string; // ISO
};
