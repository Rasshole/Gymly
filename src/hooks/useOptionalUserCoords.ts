import {useState, useEffect, useRef} from 'react';
import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid, Platform} from 'react-native';

/**
 * Etskuds-brugerkoordinat til afstand sortering (ignorer fejl/afvisning).
 */
export function useOptionalUserCoords(): {latitude: number; longitude: number} | null {
  const [c, setC] = useState<{latitude: number; longitude: number} | null>(null);
  const lastPushMsRef = useRef(0);

  useEffect(() => {
    let watchId: number | null = null;
    let mounted = true;

    const maybePush = (latitude: number, longitude: number) => {
      const now = Date.now();
      // Throttle state updates to avoid frequent re-renders.
      if (now - lastPushMsRef.current < 1200) {
        return;
      }
      lastPushMsRef.current = now;
      if (!mounted) {
        return;
      }
      setC(prev => {
        if (!prev) {
          return {latitude, longitude};
        }
        const dLat = Math.abs(prev.latitude - latitude);
        const dLng = Math.abs(prev.longitude - longitude);
        if (dLat < 0.00001 && dLng < 0.00001) {
          return prev;
        }
        return {latitude, longitude};
      });
    };

    const startWatch = () => {
      Geolocation.getCurrentPosition(
        pos => maybePush(pos.coords.latitude, pos.coords.longitude),
        () => setC(null),
        {enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000},
      );
      watchId = Geolocation.watchPosition(
        pos => maybePush(pos.coords.latitude, pos.coords.longitude),
        () => {},
        {
          enableHighAccuracy: false,
          distanceFilter: 10,
          interval: 3000,
          fastestInterval: 2000,
          useSignificantChanges: false,
        },
      ) as unknown as number;
    };

    const run = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (mounted) {
              setC(null);
            }
            return;
          }
        } catch {
          if (mounted) {
            setC(null);
          }
          return;
        }
      } else {
        Geolocation.requestAuthorization(
          () => {},
          () => {},
        );
      }
      startWatch();
    };

    run().catch(() => {
      setC(null);
    });

    return () => {
      mounted = false;
      if (watchId != null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, []);
  return c;
}
