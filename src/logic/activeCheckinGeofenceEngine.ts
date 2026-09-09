import {
  ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
  ACTIVE_CHECKIN_SAFE_RADIUS,
  ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M,
  ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE,
  ACTIVE_CHECKIN_STALE_LOCATION_GAP_MS,
  MAX_DISTANCE_SAMPLES,
} from '@/config/activeCheckinGeofenceConfig';

/** 1 = inden for center (≤ radius), 2 = uden for */
export type GeofenceZone = 1 | 2;

export function classifyGeofenceZone(distanceMeters: number): GeofenceZone {
  return distanceMeters <= ACTIVE_CHECKIN_SAFE_RADIUS ? 1 : 2;
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

/** True when a prior accepted sample exists but is older than the stale gap. */
export function isGeofenceLocationSampleStale(
  lastCoordsAtMs: number,
  nowMs: number,
  staleGapMs: number = ACTIVE_CHECKIN_STALE_LOCATION_GAP_MS,
): boolean {
  // No prior sample yet (fresh check-in) — use normal spike/grace path.
  if (!lastCoordsAtMs || lastCoordsAtMs <= 0) {
    return false;
  }
  return nowMs - lastCoordsAtMs >= staleGapMs;
}

/**
 * After a long gap outside the radius, seed grace + stable-outside so checkout
 * can complete on the first trusted resume reading (JS was paused in background).
 */
export function seedStaleOutsideResumeState(nowMs: number): {
  awayStartedAt: string;
  zoneHistory: GeofenceZone[];
} {
  return {
    awayStartedAt: new Date(
      nowMs - ACTIVE_CHECKIN_OUTSIDE_GRACE_MS - 1,
    ).toISOString(),
    zoneHistory: [2, 2],
  };
}

/**
 * Rullende median over sidste 1–3 for at dæmpe enkelt-GPS-spring.
 */
export function pushDistanceSample(
  buffer: number[],
  rawMeters: number,
  opts?: {
    previousMedianForSpikeCheck?: number | null;
    /** When true, skip spike reject (stale gap / first sample after background). */
    skipSpikeReject?: boolean;
  },
): {buffer: number[]; median: number; zone: GeofenceZone; rejectedSpike: boolean} {
  let next = [...buffer, rawMeters];
  if (next.length > MAX_DISTANCE_SAMPLES) {
    next = next.slice(-MAX_DISTANCE_SAMPLES);
  }
  if (
    !opts?.skipSpikeReject &&
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
  stableOutside: boolean;
  stableSafe: boolean;
} {
  if (zoneHistory.length === 0) {
    return {stableOutside: false, stableSafe: false};
  }
  const lastOutside = zoneHistory.slice(-ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE);
  const stableOutside =
    lastOutside.length === ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE &&
    lastOutside.every((z) => z === 2);
  const stableSafe = zoneHistory[zoneHistory.length - 1] === 1;
  return {stableOutside, stableSafe};
}
