/**
 * Compact "Se træning" row for a shared workout log.
 * Hidden when the log has no exercises, sets, volume or PRs.
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {formatVolumeKg} from '@/utils/workoutLogFormat';
import {useTranslation} from '@/i18n';

type Props = {
  snapshot: SharedWorkoutSnapshot;
  onPress?: () => void;
};

export function workoutSnapshotHasContent(snapshot: SharedWorkoutSnapshot): boolean {
  return (
    snapshot.exerciseCount > 0 ||
    snapshot.setCount > 0 ||
    snapshot.totalVolumeKg > 0 ||
    (snapshot.prs?.length ?? 0) > 0 ||
    (snapshot.exercises?.length ?? 0) > 0
  );
}

export const WorkoutSnapshotCard: React.FC<Props> = ({snapshot, onPress}) => {
  const {t, tp} = useTranslation();
  if (!workoutSnapshotHasContent(snapshot)) {
    return null;
  }

  const parts: string[] = [];
  if (snapshot.exerciseCount > 0) {
    parts.push(tp('personalRecords.snapshotExercises', snapshot.exerciseCount));
  }
  if (snapshot.setCount > 0) {
    parts.push(tp('personalRecords.snapshotSets', snapshot.setCount));
  }
  if (snapshot.totalVolumeKg > 0) {
    parts.push(formatVolumeKg(snapshot.totalVolumeKg));
  }
  const summary = parts.join(' · ');
  const prCount = snapshot.prs?.length ?? 0;
  const canOpen = Boolean(onPress && (summary || prCount > 0 || snapshot.exercises?.length));

  const content = (
    <View style={styles.row}>
      <View style={styles.copy}>
        {prCount > 0 ? (
          <Text style={styles.pr} numberOfLines={1}>
            {prCount === 1
              ? t('personalRecords.oneNewPr')
              : t('personalRecords.nNewPrs', {count: prCount})}
          </Text>
        ) : null}
        {summary ? (
          <Text style={styles.summary} numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
      </View>
      {canOpen ? (
        <View style={styles.viewRow}>
          <Text style={styles.viewText}>{t('personalRecords.viewWorkout')}</Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </View>
      ) : null}
    </View>
  );

  if (!canOpen) {
    return summary || prCount > 0 ? content : null;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={t('personalRecords.viewWorkout')}>
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  pr: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
    marginBottom: 2,
  },
  summary: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
  },
  viewText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
});
