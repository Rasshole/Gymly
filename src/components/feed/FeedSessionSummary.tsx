import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';
import {formatWorkoutTypeForViewer} from '@/utils/workoutPostLocalization';
import {useTranslation} from '@/i18n';

type Props = {
  centerName?: string;
  durationMinutes?: number;
  workoutTypeSource?: string;
  /** Already formatted fallback, used when minutes are missing. */
  fallbackLine?: string;
  /** Quiet one-line meta under a photo, or a compact card when there is no media. */
  variant: 'line' | 'card';
  hasPR?: boolean;
};

function splitFallback(line: string | undefined): {
  center: string;
  duration: string;
  type: string;
} {
  const parts = (line ?? '')
    .split('·')
    .map(part => part.trim())
    .filter(Boolean);
  return {
    center: parts[0] ?? '',
    duration: parts[1] ?? '',
    type: parts.slice(2).join(' · '),
  };
}

export const FeedSessionSummary: React.FC<Props> = ({
  centerName,
  durationMinutes,
  workoutTypeSource,
  fallbackLine,
  variant,
  hasPR,
}) => {
  const {t, language} = useTranslation();
  const fallback = splitFallback(fallbackLine);
  const rawDuration = fallback.duration.trim();
  const rawMinutes = rawDuration.match(/^(\d+)\s*min\.?$/i);
  const duration =
    durationMinutes != null
      ? formatWorkoutDuration(durationMinutes, language)
      : rawMinutes
        ? formatWorkoutDuration(Number(rawMinutes[1]), language)
        : rawDuration;
  const type = workoutTypeSource
    ? formatWorkoutTypeForViewer(workoutTypeSource, language)
    : fallback.type;
  const center = centerName || fallback.center;
  if (!duration && !type && !center) {
    return null;
  }

  if (variant === 'line') {
    const bits = [duration, type, center].filter(Boolean);
    return (
      <Text style={styles.line} numberOfLines={2}>
        {hasPR ? `${t('personalRecords.newPrToast')} · ` : ''}
        {bits.join(' · ')}
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.cardBody}>
        {duration ? <Text style={styles.duration}>{duration}</Text> : null}
        {type ? <Text style={styles.type}>{type}</Text> : null}
        {center ? (
          <Text style={styles.center} numberOfLines={1}>
            {center}
          </Text>
        ) : null}
        {hasPR ? <Text style={styles.pr}>{t('personalRecords.oneNewPr')}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  line: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    marginBottom: 4,
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    backgroundColor: colors.primary,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    minWidth: 0,
  },
  duration: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.text,
  },
  type: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    marginTop: 2,
  },
  center: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pr: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
    marginTop: 6,
  },
});
