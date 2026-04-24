import {
  ACTIVE_CHECKIN_BUFFER_RADIUS,
  ACTIVE_CHECKIN_SAFE_RADIUS,
  ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M,
  ACTIVE_CHECKIN_STABLE_CONSECUTIVE_BUFFER,
  ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE,
  MAX_DISTANCE_SAMPLES,
} from '@/config/activeCheckinGeofenceConfig';

export type GeofenceZone = 1 | 2 | 3;

export function classifyGeofenceZone(distanceMeters: number): GeofenceZone {
  if (distanceMeters <= ACTIVE_CHECKIN_SAFE_RADIUS) {
    return 1;
  }
  if (distanceMeters <= ACTIVE_CHECKIN_BUFFER_RADIUS) {
    return 2;
  }
  return 3;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0
    ? (s[mid - 1]! + s[mid]!) / 2
    : s[mid]!;
}

/**
 * Rullende median over sidste 1–3 for at dæmpe enkelt-GPS-spring.
 */
export function pushDistanceSample(
  buffer: number[],
  rawMeters: number,
  opts?: {previousMedianForSpikeCheck?: number | null},
): {buffer: number[]; median: number; zone: GeofenceZone; rejectedSpike: boolean} {
  let next = [...buffer, rawMeters];
  if (next.length > MAX_DISTANCE_SAMPLES) {
    next = next.slice(-MAX_DISTANCE_SAMPLES);
  }
  if (
    typeof opts?.previousMedianForSpikeCheck === 'number' &&
    !Number.isNaN(opts.previousMedianForSpikeCheck) &&
    next.length >= 2
  ) {
    const m = median(next.slice(0, -1));
    if (rawMeters - m > ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M && m < ACTIVE_CHECKIN_SAFE_RADIUS) {
      return {buffer: next.slice(0, -1), median: m, zone: classifyGeofenceZone(m), rejectedSpike: true};
    }
  }
  const take = next.slice(-3);
  const med = median(take);
  return {buffer: next, median: med, zone: classifyGeofenceZone(med), rejectedSpike: false};
}

export function computeStableFlags(zoneHistory: GeofenceZone[]): {
  stableBuffer: boolean;
  stableOutside: boolean;
  stableSafe: boolean;
} {
  if (zoneHistory.length === 0) {
    return {stableBuffer: false, stableOutside: false, stableSafe: false};
  }
  const last3 = zoneHistory.slice(-ACTIVE_CHECKIN_STABLE_CONSECUTIVE_BUFFER);
  const stableBuffer =
    last3.length === ACTIVE_CHECKIN_STABLE_CONSECUTIVE_BUFFER &&
    last3.every((z) => z === 2);
  const last2 = zoneHistory.slice(-ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE);
  const stableOutside =
    last2.length === ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE &&
    last2.every((z) => z === 3);
  const lastSafe1 = zoneHistory[zoneHistory.length - 1] === 1;
  return {
    stableBuffer,
    stableOutside,
    stableSafe: lastSafe1,
  };
}
