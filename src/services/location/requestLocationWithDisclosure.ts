/**
 * Gate: Gymly prominent disclosure → affirmative Agree → Android/iOS runtime permission.
 * No location runtime request may run without this sequence when permission is not yet granted.
 */

import {
  hasAcceptedLocationProminentDisclosure,
  markLocationProminentDisclosureAccepted,
} from '@/services/location/locationDisclosureConsent';
import {presentLocationProminentDisclosure} from '@/services/location/locationDisclosureGate';
import {
  getLocationPermissionStatus,
  isLocationAuthorized,
  requestLocationPermission,
  type LocationPermissionStatus,
} from '@/services/location/locationPermission';

async function ensureProminentDisclosureAccepted(): Promise<boolean> {
  if (await hasAcceptedLocationProminentDisclosure()) {
    return true;
  }
  const agreed = await presentLocationProminentDisclosure();
  if (!agreed) {
    return false;
  }
  await markLocationProminentDisclosureAccepted();
  return true;
}

/**
 * When location is not yet authorized, show Gymly disclosure first (if needed),
 * then request the OS when-in-use / fine location permission.
 */
export async function requestLocationPermissionWithDisclosureIfNeeded(): Promise<LocationPermissionStatus> {
  const current = await getLocationPermissionStatus();
  if (isLocationAuthorized(current)) {
    return current;
  }
  if (current === 'denied' || current === 'restricted') {
    return current;
  }

  const accepted = await ensureProminentDisclosureAccepted();
  if (!accepted) {
    return 'notDetermined';
  }

  return requestLocationPermission();
}

/**
 * Active workout: disclosure (if needed) → fine / when-in-use location.
 * Does not request continuous background / Always permission (resume-based auto-checkout).
 */
export async function requestBackgroundLocationWithDisclosureIfNeeded(): Promise<LocationPermissionStatus> {
  return requestLocationPermissionWithDisclosureIfNeeded();
}
