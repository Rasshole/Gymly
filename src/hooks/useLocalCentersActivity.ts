import {useCallback, useEffect, useState} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {subscribeProfileCenters} from '@/realtime/profileCentersBridge';
import {
  loadLocalCentersActivity,
  type LocalCenterActivity,
} from '@/services/supabase/localCentersActivityService';
import {fetchUserHomeGymIds} from '@/services/supabase/homeGymsService';
import {subscribeUserCenters} from '@/services/supabase/userCentersService';
import {canUseDemoContentControls, isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {useDemoModeStore} from '@/demo/demoModeStore';

function sameCenterIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((id, i) => id === b[i]);
}

export function useLocalCentersActivity(userId: string | undefined) {
  const favoriteGyms = useAppStore(s => s.user?.favoriteGyms);
  const [resolvedCenterIds, setResolvedCenterIds] = useState<string[]>([]);
  const [localCenters, setLocalCenters] = useState<LocalCenterActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const demoEnabled = useDemoModeStore(s => s.enabled);
  const demoHydrated = useDemoModeStore(s => s.hydrated);

  const refresh = useCallback(async () => {
    if (canUseDemoContentControls() && !useDemoModeStore.getState().hydrated) {
      return;
    }
    if (!userId) {
      setResolvedCenterIds([]);
      setLocalCenters([]);
      setError(null);
      setLoading(false);
      return;
    }

    let ids = [...new Set((favoriteGyms ?? []).filter(Boolean))].slice(0, 3);

    if (isDemoContentMode()) {
      setLoading(true);
      try {
        const d = buildDemoPayload(userId);
        const n = Math.max(1, ids.length || 3);
        const demoIds = ids.length > 0 ? ids : d.localCenters.slice(0, n).map(c => c.centerId);
        setResolvedCenterIds(demoIds.slice(0, 3));
        setLocalCenters(d.localCenters.slice(0, n));
        setError(null);
      } catch (e) {
        setResolvedCenterIds([]);
        setLocalCenters([]);
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const fromDb = await fetchUserHomeGymIds(userId, favoriteGyms ?? []);
      if (fromDb.length > 0) {
        ids = fromDb;
        const storeIds = (favoriteGyms ?? []).filter(Boolean).slice(0, 3);
        if (!sameCenterIds(storeIds, ids)) {
          const cur = useAppStore.getState().user;
          if (cur?.id === userId) {
            useAppStore.getState().setUser(
              {...cur, favoriteGyms: ids, updatedAt: new Date()},
              {skipProfileSync: true},
            );
          }
        }
      }
      if (__DEV__) {
        console.log('[homeGyms] Home.load', {userId, ids});
      }
    } catch (e) {
      if (__DEV__) {
        console.warn('[homeGyms] Home.load_error', userId, e);
      }
    }

    setResolvedCenterIds(ids);

    if (ids.length === 0) {
      setLocalCenters([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await loadLocalCentersActivity(userId, ids);
      setLocalCenters(data);
      setError(null);
    } catch (e) {
      setLocalCenters([]);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId, favoriteGyms]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh, demoEnabled, userId, demoHydrated]);

  useEffect(() => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    return subscribeProfileCenters(userId, () => {
      refresh().catch(() => {});
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    return subscribeUserCenters(userId, () => {
      refresh().catch(() => {});
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      refresh().catch(() => {});
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        refresh().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [userId, refresh]);

  return {
    localCenters,
    hasLocalCenters: resolvedCenterIds.length > 0,
    loading,
    error,
    refresh,
  };
}
