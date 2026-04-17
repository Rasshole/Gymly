/**
 * useActivityData — aktivitetsfeed via Firestore onSnapshot når Firebase er tilgængelig;
 * ellers tom liste.
 */

import {useState, useEffect, useCallback} from 'react';
import {subscribeToActivityFeed, getTodayActivityCount} from '@/services/data/ActivityService';
import type {ActivityEvent} from '@/types/activity.types';

export function useActivityData(
  userId: string | undefined,
  scope?: 'friends' | 'groups' | 'local' | 'trending',
) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) {
      return;
    }
    setError(null);
    setRetryKey(k => k + 1);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const unsubscribe = subscribeToActivityFeed(
      userId,
      data => {
        setEvents(data);
        setLoading(false);
      },
      err => {
        setError(err);
        setEvents([]);
        setLoading(false);
      },
      {scope, limit: 50},
    );

    return () => unsubscribe?.();
  }, [userId, scope, retryKey]);

  const todayCount = getTodayActivityCount(events);
  return {events, loading, error, refresh, todayCount};
}
