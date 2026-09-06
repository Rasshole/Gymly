/**
 * Completed workout detail — read-only view of a past check-in + workout log.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import {useAppStore} from '@/store/appStore';
import {
  fetchCompletedWorkoutDetail,
  type CompletedWorkoutDetail,
} from '@/services/supabase/workoutHistoryService';
import {fetchSessionPersonalRecordSetIds} from '@/services/supabase/personalRecordService';
import {formatSessionDateAndDurationDa} from '@/services/supabase/profileCheckInHistory';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {
  formatReps,
  formatVolumeKg,
  formatWeightKg,
} from '@/utils/workoutLogFormat';
import {formatLastSetLine} from '@/utils/workoutLogHistory';
import type {WorkoutSet, WorkoutTrackingType} from '@/types/workoutLog.types';
import type {MainStackParamList} from '@/navigation/MainNavigator';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useTranslation, getExerciseDisplayName} from '@/i18n';

export type WorkoutHistoryDetailParams = {
  WorkoutHistoryDetail: {sessionId: string};
};

function formatSetPrimary(
  set: WorkoutSet,
  trackingType: WorkoutTrackingType,
): {left: string; right: string} {
  if (trackingType === 'weight_reps') {
    return {
      left: formatWeightKg(set.weightKg),
      right: formatReps(set.reps),
    };
  }
  if (trackingType === 'reps_only') {
    return {left: formatReps(set.reps), right: ''};
  }
  const line = formatLastSetLine(
    {
      setNumber: set.setNumber,
      weightKg: set.weightKg,
      reps: set.reps,
      durationSeconds: set.durationSeconds,
      distanceMeters: set.distanceMeters,
    },
    trackingType,
  );
  return {left: line, right: ''};
}

const WorkoutHistoryDetailScreen: React.FC = () => {
  const {t, language} = useTranslation();
  const navigation =
    useNavigation<StackNavigationProp<MainStackParamList>>();
  const route =
    useRoute<RouteProp<WorkoutHistoryDetailParams, 'WorkoutHistoryDetail'>>();
  const insets = useSafeAreaInsets();
  const userId = useAppStore(s => s.user?.id);
  const sessionId = route.params?.sessionId;

  const [detail, setDetail] = useState<CompletedWorkoutDetail | null>(null);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !sessionId) {
      setError(t('workoutHistory.missingSession'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, prIds] = await Promise.all([
        fetchCompletedWorkoutDetail(sessionId, userId),
        fetchSessionPersonalRecordSetIds(userId, sessionId),
      ]);
      setDetail(data);
      setPrSetIds(prIds);
    } catch (e: any) {
      setDetail(null);
      setError(e?.message ?? t('workoutHistory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [userId, sessionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      <ScreenHeader
        title={t('workoutHistory.detailTitle')}
        onBack={() => navigation.goBack()}
      />

      {loading && !detail ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error && !detail ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>{t('workoutHistory.loadFailed')}</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : detail ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={colors.primary}
            />
          }>
          <Text style={styles.gymName}>{detail.session.gymName}</Text>
          <Text style={styles.metaLine}>
            {formatSessionDateAndDurationDa(
              detail.session.startedAt,
              detail.session.durationMinutes,
            )}
          </Text>
          {detail.session.workoutType ? (
            <Text style={styles.typeLine}>
              {formatWorkoutTypeDisplay(detail.session.workoutType)}
            </Text>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{detail.summary.exerciseCount}</Text>
              <Text style={styles.statLabel}>{t('workoutLog.exercises')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{detail.summary.setCount}</Text>
              <Text style={styles.statLabel}>{t('workoutLog.sets')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text
                style={styles.statValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}>
                {formatVolumeKg(detail.summary.totalVolumeKg)}
              </Text>
              <Text style={styles.statLabel}>{t('workoutLog.volume')}</Text>
            </View>
          </View>

          <View style={styles.shareWrap}>
            <SocialPrimaryButton
              label={t('workoutHistory.shareWorkout')}
              onPress={() =>
                navigation.navigate('ShareWorkout', {
                  sessionId: detail.session.id,
                })
              }
              variant="premium"
            />
          </View>

          {detail.exercises.length === 0 ? (
            <View style={styles.emptyLog}>
              <Text style={styles.emptyLogTitle}>
                {t('workoutHistory.noExercisesLogged')}
              </Text>
            </View>
          ) : (
            detail.exercises.map(ex => (
              <View key={ex.id} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <Text style={styles.exerciseName} numberOfLines={2}>
                    {getExerciseDisplayName({
                      exerciseId: ex.exerciseId ?? null,
                      fallbackName: ex.exerciseName,
                      language,
                    })}
                  </Text>
                  <Text style={styles.exerciseMeta}>
                    {t('workoutLog.setsLogged', {count: ex.sets.length})}
                  </Text>
                </View>
                {ex.sets.map((set: WorkoutSet) => {
                  const vals = formatSetPrimary(set, ex.trackingType);
                  const isPr = prSetIds.has(set.id);
                  return (
                    <View key={set.id} style={styles.setRow}>
                      <Text style={styles.setNum}>
                        {t('workoutLog.setN', {n: set.setNumber})}
                      </Text>
                      <Text style={styles.setVal}>{vals.left}</Text>
                      {vals.right ? (
                        <Text style={styles.setVal}>{vals.right}</Text>
                      ) : (
                        <View style={{flex: 1}} />
                      )}
                      {isPr ? <Text style={styles.prMark}>🏆</Text> : null}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  gymName: {
    ...typography.h4,
    color: colors.text,
    marginBottom: 4,
  },
  metaLine: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  typeLine: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  shareWrap: {
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  statValue: {
    ...typography.h4,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },
  exerciseCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  exerciseHeader: {
    marginBottom: spacing.sm,
  },
  exerciseName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 18,
  },
  exerciseMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginBottom: 6,
  },
  setNum: {
    width: 64,
    ...typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  setVal: {
    flex: 1,
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  prMark: {
    width: 28,
    textAlign: 'right',
    fontSize: 16,
  },
  emptyLog: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyLogTitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  errorSub: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  retryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
});

export default WorkoutHistoryDetailScreen;
