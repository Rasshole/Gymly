import {useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {
  runAutoCheckoutEvaluation,
  AUTO_CHECKOUT_INTERVAL_MS,
} from '@/services/autoCheckout/runAutoCheckoutEvaluation';
import {useOptionalUserCoords} from '@/hooks/useOptionalUserCoords';
import {useSessionStore} from '@/store/sessionStore';
import {updateCheckInLastSeenAt} from '@/services/supabase/checkInService';

/**
 * Global auto-checkout: kun afstand når app er i forgrunden + GPS bekræftet.
 * Afslutter aldrig session ved app-genstart eller manglende GPS.
 */
export function useAutoCheckoutController(): void {
  const userId = useAppStore(s => s.user?.id);
  const activeCheckInId = useSessionStore(s => s.activeSession?.checkInId);
  const coords = useOptionalUserCoords();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (
        (next === 'background' || next === 'inactive') &&
        prev === 'active'
      ) {
        const session = useSessionStore.getState().activeSession;
        if (session?.checkInId) {
          void updateCheckInLastSeenAt(session.checkInId, userId).catch(() => {});
        }
      }
      if (next === 'active') {
        runAutoCheckoutEvaluation({
          userId,
          appState: 'active',
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeCheckInId || appStateRef.current !== 'active') {
      return;
    }
    runAutoCheckoutEvaluation({
      userId,
      appState: 'active',
    }).catch(() => {});
  }, [userId, activeCheckInId]);

  useEffect(() => {
    if (!userId || !coords || !activeCheckInId || appStateRef.current !== 'active') {
      return;
    }
    runAutoCheckoutEvaluation({
      userId,
      appState: 'active',
    }).catch(() => {});
  }, [userId, coords, activeCheckInId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const session = useSessionStore.getState().activeSession;
    if (!session?.checkInId) {
      return;
    }
    const id = setInterval(() => {
      if (appStateRef.current !== 'active') {
        return;
      }
      if (!useSessionStore.getState().activeSession?.checkInId) {
        return;
      }
      runAutoCheckoutEvaluation({
        userId,
        appState: appStateRef.current,
      }).catch(() => {});
    }, AUTO_CHECKOUT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, activeCheckInId]);
}
