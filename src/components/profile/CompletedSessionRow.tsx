import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {formatSessionDateAndDurationDa} from '@/services/supabase/profileCheckInHistory';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

type Props = {
  session: ProfileCompletedSession;
  isLast?: boolean;
};

export const CompletedSessionRow: React.FC<Props> = ({session, isLast}) => (
  <View style={[styles.row, isLast && styles.rowLast]}>
    <View style={styles.icon}>
      <Icon name="barbell-outline" size={22} color={colors.primary} />
    </View>
    <View style={styles.body}>
      <Text style={styles.title} numberOfLines={2}>
        {session.gymName}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {formatSessionDateAndDurationDa(session.startedAt, session.durationMinutes)}
      </Text>
      <Text style={styles.typeLine} numberOfLines={2}>
        {formatWorkoutTypeDisplay(session.workoutType)}
      </Text>
      {session.partnerDisplayName ? (
        <Text style={styles.withLine} numberOfLines={1}>
          Med: {session.partnerDisplayName}
        </Text>
      ) : null}
    </View>
  </View>
);

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
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
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
  withLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
