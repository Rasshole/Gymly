/**
 * Friend-safe view of a shared workout snapshot (no private history access).
 */

import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ui/ScreenHeader';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {formatReps, formatVolumeKg, formatWeightKg} from '@/utils/workoutLogFormat';
import {formatPrTypeLabel} from '@/utils/personalRecordCopy';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';
import {useTranslation, getRuntimeLanguage, getExerciseDisplayName} from '@/i18n';

export type SharedWorkoutDetailParams = {
  SharedWorkoutDetail: {
    authorName: string;
    gymName?: string;
    snapshot: SharedWorkoutSnapshot;
  };
};

const SharedWorkoutDetailScreen: React.FC = () => {
  const {t, language} = useTranslation();
  const navigation = useNavigation();
  const route =
    useRoute<RouteProp<SharedWorkoutDetailParams, 'SharedWorkoutDetail'>>();
  const insets = useSafeAreaInsets();
  const lang = getRuntimeLanguage();
  const {authorName, gymName, snapshot} = route.params;

  return (
    <View style={[styles.container, {paddingBottom: insets.bottom}]}>
      <ScreenHeader
        title={t('personalRecords.sharedWorkoutTitle')}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.author}>{authorName}</Text>
        {gymName ? <Text style={styles.gym}>{gymName}</Text> : null}
        <Text style={styles.meta}>
          {formatWorkoutDuration(snapshot.durationMinutes)} ·{' '}
          {t('personalRecords.snapshotMeta', {
            exercises: snapshot.exerciseCount,
            sets: snapshot.setCount,
            volume: formatVolumeKg(snapshot.totalVolumeKg),
          })}
        </Text>

        {snapshot.prs.length > 0 ? (
          <View style={styles.prBanner}>
            <Text style={styles.prBannerText}>
              {snapshot.prs.length === 1
                ? t('personalRecords.oneNewPr')
                : t('personalRecords.nNewPrs', {count: snapshot.prs.length})}
            </Text>
          </View>
        ) : null}

        {snapshot.exercises.map((ex, idx) => (
          <View key={`${ex.name}-${idx}`} style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>
              {getExerciseDisplayName({
                exerciseId: null,
                fallbackName: ex.name,
                language,
              })}
            </Text>
            {ex.sets.map(set => (
              <View key={`${ex.name}-${set.setNumber}`} style={styles.setRow}>
                <Text style={styles.setNum}>
                  {t('workoutLog.setN', {n: set.setNumber})}
                </Text>
                <Text style={styles.setVal}>{formatWeightKg(set.weightKg)}</Text>
                <Text style={styles.setVal}>{formatReps(set.reps)}</Text>
                {set.isPr ? <Text style={styles.prMark}>🏆</Text> : null}
              </View>
            ))}
          </View>
        ))}

        {snapshot.prs.map((pr, i) => (
          <Text key={`pr-${i}`} style={styles.prFoot}>
            🏆{' '}
            {getExerciseDisplayName({
              exerciseId: null,
              fallbackName: pr.exerciseName,
              language,
            })}{' '}
            · {formatPrTypeLabel(pr.recordType, lang)}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  author: {...typography.h4, color: colors.text, marginBottom: 4},
  gym: {...typography.body, color: colors.textSecondary, fontWeight: '600'},
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: spacing.md,
  },
  prBanner: {
    backgroundColor: colors.primary + '12',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  prBannerText: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  exerciseCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  exerciseName: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  setNum: {
    width: 56,
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
  prMark: {width: 28, textAlign: 'right'},
  prFoot: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
    marginBottom: 4,
  },
});

export default SharedWorkoutDetailScreen;
