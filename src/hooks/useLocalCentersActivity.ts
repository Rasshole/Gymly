import {useCallback, useEffect, useState} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {
  loadLocalCentersActivity,
  type LocalCenterActivity,
} from '@/services/supabase/localCentersActivityService';

export function useLocalCentersActivity(userId: string | undefined) {
  const favoriteGyms = useAppStore(s => s.user?.favoriteGyms ?? []);
  const [localCenters, setLocalCenters] = useState<LocalCenterActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const ids = [...new Set((favoriteGyms ?? []).filter(Boolean))].slice(0, 3);
    if (!userId || ids.length === 0) {
      setLocalCenters([]);
      setError(null);
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
  }, [refresh]);

  useEffect(() => {
    if (!userId) {
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
    hasLocalCenters: (favoriteGyms ?? []).filter(Boolean).length > 0,
    loading,
    error,
    refresh,
  };
}
