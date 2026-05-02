/**
 * Aktive gyms "lige nu" — check_ins (aktiv) + gym_active_checkin_rollup.
 */

import {useState, useEffect, useCallback} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import type {GymPresence} from '@/types/gymPresence.types';
import {
  loadActiveCentersData,
  mapActiveCenterToGymPresence,
} from '@/services/supabase/activeCentersService';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {useOptionalUserCoords} from '@/hooks/useOptionalUserCoords';

export function useGymPresence() {
  const userId = useAppStore(s => s.user?.id);
  const coords = useOptionalUserCoords();
  const [gyms, setGyms] = useState<GymPresence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setGyms([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const centers = await loadActiveCentersData(userId, {
        userLatitude: coords?.latitude,
        userLongitude: coords?.longitude,
      });
      setGyms(centers.map(mapActiveCenterToGymPresence));
      setError(null);
    } catch (e) {
      setGyms([]);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refresh();
    });
  }, [userId, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && userId) {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [userId, refresh]);

  return {gyms, loading, error, refresh};
}
