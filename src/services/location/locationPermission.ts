/**
 * Location permission — iOS/Android status is source of truth.
 * Geolocation is configured with skipPermissionRequests so getCurrentPosition
 * never triggers the system dialog; only explicit request* calls may prompt.
 */
import Geolocation from '@react-native-community/geolocation';
import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';

export type LocationPermissionStatus =
  | 'notDetermined'
  | 'authorizedWhenInUse'
  | 'authorizedAlways'
  | 'denied'
  | 'restricted'
  | 'unavailable';

export const LOCATION_DENIED_SETTINGS_DA =
  'Lokation er slået fra. Gå til Indstillinger for at slå det til.';

let geolocationConfigured = false;

export function configureGeolocationForPermissionSafety(): void {
  if (geolocationConfigured) {
    return;
  }
  geolocationConfigured = true;
  try {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      authorizationLevel: 'whenInUse',
      enableBackgroundLocationUpdates: false,
    });
  } catch (e) {
    if (__DEV__) {
      console.warn('[locationPermission] setRNConfiguration failed', e);
    }
  }
}

export function isLocationAuthorized(status: LocationPermissionStatus): boolean {
  return status === 'authorizedWhenInUse' || status === 'authorizedAlways';
}

export function mapLegacyLocationPermissionStatus(
  status: LocationPermissionStatus,
): 'unknown' | 'granted' | 'denied' | 'unavailable' {
  if (isLocationAuthorized(status)) {
    return 'granted';
  }
  if (status === 'denied' || status === 'restricted') {
    return 'denied';
  }
  if (status === 'notDetermined') {
    return 'unknown';
  }
  return 'unavailable';
}

function probeIosLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (status: LocationPermissionStatus) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };

    const timer = setTimeout(() => finish('notDetermined'), 1200);

    Geolocation.getCurrentPosition(
      () => finish('authorizedWhenInUse'),
      err => {
        if (err?.code === 1) {
          finish('denied');
          return;
        }
        finish('notDetermined');
      },
      {enableHighAccuracy: false, timeout: 1000, maximumAge: 60 * 60 * 1000},
    );
  });
}

export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  configureGeolocationForPermissionSafety();

  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted ? 'authorizedWhenInUse' : 'notDetermined';
    } catch {
      return 'unavailable';
    }
  }

  return probeIosLocationPermissionStatus();
}

export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
  configureGeolocationForPermissionSafety();

  if (Platform.OS === 'android') {
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Placeringsadgang',
          message: 'Gymly bruger din placering til check-in ved fitnesscentre.',
          buttonNeutral: 'Senere',
          buttonNegative: 'Annuller',
          buttonPositive: 'OK',
        },
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        return 'authorizedWhenInUse';
      }
      return 'denied';
    } catch {
      return 'unavailable';
    }
  }

  return new Promise(resolve => {
    Geolocation.requestAuthorization(
      () => {
        void getLocationPermissionStatus().then(resolve);
      },
      err => {
        resolve(err?.code === 1 ? 'denied' : 'denied');
      },
    );
  });
}

/** Only prompts when status is notDetermined (or Android not yet granted). */
export async function requestLocationPermissionIfNeeded(): Promise<LocationPermissionStatus> {
  const current = await getLocationPermissionStatus();
  if (isLocationAuthorized(current)) {
    return current;
  }
  if (current === 'denied' || current === 'restricted') {
    return current;
  }
  return requestLocationPermission();
}

export function showLocationDeniedInAppMessage(): void {
  Alert.alert('Lokation', LOCATION_DENIED_SETTINGS_DA, [
    {text: 'Annuller', style: 'cancel'},
    {text: 'Åbn Indstillinger', onPress: () => Linking.openSettings()},
  ]);
}
