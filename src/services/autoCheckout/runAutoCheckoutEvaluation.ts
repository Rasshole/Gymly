/**
 * Auto-checkout: kun bekræftet afstand fra center (ikke inaktivitet, ikke app-genstart).
 */
import {Alert, type AppStateStatus} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {ACTIVE_CHECKIN_LOCATION_INTERVAL_MS} from '@/config/activeCheckinGeofenceConfig';
import {getGymLatLngForCheckIn} from '@/utils/gymCoordinatesForCheckIn';
import {getDistanceInMeters} from '@/utils/geoUtils';
import {
  classifyGeofenceZone,
  computeStableFlags,
  pushDistanceSample,
  type GeofenceZone,
} from '@/logic/activeCheckinGeofenceEngine';
import {
  getActiveCheckInForUser,
  patchCheckInAwayState,
  updateCheckInLastSeenAt,
} from '@/services/supabase/checkInService';
import {activeSessionFromSupabaseRow, useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {
  getAutoCheckoutDevDistanceOverride,
  getEffectiveAwayStartedAt,
} from '@/services/autoCheckout/autoCheckoutDevOverrides';
import {decideGeofenceAutoCheckout} from '@/services/autoCheckout/evaluateAutoCheckout';
import type {CheckInEndReason, SupabaseCheckInRow} from '@/types/checkIn.types';
import {finishWorkoutSession} from '@/services/session/finishWorkoutSession';
import {isDemoContentMode} from '@/demo/demoContentGate';

const GEO_OPTIONS = {enableHighAccuracy: true, timeout: 20000, maximumAge: 60000};

type GeolocationResponseLike = {coords: {latitude: number; longitude: number}};

type DistBufferState = {
  buf: number[];
  prev: number | null;
  zoneHistory: GeofenceZone[];
  /** Første gyldige GPS efter resume — ingen afstands-auto-checkout før dette. */
  locationConfirmed: boolean;
};

const distBuffers = new Map<string, DistBufferState>();
const geoWarned = new Set<string>();
function getBuf(checkInId: string): DistBufferState {
  let b = distBuffers.get(checkInId);
  if (!b) {
    b = {buf: [], prev: null, zoneHistory: [], locationConfirmed: false};
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

export function resetAutoCheckoutBuffersForTest(checkInId?: string): void {
  if (checkInId) {
    distBuffers.delete(checkInId);
    geoWarned.delete(checkInId);
    geoWarned.delete(`${checkInId}_geo_warn`);
  } else {
    distBuffers.clear();
    geoWarned.clear();
  }
}

export async function runAutoCheckoutEvaluation(params: {
  userId: string;
  appState: AppStateStatus;
}): Promise<void> {
  const {userId, appState} = params;
  const isForeground = appState === 'active';
  const now = Date.now();

  const row = await getActiveCheckInForUser(userId).catch(() => null);
  if (!row) {
    if (__DEV__) {
      console.log('[AutoCheckout] active session: none (DB empty)');
    }
    return;
  }

  if (__DEV__) {
    console.log('[AutoCheckout] session id:', row.id, 'foreground:', isForeground);
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

  if (!isForeground) {
    if (__DEV__) {
      console.log('[AutoCheckout] skip distance (app not foreground)');
    }
    return;
  }

  const awayForEval = getEffectiveAwayStartedAt(row.away_started_at ?? null, new Date(now));
  const target = getGymLatLngForCheckIn(String(row.gym_id));
  if (!target) {
    if (__DEV__) {
      console.warn(
        '[AutoCheckout] missing center lat/lng for gym_id=',
        row.gym_name,
        row.gym_id,
      );
    }
    return;
  }

  let distM: number | null = null;
  const devD = getAutoCheckoutDevDistanceOverride();
  if (devD != null) {
    distM = devD;
    const stDev = getBuf(row.id);
    stDev.locationConfirmed = true;
    stDev.zoneHistory = [
      ...stDev.zoneHistory,
      classifyGeofenceZone(devD),
    ].slice(-5);
  } else {
    const pos = await getPosition();
    if (!pos) {
      if (__DEV__) {
        console.log('[AutoCheckout] no GPS — session stays active');
      }
      return;
    }
    const raw = getDistanceInMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      target.latitude,
      target.longitude,
    );
    const st = getBuf(row.id);
    const {buffer, median, rejectedSpike} = pushDistanceSample(st.buf, raw, {
      previousMedianForSpikeCheck: st.prev,
    });
    st.buf = buffer;
    st.prev = median;
    if (rejectedSpike) {
      if (__DEV__) {
        console.log('[AutoCheckout] distance spike ignored');
      }
      return;
    }
    distM = median;
    const zone = classifyGeofenceZone(distM);
    st.zoneHistory = [...st.zoneHistory, zone].slice(-5);
    st.locationConfirmed = true;
  }

  const st = getBuf(row.id);
  if (!st.locationConfirmed && devD == null) {
    return;
  }

  const stable = computeStableFlags(st.zoneHistory);
  if (__DEV__) {
    console.log('[AutoCheckout] distance:', distM, 'm', 'stable:', stable);
    console.log('[AutoCheckout] away_started_at:', awayForEval);
  }

  if (stable.stableSafe) {
    useCheckInUIStore.getState().setShowAwayZoneWarning(false);
    if (awayForEval) {
      try {
        await patchCheckInAwayState(row.id, userId, {
          away_started_at: null,
          last_distance_meters: Math.round(distM!),
        });
      } catch {
        /* ignore */
      }
    }
    try {
      await updateCheckInLastSeenAt(row.id, userId, new Date());
    } catch {
      /* ignore */
    }
    return;
  }

  if (!awayForEval && !stable.stableBuffer && !stable.stableOutside) {
    try {
      await updateCheckInLastSeenAt(row.id, userId, new Date());
    } catch {
      /* ignore */
    }
    return;
  }

  const d = decideGeofenceAutoCheckout(distM!, awayForEval, now);

  if (d.action === 'clear_away') {
    useCheckInUIStore.getState().setShowAwayZoneWarning(false);
    try {
      await patchCheckInAwayState(row.id, userId, {
        away_started_at: null,
        last_distance_meters: distM!,
      });
    } catch {
      /* ignore */
    }
  } else if (d.action === 'set_away') {
    useCheckInUIStore.getState().setShowAwayZoneWarning(true);
    if (!geoWarned.has(`${row.id}_geo_warn`)) {
      geoWarned.add(`${row.id}_geo_warn`);
      if (!isDemoContentMode()) {
        Alert.alert(
          'Tjek ind',
          'Det ser ud til, at du har forladt centeret. Du bliver snart automatisk tjekket ud.',
          [{text: 'OK'}],
        );
      }
    }
    try {
      await patchCheckInAwayState(row.id, userId, {
        away_started_at: d.awayStartedAt,
        last_distance_meters: d.lastDistance,
      });
    } catch {
      /* ignore */
    }
  } else if (d.action === 'checkout_away') {
    if (!stable.stableOutside) {
      useCheckInUIStore.getState().setShowAwayZoneWarning(true);
      try {
        await patchCheckInAwayState(row.id, userId, {
          away_started_at: awayForEval ?? new Date(now).toISOString(),
          last_distance_meters: Math.round(distM!),
        });
      } catch {
        /* ignore */
      }
    } else {
      if (__DEV__) {
        console.log('[AutoCheckout] triggering reason: left_geofence');
      }
      await performAutoEnd(
        row,
        userId,
        'left_geofence',
        'Du var væk fra centeret længe nok (auto-udtjek).',
      );
      return;
    }
  } else if (d.action === 'update_distance_only') {
    useCheckInUIStore.getState().setShowAwayZoneWarning(true);
    try {
      await patchCheckInAwayState(row.id, userId, {
        away_started_at: d.awayStartedUnchanged,
        last_distance_meters: d.lastDistance,
      });
    } catch {
      /* ignore */
    }
  } else if (d.action === 'none') {
    if (d.lastDistance > 400) {
      useCheckInUIStore.getState().setShowAwayZoneWarning(true);
    } else {
      useCheckInUIStore.getState().setShowAwayZoneWarning(false);
    }
  }

  try {
    await updateCheckInLastSeenAt(row.id, userId, new Date());
  } catch {
    /* ignore */
  }
}

async function performAutoEnd(
  row: SupabaseCheckInRow,
  userId: string,
  reason: CheckInEndReason,
  body: string,
) {
  geoWarned.add(row.id);
  await finishWorkoutSession({
    reason: 'auto',
    userId,
    checkInId: row.id,
    endReason: reason,
    autoCheckoutReason: reason === 'left_geofence' ? reason : undefined,
  });
  if (__DEV__) {
    console.log('[AutoCheckout] reason:', reason);
  }
  Alert.alert('Du blev automatisk tjekket ud', body, [{text: 'OK'}]);
}
