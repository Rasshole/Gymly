import {CHECK_IN_RADIUS_METERS} from '@/config/dataConfig';
import {calculateDistance} from '@/utils/geoUtils';

/**
 * Suggestion limits for Smart Check-in.
 *
 * Distance reuses CHECK_IN_RADIUS_METERS (200). Manual check-in compares that
 * radius on the client before insert. The check_ins insert policy only checks
 * auth.uid() = user_id. The server does not receive or verify the GPS fix.
 *
 * A suggestion requires a fresh, precise fix:
 * - age at most 30 seconds
 * - horizontal accuracy present and at most 50 meters
 * Fixes without accuracy, older fixes, and accuracy worse than 50 meters
 * produce no suggestion.
 *
 * "Ikke nu" hides that gym for 2 hours, stored per user and gym.
 */
export const SMART_CHECK_IN_MAX_LOCATION_AGE_MS = 30 * 1000;
export const SMART_CHECK_IN_MAX_ACCURACY_METERS = 50;
export const SMART_CHECK_IN_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export type SmartLocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  timestampMs: number;
};

export type SmartGymCandidate = {
  id: string;
  name: string;
  city?: string;
  latitude: number;
  longitude: number;
};

export type SmartGymHit = {
  gym: SmartGymCandidate;
  distanceMeters: number;
};

export function isFreshPreciseLocation(
  sample: SmartLocationSample,
  nowMs: number,
): boolean {
  if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) {
    return false;
  }
  if (sample.accuracyMeters == null || !Number.isFinite(sample.accuracyMeters)) {
    return false;
  }
  if (sample.accuracyMeters < 0 || sample.accuracyMeters > SMART_CHECK_IN_MAX_ACCURACY_METERS) {
    return false;
  }
  if (!Number.isFinite(sample.timestampMs) || !Number.isFinite(nowMs)) {
    return false;
  }
  const ageMs = nowMs - sample.timestampMs;
  if (ageMs < 0 || ageMs > SMART_CHECK_IN_MAX_LOCATION_AGE_MS) {
    return false;
  }
  return true;
}

export function gymsInsideCheckInRadius(
  sample: SmartLocationSample,
  gyms: readonly SmartGymCandidate[],
): SmartGymHit[] {
  const hits: SmartGymHit[] = [];
  for (const gym of gyms) {
    if (!Number.isFinite(gym.latitude) || !Number.isFinite(gym.longitude)) {
      continue;
    }
    const distanceMeters = calculateDistance(
      sample.latitude,
      sample.longitude,
      gym.latitude,
      gym.longitude,
    );
    if (distanceMeters <= CHECK_IN_RADIUS_METERS) {
      hits.push({gym, distanceMeters});
    }
  }
  hits.sort((a, b) => a.distanceMeters - b.distanceMeters || a.gym.id.localeCompare(b.gym.id));
  return hits;
}

export function cooldownMapAfterDismiss(
  current: Readonly<Record<string, number>>,
  gymIds: readonly string[],
  nowMs: number,
): Record<string, number> {
  const next = {...current};
  const until = nowMs + SMART_CHECK_IN_COOLDOWN_MS;
  for (const gymId of gymIds) {
    next[gymId] = until;
  }
  return next;
}

export function visibleSmartCheckInGyms(input: {
  sample: SmartLocationSample;
  gyms: readonly SmartGymCandidate[];
  nowMs: number;
  cooldownUntilByGymId: Readonly<Record<string, number>>;
  hasActiveSession: boolean;
}): SmartGymHit[] {
  if (input.hasActiveSession) {
    return [];
  }
  if (!isFreshPreciseLocation(input.sample, input.nowMs)) {
    return [];
  }
  return gymsInsideCheckInRadius(input.sample, input.gyms).filter(hit => {
    const until = input.cooldownUntilByGymId[hit.gym.id];
    return until == null || until <= input.nowMs;
  });
}
