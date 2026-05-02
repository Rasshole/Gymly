import {
  ACTIVE_CHECKIN_BUFFER_GRACE_MS,
  ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS,
  ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
  ACTIVE_CHECKIN_BUFFER_RADIUS,
  ACTIVE_CHECKIN_SAFE_RADIUS,
} from '@/config/activeCheckinGeofenceConfig';

export type GeofenceDistanceDecision =
  | { action: 'clear_away' }
  | { action: 'set_away'; awayStartedAt: string; lastDistance: number }
  | { action: 'checkout_away' }
  | { action: 'update_distance_only'; lastDistance: number; awayStartedUnchanged: string }
  | { action: 'none'; shouldWarnUserAway: boolean; lastDistance: number };

function ms(x: string): number {
  return new Date(x).getTime();
}

/**
 * 4+ timer uden "ping" (last_seen) → auto checkout. Bruger last_seen || started.
 */
export function shouldForceCheckoutInactivity(
  lastSeenOrNull: string | null,
  startedAt: string,
  nowMs: number,
): boolean {
  const ref = lastSeenOrNull && lastSeenOrNull.length > 0 ? lastSeenOrNull : startedAt;
  if (!ref) {
    return false;
  }
  return nowMs - ms(ref) > ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS;
}

/**
 * Baseret på afstand (medianet m) og hvornår man forlod safe zone.
 * ≤400: ryd væk-timer. >400: kræv 15m i buffer, 7m uden for buffer.
 */
export function decideGeofenceAutoCheckout(
  distanceMeters: number,
  awayStartedAtIso: string | null,
  nowMs: number,
): GeofenceDistanceDecision {
  if (Number.isNaN(distanceMeters) || distanceMeters < 0) {
    return {
      action: 'none',
      shouldWarnUserAway: false,
      lastDistance: 0,
    };
  }
  if (distanceMeters <= ACTIVE_CHECKIN_SAFE_RADIUS) {
    if (awayStartedAtIso) {
      return {action: 'clear_away'};
    }
    return {
      action: 'none',
      shouldWarnUserAway: false,
      lastDistance: Math.round(distanceMeters),
    };
  }
  if (!awayStartedAtIso) {
    return {
      action: 'set_away',
      awayStartedAt: new Date(nowMs).toISOString(),
      lastDistance: Math.round(distanceMeters),
    };
  }
  const elapsed = nowMs - ms(awayStartedAtIso);
  if (distanceMeters > ACTIVE_CHECKIN_BUFFER_RADIUS) {
    if (elapsed >= ACTIVE_CHECKIN_OUTSIDE_GRACE_MS) {
      return {action: 'checkout_away'};
    }
  } else {
    if (elapsed >= ACTIVE_CHECKIN_BUFFER_GRACE_MS) {
      return {action: 'checkout_away'};
    }
  }
  return {
    action: 'update_distance_only',
    lastDistance: Math.round(distanceMeters),
    awayStartedUnchanged: awayStartedAtIso,
  };
}

/**
 * Vis advarsel når uden for 400m (og stadig "aktiv" session)
 */
export function shouldShowAwayZoneWarning(
  decision: GeofenceDistanceDecision,
  distanceMeters: number,
): boolean {
  if (distanceMeters > ACTIVE_CHECKIN_SAFE_RADIUS) {
    if (decision.action === 'set_away') {
      return true;
    }
    if (decision.action === 'update_distance_only') {
      return true;
    }
    if (decision.action === 'none' && (decision as {shouldWarnUserAway?: boolean}).shouldWarnUserAway) {
      return true;
    }
  }
  return false;
}

export function isMissingCenterCoordinates(distanceInput: {
  canAttemptDistance: boolean;
}): boolean {
  return !distanceInput.canAttemptDistance;
}
