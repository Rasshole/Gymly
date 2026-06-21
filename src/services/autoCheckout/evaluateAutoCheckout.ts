import {
  ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS,
  ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
  AUTO_CHECKOUT_DISTANCE_METERS,
} from '@/config/activeCheckinGeofenceConfig';

export type GeofenceDistanceDecision =
  | {action: 'clear_away'}
  | {action: 'set_away'; awayStartedAt: string; lastDistance: number}
  | {action: 'checkout_away'}
  | {action: 'update_distance_only'; lastDistance: number; awayStartedUnchanged: string}
  | {action: 'none'; lastDistance: number};

function ms(x: string): number {
  return new Date(x).getTime();
}

/**
 * 4+ timer uden "ping" (last_seen) → system recovery (ikke GPS auto-distance).
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
 * Afstand fra aktivt center: ≤200 m = hjem, >200 m = start/fortsæt ude-timer, checkout efter grace.
 */
export function decideGeofenceAutoCheckout(
  distanceMeters: number,
  awayStartedAtIso: string | null,
  nowMs: number,
): GeofenceDistanceDecision {
  if (Number.isNaN(distanceMeters) || distanceMeters < 0) {
    return {action: 'none', lastDistance: 0};
  }
  if (distanceMeters <= AUTO_CHECKOUT_DISTANCE_METERS) {
    if (awayStartedAtIso) {
      return {action: 'clear_away'};
    }
    return {
      action: 'none',
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
  if (elapsed >= ACTIVE_CHECKIN_OUTSIDE_GRACE_MS) {
    return {action: 'checkout_away'};
  }
  return {
    action: 'update_distance_only',
    lastDistance: Math.round(distanceMeters),
    awayStartedUnchanged: awayStartedAtIso,
  };
}

export function shouldShowAwayZoneWarning(
  decision: GeofenceDistanceDecision,
  distanceMeters: number,
): boolean {
  if (distanceMeters <= AUTO_CHECKOUT_DISTANCE_METERS) {
    return false;
  }
  return (
    decision.action === 'set_away' ||
    decision.action === 'update_distance_only' ||
    decision.action === 'checkout_away'
  );
}
