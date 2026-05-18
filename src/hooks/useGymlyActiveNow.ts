import {useState, useEffect, useCallback, useRef} from 'react';
import {AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {
  loadGymlyActiveNowData,
  type ActiveNowFriendRow,
} from '@/services/supabase/gymlyActiveNowService';
import {canUseDemoContentControls, isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {useDemoModeStore} from '@/demo/demoModeStore';

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
  const demoEnabled = useDemoModeStore(s => s.enabled);
  const demoHydrated = useDemoModeStore(s => s.hydrated);

  const refresh = useCallback(async () => {
    if (!userId) {
      setTotalActiveUsers(0);
      setActiveFriends([]);
      setCurrentUserActive(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (canUseDemoContentControls() && !useDemoModeStore.getState().hydrated) {
      return;
    }
    if (isDemoContentMode()) {
      setLoading(true);
      try {
        const d = buildDemoPayload(userId);
        setTotalActiveUsers(d.totalActiveUsers);
        setActiveFriends(d.activeFriends);
        setCurrentUserActive(d.currentUserActive);
        setDurationNow(Date.now());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
      }
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
      refresh().catch(() => {});
      return;
    }
    if (!isFocused) {
      return;
    }
    refresh().catch(() => {});
  }, [userId, isFocused, refresh, demoEnabled, demoHydrated]);

  useEffect(() => {
    if (!userId || isDemoContentMode()) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      if (__DEV__) {
        console.log('[ActiveSessions] realtime event received → refresh');
      }
      refresh().catch(() => {});
    });
  }, [userId, refresh, demoEnabled]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        refresh().catch(() => {});
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
