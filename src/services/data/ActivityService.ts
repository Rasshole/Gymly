/**
 * Activity Service — aktivitetsfeed fra Firestore
 */

import {subscribeToActivities} from '@/services/firestore/ActivityFirestoreService';
import {useActivityStore} from '@/store/activityStore';
import type {ActivityEvent} from '@/types/activity.types';

export interface GetActivityOptions {
  scope?: 'friends' | 'groups' | 'local' | 'trending';
  limit?: number;
  groupId?: string;
}

/** Lokale bruger-aktiviteter (fx efter check-in) — merges ikke med fiktive poster */
export async function getActivityEvents(
  _userId: string,
  options: GetActivityOptions = {},
): Promise<ActivityEvent[]> {
  const userActivities = useActivityStore.getState().userActivities;
  let list = [...userActivities] as ActivityEvent[];
  list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  if (options.scope) {
    list = list.filter(e => e.scope === options.scope);
  }
  if (options.groupId) {
    list = list.filter(e => (e as {groupId?: string}).groupId === options.groupId);
  }
  const limit = options.limit ?? 50;
  return list.slice(0, limit);
}

export function subscribeToActivityFeed(
  userId: string,
  onUpdate: (events: ActivityEvent[]) => void,
  onError?: (err: Error) => void,
  options: GetActivityOptions = {},
): (() => void) | null {
  return subscribeToActivities(userId, onUpdate, onError, {
    limit: options.limit ?? 50,
  });
}

export function getTodayActivityCount(events: ActivityEvent[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return events.filter(e => new Date(e.timestamp) >= today).length;
}
