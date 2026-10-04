import {useState, useEffect, useCallback, useMemo} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {
  loadActiveCentersData,
} from '@/services/supabase/activeCentersService';
import type {ActiveCenter} from '@/types/activeCenter.types';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {useOptionalUserCoords} from '@/hooks/useOptionalUserCoords';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {buildDemoActiveCentersFromLocal} from '@/demo/buildDemoActiveCenters';
import {perfPhase} from '@/utils/perfMark';

const TOP_N = 5;

let pendingActiveCenters: {
  userId: string;
  promise: Promise<ActiveCenter[]>;
} | null = null;

/** Start the Centre live query on tab press, before the screen finishes rendering. */
export function prefetchActiveCenters(userId: string): Promise<ActiveCenter[]> {
  if (pendingActiveCenters?.userId === userId) {
    return pendingActiveCenters.promise;
  }
  const promise = loadActiveCentersData(userId);
  pendingActiveCenters = {userId, promise};
  return promise;
}

function takePrefetchedActiveCenters(userId: string): Promise<ActiveCenter[]> | null {
  if (pendingActiveCenters?.userId !== userId) {
    return null;
  }
  const promise = pendingActiveCenters.promise;
  pendingActiveCenters = null;
  return promise;
}

export function useActiveCentersRealtime(options?: {enabled?: boolean}) {
  const enabled = options?.enabled ?? true;
  const userId = useAppStore(s => s.user?.id);
  const coords = useOptionalUserCoords();
  const [activeCenters, setActiveCenters] = useState<ActiveCenter[]>([]);
  const [loading, setLoading] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setActiveCenters([]);
      setError(null);
      return;
    }
    if (isDemoContentMode()) {
      setLoading(true);
      try {
        const d = buildDemoPayload(userId);
        setActiveCenters(buildDemoActiveCentersFromLocal(d.localCenters));
        setError(null);
      } catch (e) {
        setActiveCenters([]);
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    let ok = false;
    try {
      const fetchStarted = Date.now();
      const prefetched = takePrefetchedActiveCenters(userId);
      const list = prefetched
        ? await prefetched
        : await loadActiveCentersData(userId, {
            userLatitude: coords?.latitude,
            userLongitude: coords?.longitude,
          });
      setActiveCenters(list);
      perfPhase(
        'centres',
        'live',
        `count=${list.length} fetchMs=${Date.now() - fetchStarted}`,
      );
      setError(null);
      ok = true;
    } catch (e) {
      setActiveCenters([]);
      setError(e instanceof Error ? e : new Error(String(e)));
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'message' in e
            ? String((e as {message: unknown}).message)
            : String(e);
      perfPhase('centres', 'live_error', message.slice(0, 160));
    } finally {
      setLoading(false);
      if (ok) {
        setSettled(true);
      }
    }
  }, [userId, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
  }, [refresh, enabled]);

  useEffect(() => {
    if (!enabled || !userId || isDemoContentMode()) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refresh();
    });
  }, [userId, refresh, enabled]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [userId, refresh, enabled]);

  const topActiveCenters = useMemo(
    () => activeCenters.slice(0, TOP_N),
    [activeCenters],
  );

  return {
    activeCenters,
    topActiveCenters,
    loading,
    settled,
    error,
    refresh,
  };
}
