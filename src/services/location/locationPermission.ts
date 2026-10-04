/**
 * Location permission — iOS/Android status is source of truth.
 * Geolocation is configured with skipPermissionRequests so getCurrentPosition
 * never triggers the system dialog; only explicit request* calls may prompt.
 *
 * Production auto-checkout is resume-based (evaluate when the app is active).
 * We therefore request when-in-use / fine location only — not ACCESS_BACKGROUND_LOCATION
 * and not continuous closed-app tracking.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import {rt} from '@/i18n';

const LAST_USER_FIX_KEY = 'gymly.lastUserFix.v1';

export type LocationPermissionStatus =
  | 'notDetermined'
  | 'authorizedWhenInUse'
  | 'authorizedAlways'
  | 'denied'
  | 'restricted'
  | 'unavailable';

let geolocationConfigured = false;

let lastUserFix: {latitude: number; longitude: number} | null = null;

export function peekLastUserFix(): {latitude: number; longitude: number} | null {
  return lastUserFix;
}

export function rememberUserFix(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }
  lastUserFix = {latitude, longitude};
  void AsyncStorage.setItem(LAST_USER_FIX_KEY, `${latitude},${longitude}`).catch(() => {});
}

/** Load the last fix into memory and start a fresh reading. Safe at app launch. */
export function warmLastUserFix(): void {
  void AsyncStorage.getItem(LAST_USER_FIX_KEY)
    .then(raw => {
      if (!raw || lastUserFix) {
        return;
      }
      const [latRaw, lngRaw] = raw.split(',');
      const latitude = Number(latRaw);
      const longitude = Number(lngRaw);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }
      lastUserFix = {latitude, longitude};
    })
    .catch(() => {});
  void getLocationPermissionStatus().catch(() => {});
}

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

/**
 * Kept for call-site compatibility during active workouts.
 * Does not enable continuous background location (resume-based auto-checkout only).
 */
export function configureGeolocationForActiveWorkoutTracking(_enabled: boolean): void {
  geolocationConfigured = false;
  configureGeolocationForPermissionSafety();
}

export async function requestBackgroundLocationForActiveWorkout(): Promise<LocationPermissionStatus> {
  // Route through disclosure gate, then ensure when-in-use (no Always / background).
  const {
    requestBackgroundLocationWithDisclosureIfNeeded,
  } = require('./requestLocationWithDisclosure') as typeof import('./requestLocationWithDisclosure');
  return requestBackgroundLocationWithDisclosureIfNeeded();
}

/**
 * Ensures location permission for active-workout auto-checkout.
 * Does NOT request ACCESS_BACKGROUND_LOCATION / Always — production checkout runs
 * while the app is open or when it becomes active again.
 */
export async function requestBackgroundLocationOsPermission(): Promise<LocationPermissionStatus> {
  configureGeolocationForActiveWorkoutTracking(true);

  const current = await getLocationPermissionStatus();
  if (isLocationAuthorized(current)) {
    return current === 'authorizedAlways' ? 'authorizedWhenInUse' : current;
  }
  if (current === 'denied' || current === 'restricted') {
    return current;
  }
  return requestLocationPermission();
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
      position => {
        rememberUserFix(position.coords.latitude, position.coords.longitude);
        finish('authorizedWhenInUse');
      },
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
