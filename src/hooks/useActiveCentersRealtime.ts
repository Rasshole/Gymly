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

const TOP_N = 5;

export function useActiveCentersRealtime() {
  const userId = useAppStore(s => s.user?.id);
  const coords = useOptionalUserCoords();
  const [activeCenters, setActiveCenters] = useState<ActiveCenter[]>([]);
  const [loading, setLoading] = useState(false);
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
    try {
      const list = await loadActiveCentersData(userId, {
        userLatitude: coords?.latitude,
        userLongitude: coords?.longitude,
      });
      setActiveCenters(list);
      setError(null);
    } catch (e) {
      setActiveCenters([]);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refresh();
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [userId, refresh]);

  const topActiveCenters = useMemo(
    () => activeCenters.slice(0, TOP_N),
    [activeCenters],
  );

  return {
    activeCenters,
    topActiveCenters,
    loading,
    error,
    refresh,
  };
}
