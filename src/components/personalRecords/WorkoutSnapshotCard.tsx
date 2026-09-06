/**
 * Structured workout / PR block for feed posts (shared snapshot only).
 * Renders as composable sections: PR achievements + compact workout summary.
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {formatVolumeKg} from '@/utils/workoutLogFormat';
import {formatPrLiftLine, formatPrTypeLabel} from '@/utils/personalRecordCopy';
import {getRuntimeLanguage, useTranslation, getExerciseDisplayName} from '@/i18n';

type Props = {
  snapshot: SharedWorkoutSnapshot;
  onPress?: () => void;
};

export const WorkoutSnapshotCard: React.FC<Props> = ({snapshot, onPress}) => {
  const {t, language} = useTranslation();
  const lang = getRuntimeLanguage();
  const totalPrs = snapshot.prs?.length ?? 0;
  const prs = (snapshot.prs ?? []).slice(0, 3);
  const extraPrCount = Math.max(0, totalPrs - prs.length);
  const hasSummary =
    snapshot.exerciseCount > 0 ||
    snapshot.setCount > 0 ||
    snapshot.totalVolumeKg > 0;

  const content = (
    <View style={styles.card}>
      {totalPrs > 0 ? (
        <View style={styles.prBlock}>
          <View style={styles.prHeader}>
            <Icon name="trophy" size={16} color={colors.primary} />
            <Text style={styles.prHeaderText}>
              {totalPrs === 1
                ? t('personalRecords.oneNewPr')
                : t('personalRecords.nNewPrs', {count: totalPrs})}
            </Text>
          </View>

          {prs.map((pr, idx) => (
            <View
              key={`${pr.exerciseName}-${pr.weightKg}-${idx}`}
              style={[styles.prRow, idx === prs.length - 1 && !extraPrCount && styles.prRowLast]}>
              <Text style={styles.prExercise} numberOfLines={1}>
                {getExerciseDisplayName({
                  exerciseId: null,
                  fallbackName: pr.exerciseName,
                  language,
                })}
              </Text>
              <Text style={styles.prLift}>
                {formatPrLiftLine(pr.weightKg, pr.reps)}
              </Text>
              <Text style={styles.prType}>
                {formatPrTypeLabel(pr.recordType, lang)}
              </Text>
            </View>
          ))}

          {extraPrCount > 0 ? (
            <Text style={styles.morePrs}>
              {t('personalRecords.morePrs', {count: extraPrCount})}
            </Text>
          ) : null}
        </View>
      ) : null}

      {hasSummary ? (
        <View
          style={[
            styles.metaRow,
            totalPrs > 0 ? styles.metaRowAfterPr : null,
          ]}>
          <Text style={styles.metaText}>
            {t('personalRecords.snapshotMeta', {
              exercises: snapshot.exerciseCount,
              sets: snapshot.setCount,
              volume: formatVolumeKg(snapshot.totalVolumeKg),
            })}
          </Text>
          {onPress ? (
            <View style={styles.viewRow}>
              <Text style={styles.viewText}>{t('personalRecords.viewWorkout')}</Text>
              <Icon name="chevron-forward" size={14} color={colors.primary} />
            </View>
          ) : null}
        </View>
      ) : onPress ? (
        <View style={styles.metaRow}>
          <Text style={styles.viewText}>{t('personalRecords.viewWorkout')}</Text>
          <Icon name="chevron-forward" size={14} color={colors.primary} />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '22',
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  prBlock: {
    backgroundColor: colors.primary + '0A',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  prHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  prHeaderText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '800',
  },
  prRow: {
    marginBottom: spacing.sm,
  },
  prRowLast: {
    marginBottom: 0,
  },
  prExercise: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  prLift: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    marginTop: 2,
  },
  prType: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  morePrs: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaRowAfterPr: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metaText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '600',
    flex: 1,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
  },
});
