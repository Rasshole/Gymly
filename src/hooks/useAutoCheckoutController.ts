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

  useEffect(() => {
    if (!userId || !activeCheckInId) {
      setCoords(null);
      configureGeolocationForActiveWorkoutTracking(false);
      return;
    }

    configureGeolocationForActiveWorkoutTracking(true);
    void requestBackgroundLocationForActiveWorkout();

    let watchId: number | null = null;
    let mounted = true;

    configureGeolocationForPermissionSafety();

    const startWatch = () => {
      Geolocation.getCurrentPosition(
        pos => {
          if (mounted) {
            setCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          }
        },
        () => {},
        {enableHighAccuracy: true, timeout: 12_000, maximumAge: 5000},
      );
      watchId = Geolocation.watchPosition(
        pos => {
          if (mounted) {
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
    };

    void getLocationPermissionStatus().then(status => {
      if (!mounted) {
        return;
      }
      if (!isLocationAuthorized(status)) {
        setCoords(null);
        return;
      }
      startWatch();
    });

    return () => {
      mounted = false;
      if (watchId != null) {
        Geolocation.clearWatch(watchId);
      }
      configureGeolocationForActiveWorkoutTracking(false);
    };
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
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeCheckInId) {
      return;
    }
    evaluate();
  }, [userId, activeCheckInId, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    if (!userId || !activeCheckInId) {
      return;
    }
    const id = setInterval(evaluate, AUTO_CHECKOUT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, activeCheckInId]);
}
