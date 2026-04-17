/**
 * StreakHighlight – Motiverende streak display med milepæl-emoji og rekord
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import * as streak from '@/utils/streakUtils';

type StreakHighlightProps = {
  currentStreak: number;
  longestStreak?: number;
  onPress?: () => void;
};

export const StreakHighlight: React.FC<StreakHighlightProps> = ({
  currentStreak,
  longestStreak,
  onPress,
}) => {
  const icon = streak.getStreakIcon(currentStreak);
  const displayIcon = icon || '🔥';
  const next = streak.getNextMilestone(currentStreak);
  const emphasis = streak.getStreakEmphasisLevel(currentStreak);
  const milestoneHint =
    next && next.daysRemaining > 0
      ? `${next.daysRemaining} ${
          next.daysRemaining === 1 ? 'dag' : 'dage'
        } til ${next.emoji}`
      : null;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        emphasis === 1 && styles.containerEmphasis,
        emphasis === 2 && styles.containerEmphasisStrong,
      ]}
      onPress={onPress}
      activeOpacity={0.9}
      disabled={!onPress}>
      <View style={styles.emojiWrap}>
        <Text style={styles.emojiLarge} accessibilityLabel="Streak milepæl">
          {displayIcon}
        </Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.value}>{currentStreak}</Text>
        <Text style={styles.label}>
          {currentStreak === 1 ? 'dags streak' : 'dages streak'}
        </Text>
        {milestoneHint ? <Text style={styles.milestone}>{milestoneHint}</Text> : null}
        {longestStreak != null && longestStreak > 0 && (
          <Text style={styles.subtext}>Rekord: {longestStreak} dage</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerEmphasis: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '08',
  },
  containerEmphasisStrong: {
    borderColor: colors.primary + '99',
    backgroundColor: colors.primary + '12',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  emojiWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  emojiLarge: {
    fontSize: 28,
  },
  content: {
    flex: 1,
  },
  value: {
    ...typography.h2,
    color: colors.text,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  milestone: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 6,
  },
  subtext: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
});
