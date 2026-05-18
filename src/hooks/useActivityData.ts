/**
 * useActivityData — aktivitetsfeed via Firestore onSnapshot når Firebase er tilgængelig;
 * ellers tom liste.
 */

import {useState, useEffect, useCallback} from 'react';
import {subscribeToActivityFeed, getTodayActivityCount} from '@/services/data/ActivityService';
import type {ActivityEvent} from '@/types/activity.types';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {useDemoModeStore} from '@/demo/demoModeStore';

export function useActivityData(
  userId: string | undefined,
  scope?: 'friends' | 'groups' | 'local' | 'trending',
) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const demoEnabled = useDemoModeStore(s => s.enabled);

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

    if (isDemoContentMode()) {
      const demo = buildDemoPayload(userId);
      let list = demo.activityEvents;
      if (scope) {
        list = list.filter(e => e.scope === scope);
      }
      setEvents(list.slice(0, 50));
      setLoading(false);
      setError(null);
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
  }, [userId, scope, retryKey, demoEnabled]);

  const todayCount = getTodayActivityCount(events);
  return {events, loading, error, refresh, todayCount};
}
