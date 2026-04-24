/**
 * Aktive gyms "lige nu" — Supabase check_ins + gym_active_user_totals.
 */

import {useState, useEffect, useCallback} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import type {GymPresence} from '@/types/gymPresence.types';
import {loadGymPresenceForUser} from '@/services/supabase/presenceService';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';

export function useGymPresence() {
  const userId = useAppStore(s => s.user?.id);
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
      const list = await loadGymPresenceForUser(userId);
      setGyms(list);
      setError(null);
    } catch (e) {
      setGyms([]);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
    if (!userId) {
      return;
    }
    const id = setInterval(() => {
      void refresh();
    }, 60000);
    return () => clearInterval(id);
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
