import {BADGE_DEFINITIONS} from '@/config/badgeDefinitions';
import type {
  BadgeDefinition,
  BadgeProgress,
  UserBadgeStats,
} from '@/types/badge.types';

function statForRequirement(
  def: BadgeDefinition,
  stats: UserBadgeStats,
): number {
  switch (def.requirement_type) {
    case 'streak_days':
      return stats.current_streak_days;
    case 'total_time_minutes':
      return stats.total_training_time_minutes;
    case 'total_sessions':
      return stats.total_sessions;
    case 'longest_session_minutes':
      return stats.longest_session_minutes;
    case 'friends_count':
      return stats.friends_trained_with_count;
    case 'gyms_count':
      return stats.unique_gyms_count;
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
  const percent = isUnlocked
    ? 100
    : Math.min(100, Math.round((statVal / target) * 100));

  let status: BadgeProgress['status'] = 'locked';
  if (isUnlocked) {
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
  return `${progress.percent}%`;
}
