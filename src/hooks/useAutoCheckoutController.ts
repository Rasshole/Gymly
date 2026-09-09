import {useEffect, useRef, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {useAppStore} from '@/store/appStore';
import {
  runAutoCheckoutEvaluation,
  AUTO_CHECKOUT_INTERVAL_MS,
} from '@/services/autoCheckout/runAutoCheckoutEvaluation';
import {useSessionStore} from '@/store/sessionStore';
import {updateCheckInLastSeenAt} from '@/services/supabase/checkInService';
import {
  configureGeolocationForActiveWorkoutTracking,
  configureGeolocationForPermissionSafety,
  getLocationPermissionStatus,
  isLocationAuthorized,
  requestBackgroundLocationForActiveWorkout,
} from '@/services/location/locationPermission';

/**
 * Auto-checkout under aktiv session — også i baggrunden (GPS + server-backup).
 *
 * Android note: RN JS timers/watchPosition are often suspended while backgrounded
 * without a location foreground service. On resume we re-read permission, restart
 * the watcher, and re-evaluate so a move past 200 m is not missed.
 */
export function useAutoCheckoutController(): void {
  const userId = useAppStore(s => s.user?.id);
  const activeCheckInId = useSessionStore(s => s.activeSession?.checkInId);
  const [coords, setCoords] = useState<{latitude: number; longitude: number} | null>(
    null,
  );
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearWatch = () => {
    if (watchIdRef.current != null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const startWatch = () => {
    configureGeolocationForPermissionSafety();
    Geolocation.getCurrentPosition(
      pos => {
        if (mountedRef.current) {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      },
      () => {},
      {enableHighAccuracy: true, timeout: 12_000, maximumAge: 5000},
    );
    clearWatch();
    watchIdRef.current = Geolocation.watchPosition(
      pos => {
        if (mountedRef.current) {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      },
      () => {},
      {
        enableHighAccuracy: true,
        distanceFilter: 5,
        interval: 4000,
        fastestInterval: 2000,
        useSignificantChanges: false,
      },
    ) as unknown as number;
    if (__DEV__) {
      console.log('[AUTO_CHECKOUT] watcher started id=', watchIdRef.current);
    }
  };

  const ensureWatchIfAuthorized = async (): Promise<boolean> => {
    const status = await getLocationPermissionStatus();
    if (!mountedRef.current) {
      return false;
    }
    if (__DEV__) {
      console.log('[AUTO_CHECKOUT] permission status =', status);
    }
    if (!isLocationAuthorized(status)) {
      setCoords(null);
      clearWatch();
      return false;
    }
    startWatch();
    return true;
  };

  useEffect(() => {
    if (!userId || !activeCheckInId) {
      setCoords(null);
      clearWatch();
      configureGeolocationForActiveWorkoutTracking(false);
      return;
    }

    if (__DEV__) {
      console.log('[AUTO_CHECKOUT] active session detected', activeCheckInId);
    }

    configureGeolocationForActiveWorkoutTracking(true);
    void requestBackgroundLocationForActiveWorkout().then(() => {
      void ensureWatchIfAuthorized();
    });
    void ensureWatchIfAuthorized();

    return () => {
      clearWatch();
      configureGeolocationForActiveWorkoutTracking(false);
    };
    // intentionally only session identity — resume path restarts watcher below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeCheckInId]);

  const evaluate = () => {
    if (!userId) {
      return;
    }
    void runAutoCheckoutEvaluation({
      userId,
      appState: appStateRef.current,
      userCoords: coordsRef.current,
    });
  };

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', next => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (__DEV__) {
        console.log('[AUTO_CHECKOUT] app state =', next);
      }

      if (next === 'active' && prev !== 'active') {
        // Settings → "Allow all the time" or Home → reopen: re-read permission,
        // restart watcher, evaluate with fresh GPS (stale-gap spike exemption).
        const session = useSessionStore.getState().activeSession;
        if (session?.checkInId) {
          if (__DEV__) {
            console.log('[AUTO_CHECKOUT] resume — refresh permission + watcher');
          }
          configureGeolocationForActiveWorkoutTracking(true);
          void ensureWatchIfAuthorized().then(() => {
            evaluate();
          });
        }
        return;
      }

      if (
        (next === 'background' || next === 'inactive') &&
        prev === 'active'
      ) {
        const session = useSessionStore.getState().activeSession;
        if (session?.checkInId) {
          void updateCheckInLastSeenAt(session.checkInId, userId).catch(() => {});
        }
      }
      evaluate();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeCheckInId) {
      return;
    }
    evaluate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeCheckInId, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    if (!userId || !activeCheckInId) {
      return;
    }
    const id = setInterval(evaluate, AUTO_CHECKOUT_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeCheckInId]);
}
