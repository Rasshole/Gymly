import {useState, useEffect, useCallback, useRef} from 'react';
import {AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {
  loadGymlyActiveNowData,
  type ActiveNowFriendRow,
} from '@/services/supabase/gymlyActiveNowService';

const DURATION_TICK_MS = 60_000;

/**
 * Home "Aktive nu": global tælling (rollup) + venneliste (aktive check_ins), realtime.
 */
export function useGymlyActiveNow(userId: string | undefined) {
  const isFocused = useIsFocused();
  const [totalActiveUsers, setTotalActiveUsers] = useState(0);
  const [activeFriends, setActiveFriends] = useState<ActiveNowFriendRow[]>([]);
  const [currentUserActive, setCurrentUserActive] = useState<ActiveNowFriendRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [durationNow, setDurationNow] = useState(() => Date.now());
  const appStateRef = useRef<string>(AppState.currentState);

  const refresh = useCallback(async () => {
    if (!userId) {
      setTotalActiveUsers(0);
      setActiveFriends([]);
      setCurrentUserActive(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const {totalActive, friends, currentUserActive: selfActive} =
        await loadGymlyActiveNowData(userId);
      setTotalActiveUsers(totalActive);
      setActiveFriends(friends);
      setCurrentUserActive(selfActive);
      setDurationNow(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      void refresh();
      return;
    }
    if (!isFocused) {
      return;
    }
    void refresh();
  }, [userId, isFocused, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      if (__DEV__) {
        console.log('[ActiveSessions] realtime event received → refresh');
      }
      void refresh();
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        void refresh();
        setDurationNow(Date.now());
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const id = setInterval(() => setDurationNow(Date.now()), DURATION_TICK_MS);
    return () => clearInterval(id);
  }, [userId]);

  return {
    totalActiveUsers,
    activeFriends,
    currentUserActive,
    loading,
    error,
    refresh,
    /** Opdateres hvert 60. sekund så "min i gang" følger med */
    durationNow,
  };
}
