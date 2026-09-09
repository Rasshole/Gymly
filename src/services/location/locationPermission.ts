/**
 * Location permission — iOS/Android status is source of truth.
 * Geolocation is configured with skipPermissionRequests so getCurrentPosition
 * never triggers the system dialog; only explicit request* calls may prompt.
 */
import Geolocation from '@react-native-community/geolocation';
import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import {rt} from '@/i18n';

export type LocationPermissionStatus =
  | 'notDetermined'
  | 'authorizedWhenInUse'
  | 'authorizedAlways'
  | 'denied'
  | 'restricted'
  | 'unavailable';

let geolocationConfigured = false;
let activeWorkoutTrackingEnabled = false;

export function configureGeolocationForPermissionSafety(): void {
  if (geolocationConfigured && !activeWorkoutTrackingEnabled) {
    return;
  }
  geolocationConfigured = true;
  try {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      authorizationLevel: activeWorkoutTrackingEnabled ? 'always' : 'whenInUse',
      enableBackgroundLocationUpdates: activeWorkoutTrackingEnabled,
    });
  } catch (e) {
    if (__DEV__) {
      console.warn('[locationPermission] setRNConfiguration failed', e);
    }
  }
}

/** Aktiv træning: tillad GPS i baggrunden til auto-tjek-ud. */
export function configureGeolocationForActiveWorkoutTracking(enabled: boolean): void {
  if (activeWorkoutTrackingEnabled === enabled) {
    return;
  }
  activeWorkoutTrackingEnabled = enabled;
  geolocationConfigured = false;
  configureGeolocationForPermissionSafety();
}

export async function requestBackgroundLocationForActiveWorkout(): Promise<LocationPermissionStatus> {
  // Route through disclosure gate (background access must be disclosed first).
  const {
    requestBackgroundLocationWithDisclosureIfNeeded,
  } = require('./requestLocationWithDisclosure') as typeof import('./requestLocationWithDisclosure');
  return requestBackgroundLocationWithDisclosureIfNeeded();
}

/** OS-level background location request — call only after prominent disclosure Agree. */
export async function requestBackgroundLocationOsPermission(): Promise<LocationPermissionStatus> {
  configureGeolocationForActiveWorkoutTracking(true);

  if (Platform.OS === 'android') {
    try {
      const fineGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (!fineGranted) {
        return requestLocationPermission();
      }
      const bgGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      );
      if (bgGranted) {
        return 'authorizedAlways';
      }
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
        {
          title: rt('permissions.androidBackgroundTitle'),
          message: rt('permissions.androidRationaleMessage'),
          buttonNeutral: rt('permissions.androidLater'),
          buttonNegative: rt('common.cancel'),
          buttonPositive: rt('common.ok'),
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED
        ? 'authorizedAlways'
        : 'authorizedWhenInUse';
    } catch {
      return getLocationPermissionStatus();
    }
  }

  const current = await getLocationPermissionStatus();
  if (current === 'authorizedAlways') {
    return current;
  }
  if (current !== 'authorizedWhenInUse' && current !== 'notDetermined') {
    return current;
  }

  return new Promise(resolve => {
    Geolocation.requestAuthorization(
      () => {
        void getLocationPermissionStatus().then(resolve);
      },
      () => {
        void getLocationPermissionStatus().then(resolve);
      },
    );
  });
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
          title: rt('permissions.androidRationaleTitle'),
          message: rt('permissions.androidRationaleMessage'),
          buttonNeutral: rt('permissions.androidLater'),
          buttonNegative: rt('common.cancel'),
          buttonPositive: rt('common.ok'),
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
  // Always route through Gymly prominent disclosure before any OS location prompt.
  const {
    requestLocationPermissionWithDisclosureIfNeeded,
  } = require('./requestLocationWithDisclosure') as typeof import('./requestLocationWithDisclosure');
  return requestLocationPermissionWithDisclosureIfNeeded();
}

export function showLocationDeniedInAppMessage(): void {
  Alert.alert(rt('permissions.locationTitle'), rt('permissions.locationDeniedBody'), [
    {text: rt('common.cancel'), style: 'cancel'},
    {text: rt('permissions.openSettings'), onPress: () => Linking.openSettings()},
  ]);
}
