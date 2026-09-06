/**
 * Personal record detail for one exercise — reuses workout set history.
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {useAppStore} from '@/store/appStore';
import {getExerciseHistory} from '@/services/supabase/workoutLogService';
import {fetchExercisePrBaseline} from '@/services/supabase/personalRecordService';
import type {ExerciseHistorySession} from '@/types/workoutLog.types';
import type {ExercisePrBaseline} from '@/types/personalRecord.types';
import {formatLastSetLine} from '@/utils/workoutLogHistory';
import {formatPrLiftLine, formatPrTypeLabel} from '@/utils/personalRecordCopy';
import {weightKey} from '@/utils/personalRecordEngine';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useTranslation, useAppFormat, getRuntimeLanguage, getExerciseDisplayName} from '@/i18n';

export type ExercisePrDetailParams = {
  ExercisePrDetail: {
    exerciseName: string;
    exerciseId?: string | null;
  };
};

const ExercisePrDetailScreen: React.FC = () => {
  const {t, language} = useTranslation();
  const {intlLocale} = useAppFormat();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ExercisePrDetailParams, 'ExercisePrDetail'>>();
  const insets = useSafeAreaInsets();
  const userId = useAppStore(s => s.user?.id);
  const lang = getRuntimeLanguage();
  const exerciseName = route.params.exerciseName;
  const exerciseId = route.params.exerciseId ?? null;
  const displayName = getExerciseDisplayName({
    exerciseId,
    fallbackName: exerciseName,
    language,
  });

  const [history, setHistory] = useState<ExerciseHistorySession[]>([]);
  const [baseline, setBaseline] = useState<ExercisePrBaseline | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [hist, base] = await Promise.all([
        getExerciseHistory(userId, exerciseName, {exerciseId, limit: 20}),
        fetchExercisePrBaseline(userId, exerciseName, {exerciseId}),
      ]);
      setHistory(hist);
      setBaseline(base);
    } finally {
      setLoading(false);
    }
  }, [userId, exerciseName, exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const weightPrLine = useMemo(() => {
    if (!baseline?.maxWeightKg) {
      return null;
    }
    const reps = baseline.repsByWeight[weightKey(baseline.maxWeightKg)];
    if (reps == null) {
      return formatPrLiftLine(baseline.maxWeightKg, 0).replace(' × 0', '');
    }
    return formatPrLiftLine(baseline.maxWeightKg, reps);
  }, [baseline]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale, {
      day: 'numeric',
      month: 'short',
    });

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      <ScreenHeader title={displayName} onBack={() => navigation.goBack()} />
      {loading && history.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={colors.primary}
            />
          }>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {t('personalRecords.currentWeightPr')}
            </Text>
            <Text style={styles.cardValue}>
              {weightPrLine ?? t('personalRecords.noPrYet')}
            </Text>
            {weightPrLine ? (
              <Text style={styles.cardType}>
                🏆 {formatPrTypeLabel('weight_pr', lang)}
              </Text>
            ) : null}
          </View>

          {baseline && Object.keys(baseline.repsByWeight).length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>
                {t('personalRecords.bestRepsByWeight')}
              </Text>
              {Object.entries(baseline.repsByWeight)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .slice(0, 8)
                .map(([w, r]) => (
                  <Text key={w} style={styles.repLine}>
                    {formatPrLiftLine(Number(w), r)}
                  </Text>
                ))}
            </View>
          ) : null}

          <Text style={styles.historyTitle}>{t('personalRecords.history')}</Text>
          {history.length === 0 ? (
            <Text style={styles.empty}>{t('workoutLog.historyEmpty')}</Text>
          ) : (
            history.map(session => {
              const maxW = Math.max(
                ...session.sets.map(s => s.weightKg ?? 0),
                0,
              );
              return (
                <View key={session.sessionId} style={styles.sessionCard}>
                  <Text style={styles.sessionDate}>
                    {formatDate(session.performedAt)}
                  </Text>
                  {session.sets.map(set => {
                    const isWeightPr =
                      baseline?.maxWeightKg != null &&
                      set.weightKg === baseline.maxWeightKg &&
                      set.reps ===
                        baseline.repsByWeight[weightKey(baseline.maxWeightKg)];
                    return (
                      <Text
                        key={`${session.sessionId}-${set.setNumber}`}
                        style={styles.setLine}>
                        {formatLastSetLine(set, session.trackingType)}
                        {isWeightPr ||
                        (set.weightKg != null && set.weightKg === maxW && maxW > 0)
                          ? set.weightKg === baseline?.maxWeightKg
                            ? ' 🏆'
                            : ''
                          : ''}
                      </Text>
                    );
                  })}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.lg, paddingBottom: spacing.xxxl},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '800',
  },
  cardType: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
    marginTop: 6,
  },
  repLine: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginTop: 4,
  },
  historyTitle: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  empty: {...typography.body, color: colors.textMuted},
  sessionCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sessionDate: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '800',
    marginBottom: 6,
  },
  setLine: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 4,
  },
});

export default ExercisePrDetailScreen;
