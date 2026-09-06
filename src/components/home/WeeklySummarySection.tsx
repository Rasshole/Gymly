import React from 'react';
import {ActivityIndicator, Platform, StyleSheet, Text, View} from 'react-native';
import colors from '@/theme/colors';
import {radius, shadows, spacing, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import {formatWeeklyRankLabel} from '@/utils/weeklySummary';
import type {
  PersonalWeeklySummary,
  WeeklyFriendLeaderboardEntry,
} from '@/utils/weeklySummary';
import {formatWorkoutDuration} from '@/utils/groupSessionFormat';
import * as streak from '@/utils/streakUtils';

const WEEKLY_PURPLE = '#6B4EFF';

type WeeklySummarySectionProps = {
  userId: string;
  personal: PersonalWeeklySummary;
  friends: WeeklyFriendLeaderboardEntry[];
  friendsLoading: boolean;
};

const WeeklySummarySection = ({
  userId,
  personal,
  friends,
  friendsLoading,
}: WeeklySummarySectionProps) => {
  const {t} = useTranslation();
  const streakLabel = streak.formatStreakLabel(personal.currentStreak);
  const streakBadge = streak.getStreakBadge(personal.currentStreak);

  return (
    <View style={styles.section}>
      <View style={styles.personalCard}>
        <Text style={styles.personalTitle}>{t('home.weeklySummaryYourWeek')}</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{personal.checkInCount}</Text>
            <Text style={styles.statLabel}>{t('home.weeklySummaryCheckIns')}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatWorkoutDuration(personal.totalMinutes)}
            </Text>
            <Text style={styles.statLabel}>{t('home.weeklySummaryMinutes')}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>
              {streakBadge ? `${streakBadge} ${personal.currentStreak}` : personal.currentStreak}
            </Text>
            <Text style={styles.statLabel}>{t('home.weeklySummaryStreak')}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue} numberOfLines={1}>
              {personal.bestDayLabel ?? '—'}
            </Text>
            <Text style={styles.statLabel}>{t('home.weeklySummaryBestDay')}</Text>
          </View>
        </View>
        {personal.currentStreak > 0 ? (
          <Text style={styles.personalFootnote}>{streakLabel}</Text>
        ) : null}
      </View>

      <View style={styles.friendsCard}>
        <Text style={styles.friendsTitle}>{t('home.weeklySummaryFriendsTitle')}</Text>
        {friendsLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.friendsLoader} />
        ) : friends.length === 0 ? (
          <Text style={styles.friendsEmpty}>{t('home.weeklySummaryFriendsEmpty')}</Text>
        ) : (
          <View style={styles.friendsList}>
            {friends.map(entry => {
              const isSelf = entry.userId === userId;
              return (
                <View
                  key={entry.userId}
                  style={[styles.friendRow, isSelf && styles.friendRowSelf]}>
                  <Text style={styles.rankLabel}>{formatWeeklyRankLabel(entry.rank)}</Text>
                  <Text
                    style={[styles.friendName, isSelf && styles.friendNameSelf]}
                    numberOfLines={1}>
                    {isSelf ? t('home.weeklySummaryYou') : entry.name}
                  </Text>
                  <Text style={[styles.friendCount, isSelf && styles.friendCountSelf]}>
                    {t('home.weeklySummaryCheckInsCount', {count: entry.checkInCount})}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

export default WeeklySummarySection;

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  personalCard: {
    borderRadius: radius.lg,
    backgroundColor: WEEKLY_PURPLE,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 2,
    ...shadows.glow,
  },
  personalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EDE9FE',
    letterSpacing: 0.4,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  statCell: {
    width: '50%',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.2,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#DDD6FE',
  },
  personalFootnote: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '600',
    color: '#EDE9FE',
    opacity: 0.9,
  },
  friendsCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadows.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {elevation: 2},
    }),
  },
  friendsTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  friendsLoader: {
    marginVertical: spacing.md,
  },
  friendsEmpty: {
    fontSize: 14,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  friendsList: {
    gap: spacing.xs,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCardLight,
    borderWidth: 1,
    borderColor: colors.border + '99',
  },
  friendRowSelf: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary + '35',
  },
  rankLabel: {
    width: 32,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  friendName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
  },
  friendNameSelf: {
    color: colors.primaryDark,
  },
  friendCount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  friendCountSelf: {
    color: colors.primaryDark,
  },
});
