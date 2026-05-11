import {BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import type {
  BadgeDefinition,
  BadgeProgress,
  UserBadgeStats,
} from '@/types/badge.types';

export function getBadgeStatValue(
  def: BadgeDefinition,
  stats: UserBadgeStats,
): number {
  return statForRequirement(def, stats);
}

function statForRequirement(
  def: BadgeDefinition,
  stats: UserBadgeStats,
): number {
  switch (def.requirement_type) {
    case 'streak_days':
      return stats.current_streak_days;
    case 'longest_streak_days':
      return stats.longest_streak_days;
    case 'total_time_minutes':
      return stats.total_training_time_minutes;
    case 'total_sessions':
      return stats.total_sessions;
    case 'total_check_ins':
      return stats.total_check_ins;
    case 'longest_session_minutes':
      return stats.longest_session_minutes;
    case 'friends_count':
    case 'friends_trained_with_count':
      return stats.friends_trained_with_count;
    case 'gyms_count':
      return stats.unique_gyms_count;
    case 'total_messages_sent':
      return stats.total_messages_sent;
    case 'unique_dm_recipients':
      return stats.unique_dm_recipients;
    case 'planned_workouts_completed_valid':
      return stats.planned_workouts_completed_valid;
    case 'planned_workouts_created':
      return stats.planned_workouts_created;
    case 'early_check_ins':
      return stats.early_check_ins;
    case 'late_check_ins':
      return stats.late_check_ins;
    default:
      return 0;
  }
}

export function computeBadgeProgress(
  def: BadgeDefinition,
  stats: UserBadgeStats,
  isUnlocked: boolean,
): BadgeProgress {
  const target = Math.max(1, def.requirement_value);
  const statVal = statForRequirement(def, stats);
  const effectiveUnlocked = isUnlocked || statVal >= target;
  const percent = effectiveUnlocked
    ? 100
    : Math.min(100, Math.round((statVal / target) * 100));

  let status: BadgeProgress['status'] = 'locked';
  if (effectiveUnlocked) {
    status = 'unlocked';
  } else if (percent >= 70) {
    status = 'almost_unlocked';
  }

  return {
    badgeId: def.id,
    current: statVal,
    target: def.requirement_value,
    percent,
    status,
  };
}

export function isBadgeRequirementMet(
  def: BadgeDefinition,
  stats: UserBadgeStats,
): boolean {
  return statForRequirement(def, stats) >= def.requirement_value;
}

export function calculateBadgeProgress(
  stats: UserBadgeStats,
  badge: BadgeDefinition,
  isUnlocked: boolean,
): BadgeProgress {
  return computeBadgeProgress(badge, stats, isUnlocked);
}

export function evaluateNewUnlocks(
  stats: UserBadgeStats,
  alreadyUnlockedIds: Set<string>,
): BadgeDefinition[] {
  const newly: BadgeDefinition[] = [];
  for (const def of BADGE_DEFINITIONS) {
    if (alreadyUnlockedIds.has(def.id)) {
      continue;
    }
    if (isBadgeRequirementMet(def, stats)) {
      newly.push(def);
    }
  }
  return newly;
}

export function progressLabel(
  def: BadgeDefinition,
  progress: BadgeProgress,
): string {
  const {requirement_type} = def;
  if (requirement_type === 'streak_days') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} dage`;
  }
  if (requirement_type === 'total_time_minutes') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} min`;
  }
  if (requirement_type === 'total_sessions') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} sessioner`;
  }
  if (requirement_type === 'longest_session_minutes') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} min (længste)`;
  }
  if (requirement_type === 'friends_count') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} ven(ner)`;
  }
  if (requirement_type === 'gyms_count') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} centre`;
  }
  if (requirement_type === 'total_check_ins') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} tjek-ind`;
  }
  if (requirement_type === 'longest_streak_days') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} dage (rekord)`;
  }
  if (requirement_type === 'total_messages_sent') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} beskeder`;
  }
  if (requirement_type === 'unique_dm_recipients') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} personer`;
  }
  if (requirement_type === 'planned_workouts_completed_valid') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} planer`;
  }
  if (requirement_type === 'planned_workouts_created') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} oprettet`;
  }
  if (requirement_type === 'early_check_ins') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} tidlige`;
  }
  if (requirement_type === 'late_check_ins') {
    return `${Math.min(progress.current, progress.target)}/${progress.target} sene`;
  }
  return `${progress.percent}%`;
}
