import {useState, useEffect, useRef} from 'react';
import Geolocation from '@react-native-community/geolocation';
import {
  configureGeolocationForPermissionSafety,
  getLocationPermissionStatus,
  isLocationAuthorized,
} from '@/services/location/locationPermission';

/**
 * Optional user coordinates for distance sorting — never requests permission.
 * Returns null when location is not authorized.
 */
export function useOptionalUserCoords(): {latitude: number; longitude: number} | null {
  const [c, setC] = useState<{latitude: number; longitude: number} | null>(null);
  const lastPushMsRef = useRef(0);

  useEffect(() => {
    let watchId: number | null = null;
    let mounted = true;

    configureGeolocationForPermissionSafety();

    const maybePush = (latitude: number, longitude: number) => {
      const now = Date.now();
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
        () => {
          if (mounted) {
            setC(null);
          }
        },
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
      const status = await getLocationPermissionStatus();
      if (!mounted) {
        return;
      }
      if (!isLocationAuthorized(status)) {
        setC(null);
        return;
      }
      startWatch();
    };

    void run().catch(() => {
      if (mounted) {
        setC(null);
      }
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
