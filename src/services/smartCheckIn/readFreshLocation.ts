import Geolocation from '@react-native-community/geolocation';
import {
  configureGeolocationForPermissionSafety,
  getLocationPermissionStatus,
  isLocationAuthorized,
} from '@/services/location/locationPermission';
import type {SmartLocationSample} from '@/services/smartCheckIn/smartCheckInRules';

const FRESH_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 0,
};

/**
 * One GPS fix. Does not watch position and does not prompt.
 * Returns null when permission is missing or the read fails.
 */
export async function readFreshLocationIfAllowed(): Promise<SmartLocationSample | null> {
  configureGeolocationForPermissionSafety();
  const status = await getLocationPermissionStatus();
  if (!isLocationAuthorized(status)) {
    return null;
  }
  return readOneLocationFix();
}

export function readOneLocationFix(): Promise<SmartLocationSample | null> {
  configureGeolocationForPermissionSafety();
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters:
            typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
          timestampMs: position.timestamp,
        });
      },
      () => resolve(null),
      FRESH_OPTIONS,
    );
  });
}
