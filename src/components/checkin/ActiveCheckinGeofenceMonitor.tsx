/**
 * Kører kun for Supabase-tjek. Geofence + inaktivitet — ikke ved baggrund/lås alene.
 * Ingen tjek-ud uden: manuelt, 4t inaktiv, eller bære grace i buffer/ud zone.
 */
import React, {useCallback, useEffect, useLayoutEffect, useRef} from 'react';
import {AppState, Alert, type AppStateStatus} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {useAppStore} from '@/store/appStore';
import {useSessionStore} from '@/store/sessionStore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {
  ACTIVE_CHECKIN_BUFFER_GRACE_MS,
  ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS,
  ACTIVE_CHECKIN_INACTIVITY_WARN_BEFORE_MS,
  ACTIVE_CHECKIN_LOCATION_INTERVAL_MS,
  ACTIVE_CHECKIN_OUTSIDE_GRACE_MS,
} from '@/config/activeCheckinGeofenceConfig';
import {getGymLatLngForCheckIn} from '@/utils/gymCoordinatesForCheckIn';
import {getDistanceInMeters} from '@/utils/geoUtils';
import {
  clearCheckInGeofenceGrace,
  endActiveCheckInInSupabase,
  getActiveCheckInForUser,
  setCheckInGeofenceGrace,
  updateCheckInLastSeenAt,
} from '@/services/supabase/checkInService';
import {deleteMyLiveWorkoutSession} from '@/services/supabase/liveWorkoutSessionService';
import type {CheckInEndReason, SupabaseCheckInRow} from '@/types/checkIn.types';
import {
  type GeofenceZone,
  computeStableFlags,
  pushDistanceSample,
} from '@/logic/activeCheckinGeofenceEngine';

const GEO_OPTIONS = {enableHighAccuracy: true, timeout: 20000, maximumAge: 60000};

function getPosition(): Promise<GeolocationResponseLike | null> {
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve(pos),
      () => resolve(null),
      GEO_OPTIONS,
    );
  });
}

type GeolocationResponseLike = {coords: {latitude: number; longitude: number}};

function inactivityMessage(reason: 'inactivity' | 'geofence') {
  if (reason === 'inactivity') {
    return {
      body: 'Din session udløb pga. inaktivitet.',
    };
  }
  return {body: 'Du var væk fra centeret.'};
}

const ActiveCheckinGeofenceMonitor: React.FC = () => {
  const {user} = useAppStore();
  const {activeSession, endSession} = useSessionStore();
  const checkInId = activeSession?.checkInId;

  const distBufRef = useRef<number[]>([]);
  const zoneHistRef = useRef<GeofenceZone[]>([]);
  const prevMedRef = useRef<number | null>(null);
  const warnedInactivityRef = useRef(false);
  const warnedGeofenceRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useLayoutEffect(() => {
    distBufRef.current = [];
    zoneHistRef.current = [];
    prevMedRef.current = null;
    warnedInactivityRef.current = false;
    warnedGeofenceRef.current = false;
  }, [checkInId]);

  const runAutoEnd = useCallback(
    async (reason: CheckInEndReason, title: string, body: string) => {
      if (!user?.id || !checkInId) {
        return;
      }
      try {
        await endActiveCheckInInSupabase(checkInId, user.id, reason);
      } catch (e) {
        if (__DEV__) {
          console.warn('[GeofenceMonitor] auto end check_in', e);
        }
        return;
      }
      try {
        await deleteMyLiveWorkoutSession(user.id);
      } catch {
        /* ignore */
      }
      endSession();
      Alert.alert(title, body, [{text: 'OK'}]);
    },
    [checkInId, endSession, user?.id],
  );

  const tick = useCallback(async () => {
    if (isFirebaseNativeAvailable() || !user?.id || !checkInId) {
      return;
    }
    if (appStateRef.current !== 'active') {
      return;
    }

    let row: SupabaseCheckInRow;
    try {
      const r = await getActiveCheckInForUser(user.id);
      if (!r) {
        endSession();
        return;
      }
      row = r;
    } catch (e) {
      if (__DEV__) {
        console.warn('[GeofenceMonitor] fetch active', e);
      }
      return;
    }

    if (row.id !== checkInId) {
      return;
    }

    const nowMs = Date.now();
    if (row.last_seen_at) {
      const lastMs = new Date(row.last_seen_at).getTime();
      const elapsed = nowMs - lastMs;
      if (elapsed > ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS) {
        const {body} = inactivityMessage('inactivity');
        await runAutoEnd('inactivity', 'Du blev automatisk tjekket ud', body);
        return;
      }
      if (
        !warnedInactivityRef.current &&
        elapsed > ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS - ACTIVE_CHECKIN_INACTIVITY_WARN_BEFORE_MS &&
        elapsed < ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS
      ) {
        warnedInactivityRef.current = true;
        Alert.alert(
          'Tjek ind',
          'Din session afsluttes snart pga. inaktivitet.',
          [{text: 'OK'}],
        );
      }
    }

    try {
      await updateCheckInLastSeenAt(row.id, user.id, new Date());
    } catch {
      /* ignore */
    }

    const target = getGymLatLngForCheckIn(String(row.gym_id));
    if (!target) {
      return;
    }

    const pos = await getPosition();
    if (!pos) {
      return;
    }
    const raw = getDistanceInMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      target.latitude,
      target.longitude,
    );

    const {buffer, median, zone, rejectedSpike} = pushDistanceSample(
      distBufRef.current,
      raw,
      {previousMedianForSpikeCheck: prevMedRef.current},
    );
    distBufRef.current = buffer;
    prevMedRef.current = median;

    if (rejectedSpike) {
      return;
    }

    if (zone === 1) {
      zoneHistRef.current = [];
      warnedGeofenceRef.current = false;
      if (row.geofence_grace_started_at) {
        try {
          await clearCheckInGeofenceGrace(row.id, user.id);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const zh = [...zoneHistRef.current, zone].slice(-5);
    zoneHistRef.current = zh;
    const stable = computeStableFlags(zh);
    if (!stable.stableBuffer && !stable.stableOutside) {
      return;
    }

    const reloaded = await getActiveCheckInForUser(user.id);
    if (!reloaded) {
      endSession();
      return;
    }
    if (reloaded.id !== checkInId) {
      return;
    }

    const gStart = reloaded.geofence_grace_started_at
      ? new Date(reloaded.geofence_grace_started_at).getTime()
      : 0;
    const gKind = reloaded.geofence_grace_kind;

    if (stable.stableOutside) {
      if (gKind !== 'outside' || !reloaded.geofence_grace_started_at) {
        try {
          await setCheckInGeofenceGrace(reloaded.id, user.id, 'outside', new Date());
        } catch {
          return;
        }
        if (!warnedGeofenceRef.current) {
          warnedGeofenceRef.current = true;
          Alert.alert(
            'Tjek ind',
            'Det ser ud til, at du har forladt centeret. Du bliver snart automatisk tjekket ud.',
            [{text: 'OK'}],
          );
        }
        return;
      }
      if (gKind === 'outside' && nowMs - gStart >= ACTIVE_CHECKIN_OUTSIDE_GRACE_MS) {
        const {body} = inactivityMessage('geofence');
        await runAutoEnd('geofence_outside', 'Du blev automatisk tjekket ud', body);
      }
      return;
    }

    if (stable.stableBuffer) {
      if (gKind === 'buffer') {
        if (gStart > 0 && nowMs - gStart >= ACTIVE_CHECKIN_BUFFER_GRACE_MS) {
          const {body} = inactivityMessage('geofence');
          await runAutoEnd('geofence_buffer', 'Du blev automatisk tjekket ud', body);
        }
        return;
      }
      if (gKind === 'outside') {
        try {
          await setCheckInGeofenceGrace(reloaded.id, user.id, 'buffer', new Date());
        } catch {
          return;
        }
        if (!warnedGeofenceRef.current) {
          warnedGeofenceRef.current = true;
          Alert.alert(
            'Tjek ind',
            'Det ser ud til, at du har forladt centeret. Du bliver snart automatisk tjekket ud.',
            [{text: 'OK'}],
          );
        }
        return;
      }
      if (gKind == null) {
        try {
          await setCheckInGeofenceGrace(reloaded.id, user.id, 'buffer', new Date());
        } catch {
          return;
        }
        if (!warnedGeofenceRef.current) {
          warnedGeofenceRef.current = true;
          Alert.alert(
            'Tjek ind',
            'Det ser ud til, at du har forladt centeret. Du bliver snart automatisk tjekket ud.',
            [{text: 'OK'}],
          );
        }
      }
    }
  }, [checkInId, endSession, runAutoEnd, user?.id]);

  useEffect(() => {
    if (isFirebaseNativeAvailable() || !user?.id) {
      return;
    }
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === 'active' && prev !== 'active' && checkInId) {
        void (async () => {
          try {
            await updateCheckInLastSeenAt(checkInId, user.id!);
          } catch {
            /* ignore */
          }
          void tick();
        })();
      }
    });
    return () => sub.remove();
  }, [checkInId, tick, user?.id]);

  useEffect(() => {
    if (isFirebaseNativeAvailable() || !user?.id || !checkInId) {
      return;
    }
    const id = setInterval(() => {
      void tick();
    }, ACTIVE_CHECKIN_LOCATION_INTERVAL_MS);
    void tick();
    return () => clearInterval(id);
  }, [checkInId, tick, user?.id]);

  return null;
};

export default ActiveCheckinGeofenceMonitor;
