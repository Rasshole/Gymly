/**
 * Køres ved app start, resume, location-tick, aktiv skærm — ikke kun én fane.
 * Rækkefølge: inaktivitet FØR opdatering af last_seen; afstand når GPS OK.
 */
import {Alert, type AppStateStatus} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import {
  ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS,
  ACTIVE_CHECKIN_INACTIVITY_WARN_BEFORE_MS,
} from '@/config/activeCheckinGeofenceConfig';
import {ACTIVE_CHECKIN_LOCATION_INTERVAL_MS} from '@/config/activeCheckinGeofenceConfig';
import {getGymLatLngForCheckIn} from '@/utils/gymCoordinatesForCheckIn';
import {getDistanceInMeters} from '@/utils/geoUtils';
import {pushDistanceSample} from '@/logic/activeCheckinGeofenceEngine';
import {
  endActiveCheckInInSupabase,
  getActiveCheckInForUser,
  getLatestAutoCheckoutEventForUser,
  patchCheckInAwayState,
  updateCheckInLastSeenAt,
} from '@/services/supabase/checkInService';
import {deleteMyLiveWorkoutSession} from '@/services/supabase/liveWorkoutSessionService';
import {activeSessionFromSupabaseRow, useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {
  applyLastSeenInactivityOverride,
  getAutoCheckoutDevDistanceOverride,
  getEffectiveAwayStartedAt,
} from '@/services/autoCheckout/autoCheckoutDevOverrides';
import {
  decideGeofenceAutoCheckout,
  shouldForceCheckoutInactivity,
} from '@/services/autoCheckout/evaluateAutoCheckout';
import type {CheckInEndReason, SupabaseCheckInRow} from '@/types/checkIn.types';

const GEO_OPTIONS = {enableHighAccuracy: true, timeout: 20000, maximumAge: 60000};

const distBuffers = new Map<
  string,
  {buf: number[]; prev: number | null}
>();
const inactivityWarned = new Set<string>();
const inactivityPrewarned = new Set<string>();
const autoCheckoutToastChecked = new Set<string>();
const AUTO_CHECKOUT_SEEN_KEY_PREFIX = '@gymly/auto_checkout_seen/';

function getBuf(checkInId: string) {
  let b = distBuffers.get(checkInId);
  if (!b) {
    b = {buf: [], prev: null};
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

type GeolocationResponseLike = {coords: {latitude: number; longitude: number}};

export {ACTIVE_CHECKIN_LOCATION_INTERVAL_MS as AUTO_CHECKOUT_INTERVAL_MS};

export function resetAutoCheckoutBuffersForTest(checkInId?: string): void {
  if (checkInId) {
    distBuffers.delete(checkInId);
    inactivityWarned.delete(checkInId);
    inactivityPrewarned.delete(checkInId);
  } else {
    distBuffers.clear();
    inactivityWarned.clear();
    inactivityPrewarned.clear();
  }
}

/**
 * Fuld evaluering: DB → inaktivitet → (foreground) afstand/away state → last_seen.
 */
export async function runAutoCheckoutEvaluation(params: {
  userId: string;
  appState: AppStateStatus;
}): Promise<void> {
  const {userId, appState} = params;
  const isForeground = appState === 'active';
  const now = Date.now();

  const row = await getActiveCheckInForUser(userId).catch(() => null);
  if (!row) {
    if (useSessionStore.getState().activeSession?.checkInId) {
      useSessionStore.getState().endSession();
    }
    useCheckInUIStore.getState().setShowAwayZoneWarning(false);
    if (__DEV__) {
      console.log('[AutoCheckout] active session: none (DB empty)');
    }
    if (isForeground) {
      await maybeNotifyLastAutoCheckout(userId);
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

  const lastSeenForEval = applyLastSeenInactivityOverride(
    row.last_seen_at ?? null,
    row.started_at,
  );
  const awayForEval = getEffectiveAwayStartedAt(row.away_started_at ?? null, new Date(now));

  const lastMs = new Date(
    (lastSeenForEval && lastSeenForEval.length > 0
      ? lastSeenForEval
      : row.started_at) as string,
  ).getTime();
  const inactivityMinutes = (now - lastMs) / 60_000;
  if (__DEV__) {
    console.log(
      '[AutoCheckout] inactivityMinutes:',
      inactivityMinutes.toFixed(1),
      'last_seen (eval):',
      lastSeenForEval || row.started_at,
    );
  }

  if (shouldForceCheckoutInactivity(lastSeenForEval, row.started_at, now)) {
    if (__DEV__) {
      console.log('[AutoCheckout] triggering reason: inactivity');
    }
    await performAutoEnd(
      row,
      userId,
      'inactivity',
      'Din session udløb pga. inaktivitet.',
    );
    return;
  }

  if (isForeground) {
    const el = now - lastMs;
    const warnFrom =
      ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS - ACTIVE_CHECKIN_INACTIVITY_WARN_BEFORE_MS;
    if (
      el > warnFrom &&
      el < ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS &&
      !inactivityPrewarned.has(row.id) &&
      !inactivityWarned.has(row.id)
    ) {
      inactivityPrewarned.add(row.id);
      Alert.alert(
        'Tjek ind',
        'Din session afsluttes snart pga. inaktivitet.',
        [{text: 'OK'}],
      );
    }
  }

  if (!isForeground) {
    if (__DEV__) {
      console.log('[AutoCheckout] skip distance + last_seen (app not foreground)');
    }
    return;
  }

  const target = getGymLatLngForCheckIn(String(row.gym_id));
  if (!target) {
    if (__DEV__) {
      console.warn(
        '[AutoCheckout] missing center lat/lng for gym_id=',
        row.gym_name,
        row.gym_id,
      );
    }
    try {
      await updateCheckInLastSeenAt(row.id, userId, new Date());
    } catch {
      /* ignore */
    }
    return;
  }

  let distM: number | null = null;
  const devD = getAutoCheckoutDevDistanceOverride();
  if (devD != null) {
    distM = devD;
  } else {
    const pos = await getPosition();
    if (!pos) {
      if (__DEV__) {
        console.log('[AutoCheckout] no GPS position; distance check skipped, inactivity still OK');
      }
      try {
        await updateCheckInLastSeenAt(row.id, userId, new Date());
      } catch {
        /* ignore */
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
        console.log('[AutoCheckout] distance spike ignored; raw was', raw, 'median', median);
      }
      try {
        await updateCheckInLastSeenAt(row.id, userId, new Date());
      } catch {
        /* ignore */
      }
      return;
    }
    distM = median;
  }

  if (__DEV__) {
    console.log('[AutoCheckout] distance:', distM, 'm');
    console.log('[AutoCheckout] away_started_at:', awayForEval);
  }

  const d = decideGeofenceAutoCheckout(
    distM!,
    awayForEval,
    now,
  );

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
    if (!inactivityWarned.has(`${row.id}_geo_warn`)) {
      inactivityWarned.add(`${row.id}_geo_warn`);
      Alert.alert(
        'Tjek ind',
        'Det ser ud til, at du har forladt centeret. Du bliver snart automatisk tjekket ud.',
        [{text: 'OK'}],
      );
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
  inactivityWarned.add(row.id);
  if (row.id) {
    inactivityPrewarned.delete(row.id);
  }
  const auto =
    reason === 'inactivity' ? 'inactivity' : reason === 'left_geofence' ? 'left_geofence' : null;
  try {
    await endActiveCheckInInSupabase(
      row.id,
      userId,
      reason,
      auto
        ? {autoCheckoutReason: auto as 'inactivity' | 'left_geofence'}
        : undefined,
    );
  } catch (e) {
    if (__DEV__) {
      console.warn('[AutoCheckout] end failed', e);
    }
    return;
  }
  try {
    await deleteMyLiveWorkoutSession(userId);
  } catch {
    /* ignore */
  }
  useSessionStore.getState().endSession();
  useCheckInUIStore.getState().setShowAwayZoneWarning(false);
  const title = 'Du blev automatisk tjekket ud';
  if (__DEV__) {
    console.log('[AutoCheckout] reason:', reason);
    console.log('[AutoCheckout] checked out:', true);
  }
  Alert.alert(title, body, [{text: 'OK'}]);
}

async function maybeNotifyLastAutoCheckout(userId: string): Promise<void> {
  if (autoCheckoutToastChecked.has(userId)) {
    return;
  }
  autoCheckoutToastChecked.add(userId);
  const latest = await getLatestAutoCheckoutEventForUser(userId).catch(() => null);
  if (!latest) {
    return;
  }
  const key = `${AUTO_CHECKOUT_SEEN_KEY_PREFIX}${userId}`;
  const seen = await AsyncStorage.getItem(key).catch(() => null);
  if (seen === latest.endedAt) {
    return;
  }
  await AsyncStorage.setItem(key, latest.endedAt).catch(() => {});
  Alert.alert(
    'Du blev automatisk tjekket ud',
    latest.reason === 'inactivity'
      ? 'Din session blev afsluttet efter længere tids inaktivitet.'
      : 'Din session blev afsluttet, fordi du var væk fra centeret for længe.',
    [{text: 'OK'}],
  );
}
