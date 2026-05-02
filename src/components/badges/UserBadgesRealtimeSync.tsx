/**
 * Periodisk badge-sync + ved app resume (Realtime til user_badges/check_ins
 * håndteres i GymlyRealtimeHub for at undgå duplikerede kanaler).
 */
import {useEffect, useRef, useCallback} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useBadgeStore} from '@/store/badgeStore';
import {useSessionStore} from '@/store/sessionStore';

export function UserBadgesRealtimeSync() {
  const userId = useAppStore(s => s.user?.id);
  const displayName = useAppStore(s => s.user?.displayName ?? 'Bruger');
  const activeSessionStart = useSessionStore(
    s => s.activeSession?.startTime?.getTime() ?? 0,
  );
  const syncBadges = useBadgeStore(s => s.syncBadgesForUser);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);

  const runSync = useCallback(() => {
    if (!userId) {
      return;
    }
    if (syncInFlightRef.current) {
      syncPendingRef.current = true;
      return;
    }
    syncInFlightRef.current = true;
    syncBadges(userId, (displayName || '').trim() || 'Bruger');
    setTimeout(() => {
      syncInFlightRef.current = false;
      if (syncPendingRef.current) {
        syncPendingRef.current = false;
        runSync();
      }
    }, 1200);
  }, [userId, displayName, syncBadges]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    runSync();
    const appSub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        runSync();
      }
    });
    const minuteTimer = setInterval(() => {
      runSync();
    }, 60_000);
    return () => {
      appSub.remove();
      clearInterval(minuteTimer);
    };
  }, [userId, runSync, activeSessionStart]);

  return null;
}
