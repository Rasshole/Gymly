/**
 * Auto-checkout: GPS >200 m → completeWorkoutSession + stop timer + modal.
 */
import {type AppStateStatus} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {ACTIVE_CHECKIN_LOCATION_INTERVAL_MS} from '@/config/activeCheckinGeofenceConfig';
import {getGymLatLngForCheckIn} from '@/utils/gymCoordinatesForCheckIn';
import {getDistanceInMeters} from '@/utils/geoUtils';
import {pushDistanceSample, type GeofenceZone} from '@/logic/activeCheckinGeofenceEngine';
import {
  decideGeofenceAutoCheckout,
  shouldShowAwayZoneWarning,
} from '@/services/autoCheckout/evaluateAutoCheckout';
import {
  getActiveCheckInForUser,
  patchCheckInAwayState,
  updateCheckInLastSeenAt,
} from '@/services/supabase/checkInService';
import {activeSessionFromSupabaseRow, useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {getAutoCheckoutDevDistanceOverride} from '@/services/autoCheckout/autoCheckoutDevOverrides';
import type {SupabaseCheckInRow} from '@/types/checkIn.types';
import {completeWorkoutSession} from '@/services/session/completeWorkoutSession';

const GEO_OPTIONS = {enableHighAccuracy: true, timeout: 12_000, maximumAge: 5000};

type GeolocationResponseLike = {coords: {latitude: number; longitude: number}};

type DistBufferState = {
  buf: number[];
  prev: number | null;
  zoneHistory: GeofenceZone[];
  clientAwayStartedAt: string | null;
  lastDistM: number | null;
  lastCoordsAt: number;
};

const distBuffers = new Map<string, DistBufferState>();
const checkoutInFlight = new Set<string>();

function getBuf(checkInId: string): DistBufferState {
  let b = distBuffers.get(checkInId);
  if (!b) {
    b = {
      buf: [],
      prev: null,
      zoneHistory: [],
      clientAwayStartedAt: null,
      lastDistM: null,
      lastCoordsAt: 0,
    };
    distBuffers.set(checkInId, b);
  }
  return b;
}

function getPosition(): Promise<GeolocationResponseLike | null> {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve(pos as GeolocationResponseLike),
      () => resolve(null),
      GEO_OPTIONS,
    );
  });
}

export {ACTIVE_CHECKIN_LOCATION_INTERVAL_MS as AUTO_CHECKOUT_INTERVAL_MS};

export function isAutoCheckoutInProgress(checkInId?: string | null): boolean {
  if (!checkInId) {
    return checkoutInFlight.size > 0;
  }
  return checkoutInFlight.has(checkInId);
}

export function resetAutoCheckoutBuffersForTest(checkInId?: string): void {
  if (checkInId) {
    distBuffers.delete(checkInId);
    checkoutInFlight.delete(checkInId);
  } else {
    distBuffers.clear();
    checkoutInFlight.clear();
  }
}

export function resetAutoCheckoutTrackingOnRestore(checkInId?: string): void {
  if (checkInId) {
    distBuffers.delete(checkInId);
    return;
  }
  distBuffers.clear();
}

export async function clearPersistedAwayStateOnResume(
  checkInId: string,
  userId: string,
): Promise<void> {
  resetAutoCheckoutTrackingOnRestore(checkInId);
  try {
    await patchCheckInAwayState(checkInId, userId, {
      away_started_at: null,
      last_distance_meters: null,
    });
  } catch {
    /* offline */
  }
}

/** Prefer fresh high-accuracy GPS; optional coords are fallback only. */
async function resolveUserPosition(
  userCoords?: {latitude: number; longitude: number} | null,
): Promise<{latitude: number; longitude: number} | null> {
  const pos = await getPosition();
  if (pos) {
    return {latitude: pos.coords.latitude, longitude: pos.coords.longitude};
  }
  if (userCoords) {
    return userCoords;
  }
  return null;
}

export async function runAutoCheckoutEvaluation(params: {
  userId: string;
  appState: AppStateStatus;
  userCoords?: {latitude: number; longitude: number} | null;
}): Promise<void> {
  const {userId, appState, userCoords} = params;
  if (appState !== 'active') {
    return;
  }

  const now = Date.now();
  const row = await getActiveCheckInForUser(userId).catch(() => null);
  if (!row?.started_at || row.ended_at) {
    return;
  }

  if (
    !useSessionStore.getState().activeSession ||
    useSessionStore.getState().activeSession?.checkInId !== row.id
  ) {
    try {
      useSessionStore.getState().startSession(activeSessionFromSupabaseRow(row));
    } catch {
      /* ignore */
    }
  }

  if (checkoutInFlight.has(row.id)) {
    return;
  }

  const st = getBuf(row.id);
  const target = getGymLatLngForCheckIn(String(row.gym_id));
  if (!target) {
    if (__DEV__) {
      console.warn('[AutoCheckout] missing gym coordinates', row.gym_id);
    }
    return;
  }

  let distM: number | null = null;
  const devD = getAutoCheckoutDevDistanceOverride();
  if (devD != null) {
    distM = devD;
    st.zoneHistory = [...st.zoneHistory, devD > 200 ? 2 : 1].slice(-5) as GeofenceZone[];
    st.lastDistM = devD;
    st.lastCoordsAt = now;
  } else {
    const position = await resolveUserPosition(userCoords);
    if (!position) {
      if (st.lastDistM != null && now - st.lastCoordsAt < 120_000) {
        distM = st.lastDistM;
      } else {
        return;
      }
    } else {
      const raw = getDistanceInMeters(
        position.latitude,
        position.longitude,
        target.latitude,
        target.longitude,
      );
      const pushed = pushDistanceSample(st.buf, raw, {
        previousMedianForSpikeCheck: st.prev,
      });
      st.buf = pushed.buffer;
      st.prev = pushed.median;
      if (pushed.rejectedSpike) {
        if (__DEV__) {
          console.log('[AutoCheckout] GPS spike ignored');
        }
        return;
      }
      distM = pushed.median;
      st.zoneHistory = [...st.zoneHistory, pushed.zone].slice(-5);
      st.lastDistM = distM;
      st.lastCoordsAt = now;
    }
  }

  if (distM == null) {
    return;
  }

  const awayIso =
    st.clientAwayStartedAt ?? row.away_started_at ?? null;
  const decision = decideGeofenceAutoCheckout(distM, awayIso, now);

  useCheckInUIStore
    .getState()
    .setShowAwayZoneWarning(shouldShowAwayZoneWarning(decision, distM));

  if (__DEV__) {
    console.log('[AutoCheckout]', {
      distM: Math.round(distM),
      action: decision.action,
      awayIso: st.clientAwayStartedAt ?? row.away_started_at,
    });
  }

  switch (decision.action) {
    case 'clear_away':
      st.clientAwayStartedAt = null;
      try {
        await patchCheckInAwayState(row.id, userId, {
          away_started_at: null,
          last_distance_meters: Math.round(distM),
        });
        await updateCheckInLastSeenAt(row.id, userId, new Date());
      } catch {
        /* ignore */
      }
      return;

    case 'set_away':
      st.clientAwayStartedAt = decision.awayStartedAt;
      try {
        await patchCheckInAwayState(row.id, userId, {
          away_started_at: decision.awayStartedAt,
          last_distance_meters: decision.lastDistance,
        });
        await updateCheckInLastSeenAt(row.id, userId, new Date());
      } catch {
        /* ignore */
      }
      return;

    case 'update_distance_only':
      st.clientAwayStartedAt = decision.awayStartedUnchanged;
      try {
        await patchCheckInAwayState(row.id, userId, {
          away_started_at: decision.awayStartedUnchanged,
          last_distance_meters: decision.lastDistance,
        });
        await updateCheckInLastSeenAt(row.id, userId, new Date());
      } catch {
        /* ignore */
      }
      return;

    case 'checkout_away':
      await performAutoDistanceCheckout(row, userId, distM, st);
      return;

    case 'none':
    default:
      try {
        await updateCheckInLastSeenAt(row.id, userId, new Date());
      } catch {
        /* ignore */
      }
      return;
  }
}

async function performAutoDistanceCheckout(
  row: SupabaseCheckInRow,
  userId: string,
  distM: number,
  st: DistBufferState,
): Promise<void> {
  if (checkoutInFlight.has(row.id)) {
    return;
  }
  checkoutInFlight.add(row.id);
  useCheckInUIStore.getState().setShowAwayZoneWarning(false);

  const session = useSessionStore.getState().activeSession;
  const startedAt =
    session?.startTime?.toISOString() ?? row.started_at ?? new Date().toISOString();

  try {
    const completed = await completeWorkoutSession({
      reason: 'auto_distance',
      userId,
      sessionId: row.id,
    });

    const durationMinutes =
      completed?.durationMinutes ??
      Math.max(
        1,
        Math.floor((Date.now() - new Date(startedAt).getTime()) / (60 * 1000)),
      );

    useCheckInUIStore.getState().notifyImmediateAutoCheckoutReview({
      checkInId: row.id,
      userId,
      gymId: session?.gymId ?? String(row.gym_id),
      gymName: session?.gymName ?? row.gym_name,
      workoutType: session?.workoutType ?? row.workout_type ?? '',
      durationMinutes,
      startedAt,
    });

    if (__DEV__) {
      console.log('[AutoCheckout] completed', {checkInId: row.id, distM});
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[AutoCheckout] completeWorkoutSession failed', err);
    }
    const stillActive = await getActiveCheckInForUser(userId).catch(() => null);
    if (!stillActive?.id) {
      useSessionStore.getState().endSession();
      useCheckInUIStore.getState().setShowAwayZoneWarning(false);
    }
  } finally {
    st.clientAwayStartedAt = null;
    distBuffers.delete(row.id);
    checkoutInFlight.delete(row.id);
  }
}
