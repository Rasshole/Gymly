import React, {useCallback, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {isSmartCheckInQaSurfaceEnabled} from '@/config/smartCheckInSurface';
import {getActiveGyms} from '@/data/gymCatalog';
import {useTranslation} from '@/i18n';
import {useAuth} from '@/hooks/useAuth';
import {
  getLocationPermissionStatus,
  isLocationAuthorized,
  requestLocationPermissionIfNeeded,
} from '@/services/location/locationPermission';
import {dismissSmartCheckInGyms, readSmartCheckInCooldowns} from '@/services/smartCheckIn/smartCheckInCooldown';
import {readFreshLocationIfAllowed, readOneLocationFix} from '@/services/smartCheckIn/readFreshLocation';
import {
  isFreshPreciseLocation,
  visibleSmartCheckInGyms,
  type SmartGymHit,
} from '@/services/smartCheckIn/smartCheckInRules';
import {startSmartCheckIn} from '@/services/smartCheckIn/startSmartCheckIn';
import {getActiveCheckInForUser} from '@/services/supabase/checkInService';
import {CHECK_IN_RADIUS_METERS} from '@/config/dataConfig';
import {calculateDistance} from '@/utils/geoUtils';
import {firstUsableDisplayName, getNeutralDisplayNameFallback} from '@/utils/displayName';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useSessionStore} from '@/store/sessionStore';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

type ErrorCode = 'location' | 'too_far' | 'failed';

export default function SmartCheckInHomeCard() {
  const {t} = useTranslation();
  const user = useAuth();
  const activeSession = useSessionStore(s => s.activeSession);
  const startSession = useSessionStore(s => s.startSession);
  const [hits, setHits] = useState<SmartGymHit[]>([]);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingGymId, setPendingGymId] = useState<string | null>(null);
  const refreshGen = useRef(0);

  const refresh = useCallback(async () => {
    if (!isSmartCheckInQaSurfaceEnabled() || !user?.id || busy) {
      return;
    }
    const gen = ++refreshGen.current;
    const stillCurrent = () => gen === refreshGen.current;
    if (useSessionStore.getState().activeSession) {
      if (stillCurrent()) {
        setHits([]);
      }
      return;
    }
    const serverActive = await getActiveCheckInForUser(user.id).catch(() => null);
    if (!stillCurrent()) {
      return;
    }
    if (serverActive?.id) {
      setHits([]);
      return;
    }
    const sample = await readFreshLocationIfAllowed();
    if (!stillCurrent()) {
      return;
    }
    if (!sample) {
      setHits([]);
      return;
    }
    const cooldowns = await readSmartCheckInCooldowns(user.id);
    if (!stillCurrent()) {
      return;
    }
    const gyms = getActiveGyms().map(gym => ({
      id: gym.id,
      name: formatGymDisplayName(gym),
      city: gym.city,
      latitude: gym.latitude,
      longitude: gym.longitude,
    }));
    setHits(
      visibleSmartCheckInGyms({
        sample,
        gyms,
        nowMs: Date.now(),
        cooldownUntilByGymId: cooldowns,
        hasActiveSession: false,
      }),
    );
  }, [busy, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!error) {
        void refresh();
      }
      return () => {
        refreshGen.current += 1;
      };
    }, [error, refresh]),
  );

  if (!isSmartCheckInQaSurfaceEnabled() || activeSession || (hits.length === 0 && !error)) {
    return null;
  }

  const dismiss = async () => {
    if (!user?.id) {
      return;
    }
    const ids = pendingGymId ? [pendingGymId] : hits.map(hit => hit.gym.id);
    await dismissSmartCheckInGyms(user.id, ids);
    setHits([]);
    setError(null);
    setPendingGymId(null);
  };

  const checkIn = async (hit: SmartGymHit) => {
    if (!user?.id || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setPendingGymId(hit.gym.id);
    try {
      const permission = await getLocationPermissionStatus();
      let sample = isLocationAuthorized(permission) ? await readOneLocationFix() : null;
      if (!sample && !isLocationAuthorized(permission)) {
        await requestLocationPermissionIfNeeded();
        sample = await readOneLocationFix();
      }
      if (!sample || !isFreshPreciseLocation(sample, Date.now())) {
        setError('location');
        return;
      }
      const distance = calculateDistance(
        sample.latitude,
        sample.longitude,
        hit.gym.latitude,
        hit.gym.longitude,
      );
      if (distance > CHECK_IN_RADIUS_METERS) {
        setError('too_far');
        return;
      }
      const result = await startSmartCheckIn({
        userId: user.id,
        gymId: hit.gym.id,
        gymName: hit.gym.name,
        city: hit.gym.city,
        displayName:
          firstUsableDisplayName(user.displayName, user.username) ??
          getNeutralDisplayNameFallback(),
      });
      if (!result.ok) {
        setError('failed');
        return;
      }
      if (result.created) {
        useDashboardStatsStore.getState().onCheckIn();
      }
      startSession({
        checkInId: result.session.id,
        gymId: result.session.gymId,
        gymName: result.session.gymName,
        city: result.session.city,
        startTime: result.session.startedAt,
        workoutType: result.session.workoutType,
      });
      setHits([]);
      setError(null);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    const hit = hits.find(item => item.gym.id === pendingGymId) ?? hits[0];
    if (hit) {
      void checkIn(hit);
    }
  };

  const single = hits.length === 1 ? hits[0] : null;

  return (
    <View style={styles.wrap} testID="smart-check-in-card">
      <Text style={styles.title}>
        {error
          ? error === 'too_far'
            ? t('smartCheckIn.tooFar')
            : error === 'location'
              ? t('smartCheckIn.locationRejected')
              : t('smartCheckIn.failed')
          : single
            ? t('smartCheckIn.atGym', {gym: single.gym.name})
            : t('smartCheckIn.chooseGym')}
      </Text>
      {!error && !single ? <Text style={styles.sub}>{t('smartCheckIn.chooseGymSub')}</Text> : null}
      {!error && !single
        ? hits.map(hit => (
            <Pressable
              key={hit.gym.id}
              testID={`smart-check-in-gym-${hit.gym.id}`}
              style={({pressed}) => [styles.choice, pressed && styles.pressed]}
              disabled={busy}
              onPress={() => checkIn(hit)}>
              <Text style={styles.choiceText}>{hit.gym.name}</Text>
            </Pressable>
          ))
        : null}
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {!busy && error ? (
        <Pressable
          testID="smart-check-in-retry"
          style={({pressed}) => [styles.primary, pressed && styles.pressed]}
          onPress={retry}>
          <Text style={styles.primaryText}>{t('smartCheckIn.retry')}</Text>
        </Pressable>
      ) : null}
      {!busy && !error && single ? (
        <Pressable
          testID="smart-check-in-confirm"
          style={({pressed}) => [styles.primary, pressed && styles.pressed]}
          onPress={() => checkIn(single)}>
          <Text style={styles.primaryText}>{t('smartCheckIn.checkIn')}</Text>
        </Pressable>
      ) : null}
      {!busy ? (
        <Pressable testID="smart-check-in-dismiss" onPress={() => void dismiss()} disabled={busy}>
          <Text style={styles.dismiss}>{t('smartCheckIn.notNow')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    gap: spacing.sm,
  },
  title: {
    ...typography.h4,
    color: colors.text,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  choice: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceLight,
  },
  choiceText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  dismiss: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
  },
});
