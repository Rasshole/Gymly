/**
 * Activity utils – shared helpers for Activity feed
 * Used by HomeScreen, ActivityFeedScreen, ActivityCard
 */

import type {ActivityEvent, ActivityEventType} from '@/types/activity.types';

export type ActivityCardType =
  | 'check_in'
  | 'streak'
  | 'badge'
  | 'leaderboard'
  | 'workout'
  | 'group';

export function mapEventTypeToActivityCard(
  type: ActivityEventType | string
): ActivityCardType {
  const map: Record<string, ActivityCardType> = {
    check_in: 'check_in',
    streak_milestone: 'streak',
    workout_completed: 'workout',
    joined_group: 'group',
    leaderboard_movement: 'leaderboard',
    badge_unlocked: 'badge',
    online_now: 'check_in',
  };
  return map[type] ?? 'check_in';
}

export function buildSecondaryInfo(item: ActivityEvent): string | undefined {
  const parts: string[] = [];
  if (item.secondaryInfo) parts.push(item.secondaryInfo);
  if (item.gymName && item.type === 'check_in') parts.push(item.gymName);
  if (item.groupName && item.type === 'joined_group') parts.push(item.groupName);
  if (item.minutes && item.type === 'workout_completed') parts.push(`${item.minutes} min`);
  if (item.rank && item.type === 'leaderboard_movement') parts.push(`#${item.rank}`);
  if ((item.gym || item.city) && item.type !== 'check_in' && item.type !== 'online_now') {
    parts.push([item.gym || item.gymName, item.city].filter(Boolean).join(' • '));
  }
  return parts.length > 0 ? parts.join(' • ') : undefined;
}
