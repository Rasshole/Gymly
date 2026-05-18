/**
 * Showcase badge-stats + unlocks (kun når demo-indhold er aktivt).
 */

import type {UserBadgeStats} from '@/types/badge.types';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export function getDemoBadgeSnapshot(): {
  stats: UserBadgeStats;
  unlocked: Record<string, string>;
} {
  const stats: UserBadgeStats = {
    total_training_time_minutes: 1080,
    total_sessions: 26,
    current_streak_days: 7,
    longest_streak_days: 14,
    longest_session_minutes: 94,
    total_check_ins: 26,
    friends_trained_with_count: 18,
    unique_gyms_count: 5,
    total_messages_sent: 142,
    unique_dm_recipients: 16,
    planned_workouts_created: 11,
    planned_workouts_completed_valid: 6,
    early_check_ins: 9,
    late_check_ins: 5,
  };
  const unlocked: Record<string, string> = {
    checkin_first_1: isoDaysAgo(200),
    checkin_showing_5: isoDaysAgo(120),
    checkin_consistent_25: isoDaysAgo(14),
    social_partner_1: isoDaysAgo(180),
    social_squad_5: isoDaysAgo(90),
    time_warmup_300: isoDaysAgo(60),
    streak_starter_3: isoDaysAgo(7),
    sessions_first_1: isoDaysAgo(200),
    sessions_routine_10: isoDaysAgo(40),
    msg_first_1: isoDaysAgo(170),
    habit_night_grinder_5: isoDaysAgo(25),
    planned_planner_5: isoDaysAgo(30),
  };
  return {stats, unlocked};
}
