import {useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {
  runAutoCheckoutEvaluation,
  AUTO_CHECKOUT_INTERVAL_MS,
} from '@/services/autoCheckout/runAutoCheckoutEvaluation';
import {runStaleActiveSessionCleanup} from '@/services/supabase/activeSessionsSync';
import {useOptionalUserCoords} from '@/hooks/useOptionalUserCoords';

/**
 * Global auto-checkout: app start, resume, interval (foreground), aktiv session.
 */
export function useAutoCheckoutController(): void {
  const userId = useAppStore(s => s.user?.id);
  const coords = useOptionalUserCoords();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      appStateRef.current = next;
      if (next === 'active') {
        void runStaleActiveSessionCleanup()
          .catch(() => {})
          .finally(() => {
            runAutoCheckoutEvaluation({
              userId,
              appState: 'active',
            }).catch(() => {});
          });
      }
    });
    return () => sub.remove();
  }, [userId]);

  useEffect(() => {
    if (!userId || !coords || appStateRef.current !== 'active') {
      return;
    }
    runAutoCheckoutEvaluation({
      userId,
      appState: 'active',
    }).catch(() => {});
  }, [userId, coords]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void runStaleActiveSessionCleanup()
      .catch(() => {})
      .finally(() => {
        runAutoCheckoutEvaluation({
          userId,
          appState: appStateRef.current,
        }).catch(() => {});
      });
    const id = setInterval(() => {
      runAutoCheckoutEvaluation({
        userId,
        appState: appStateRef.current,
      }).catch(() => {});
    }, AUTO_CHECKOUT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId]);
}
