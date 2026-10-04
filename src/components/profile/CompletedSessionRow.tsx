import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {formatSessionDateAndDurationDa} from '@/services/supabase/profileCheckInHistory';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {findGymRecordByIdRelaxed} from '@/data/danishGyms';
import GymLogoView from '@/components/ui/GymLogoView';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

type Props = {
  session: ProfileCompletedSession;
  isLast?: boolean;
  /** Optional "4 øvelser · 12 sæt · 6.480 kg" */
  summaryLine?: string;
  onPress?: () => void;
};

export const CompletedSessionRow: React.FC<Props> = ({
  session,
  isLast,
  summaryLine,
  onPress,
}) => {
  const {t, language} = useTranslation();

  const registry = session.gymId
    ? findGymRecordByIdRelaxed(session.gymId)
    : null;
  const logoBrand =
    session.gymBrand?.trim() || registry?.brand?.trim() || undefined;
  const logoName =
    session.gymName?.trim() ||
    registry?.name?.trim() ||
    logoBrand ||
    'Center';

  const content = (
    <>
      <GymLogoView
        gymName={logoName}
        brand={logoBrand}
        size={40}
        surface="lavender"
        unknownFallback="gymly-only"
        style={styles.logo}
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {session.gymName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatSessionDateAndDurationDa(
            session.startedAt,
            session.durationMinutes,
            language,
          )}
        </Text>
        <Text style={styles.typeLine} numberOfLines={2}>
          {formatWorkoutTypeDisplay(session.workoutType, language)}
        </Text>
        {summaryLine ? (
          <Text style={styles.summaryLine} numberOfLines={1}>
            {summaryLine}
          </Text>
        ) : null}
        {session.partnerDisplayName ? (
          <Text style={styles.withLine} numberOfLines={1}>
            {t('profile.sessionWith', {name: session.partnerDisplayName})}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.row, isLast && styles.rowLast]}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button">
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.row, isLast && styles.rowLast]}>{content}</View>;
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: spacing.sm,
  },
  logo: {
    flexShrink: 0,
  },
  body: {flex: 1, minWidth: 0},
  title: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  typeLine: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    marginTop: 6,
  },
  summaryLine: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
    marginTop: 4,
  },
  withLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
