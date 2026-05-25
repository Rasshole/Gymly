import type {BadgeDefinition, BadgeProgress} from '@/types/badge.types';

type Translate = (path: string, params?: Record<string, string | number>) => string;

export function progressLabelT(
  t: Translate,
  def: BadgeDefinition,
  progress: BadgeProgress,
): string {
  const cur = String(Math.min(progress.current, progress.target));
  const target = String(progress.target);
  const {requirement_type} = def;

  switch (requirement_type) {
    case 'streak_days':
    case 'longest_streak_days':
      return requirement_type === 'longest_streak_days'
        ? t('badges.progress.daysRecord', {cur, target})
        : t('badges.progress.days', {cur, target});
    case 'total_time_minutes':
      return t('badges.progress.minutes', {cur, target});
    case 'longest_session_minutes':
      return t('badges.progress.minutesLongest', {cur, target});
    case 'total_sessions':
      return t('badges.progress.sessions', {cur, target});
    case 'friends_count':
      return t('badges.progress.friends', {cur, target});
    case 'gyms_count':
      return t('badges.progress.gyms', {cur, target});
    case 'total_check_ins':
      return t('badges.progress.checkIns', {cur, target});
    case 'total_messages_sent':
      return t('badges.progress.messages', {cur, target});
    case 'unique_dm_recipients':
      return t('badges.progress.people', {cur, target});
    case 'planned_workouts_completed_valid':
      return t('badges.progress.plans', {cur, target});
    case 'planned_workouts_created':
      return t('badges.progress.created', {cur, target});
    case 'early_check_ins':
      return t('badges.progress.early', {cur, target});
    case 'late_check_ins':
      return t('badges.progress.late', {cur, target});
    default:
      return `${progress.percent}%`;
  }
}

export function upcomingBadgeHintT(
  t: Translate,
  def: BadgeDefinition,
  progress: BadgeProgress,
): string {
  const left = Math.max(0, progress.target - progress.current);
  const emoji = def.emoji;
  if (left <= 0) {
    return emoji;
  }

  switch (def.requirement_type) {
    case 'streak_days':
      return left === 1
        ? t('format.daysUntilOne', {emoji})
        : t('format.daysUntilMany', {count: String(left), emoji});
    case 'total_check_ins':
      return left === 1
        ? t('badges.hint.checkInOne', {emoji})
        : t('badges.hint.checkInsMany', {count: String(left), emoji});
    case 'total_time_minutes':
      return left === 1
        ? t('badges.hint.minuteOne', {emoji})
        : t('badges.hint.minutesMany', {count: String(left), emoji});
    case 'total_sessions':
      return left === 1
        ? t('badges.hint.sessionOne', {emoji})
        : t('badges.hint.sessionsMany', {count: String(left), emoji});
    default:
      return left === 1
        ? t('badges.hint.genericOne', {emoji})
        : t('badges.hint.genericMany', {count: String(left), emoji});
  }
}
