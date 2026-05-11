/**
 * Emoji-baseret badge-system — udvidbart til nye kategorier og krav.
 */

export type BadgeCategory =
  | 'streak'
  | 'checkin'
  | 'time'
  | 'sessions'
  | 'messaging'
  | 'social'
  | 'planned'
  | 'habits'
  | 'records'
  | 'exploration'
  | 'elite';

export type BadgeRequirementType =
  | 'streak_days'
  | 'longest_streak_days'
  | 'total_time_minutes'
  | 'total_sessions'
  | 'total_check_ins'
  | 'longest_session_minutes'
  | 'friends_count'
  | 'friends_trained_with_count'
  | 'gyms_count'
  | 'total_messages_sent'
  | 'unique_dm_recipients'
  | 'planned_workouts_completed_valid'
  | 'planned_workouts_created'
  | 'early_check_ins'
  | 'late_check_ins';

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

/**
 * Afledt brugerstatistik — bygges fra Supabase (kilde til sandhed) med anti-cheat filtre.
 */
export type UserBadgeStats = {
  total_training_time_minutes: number;
  /** Kun sessioner med varighed ≥ 5 min */
  total_sessions: number;
  current_streak_days: number;
  /** Længste sammenhængende kalenderdage med træning (historik) */
  longest_streak_days: number;
  longest_session_minutes: number;
  /** Tjek-ind credits: samme bruger < 30 min mellem start tæller ikke som ekstra */
  total_check_ins: number;
  /** Accepterede venskaber (friendships-rækker) — bruges til social-badges */
  friends_trained_with_count: number;
  unique_gyms_count: number;
  total_messages_sent: number;
  unique_dm_recipients: number;
  planned_workouts_created: number;
  planned_workouts_completed_valid: number;
  early_check_ins: number;
  late_check_ins: number;
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
