/**
 * Profil – faner Feed (træninger + opslag) og Data (statistik, mål); titel/tandhjul i tab-header
 */

import React, {useMemo, useCallback, useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import {useGymStore} from '@/store/gymStore';
import {useFeedStore} from '@/store/feedStore';
import {useGoalStore} from '@/store/goalStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {refreshWorkoutFeedFromServer} from '@/services/supabase/workoutPostService';
import danishGyms from '@/data/danishGyms';
import {
  ProfileHeader,
  ProfileCentersList,
  ProfileStatGrid,
  StreakHighlight,
  ProfileBadgeStrip,
} from '@/components/profile';
import {Card} from '@/components/ui/Card';
import type {FeedItem} from '@/store/feedStore';
import type {Workout} from '@/types/workout.types';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {
  filterWorkoutsByPeriod,
  sumWorkoutMinutes,
  type WorkoutPeriod,
} from '@/utils/workoutPeriodFilter';
import {useProfileStats, useWeeklyStats} from '@/hooks/useProfileData';
import {useJoinedGroups} from '@/hooks/useGroupData';
import {useBadgeStore} from '@/store/badgeStore';
import * as streak from '@/utils/streakUtils';
import colors from '@/theme/colors';
import {spacing, typography, radius} from '@/theme/designTokens';

const formatTotalTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} timer` : `${h}t ${m}m`;
};

const formatWorkoutDate = (d: Date) =>
  d.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const isPrItem = (i: FeedItem): boolean =>
  i.type === 'pr' || ((i.prInfo?.trim()?.length ?? 0) > 0);

type ProfileTab = 'feed' | 'data';

const DATA_PERIOD_OPTIONS: {key: WorkoutPeriod; label: string}[] = [
  {key: 'week', label: 'Uge'},
  {key: 'month', label: 'Måned'},
  {key: 'year', label: 'År'},
  {key: 'all', label: 'I alt'},
];

const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();
  const {feedItems} = useFeedStore();
  const goals = useGoalStore(s => s.goals);
  const workouts = useWorkoutStore(s => s.workouts);
  const [tab, setTab] = useState<ProfileTab>('feed');
  const [dataWorkoutPeriod, setDataWorkoutPeriod] =
    useState<WorkoutPeriod>('week');

  const {stats: profileStats, refresh: refreshProfileStats} = useProfileStats(user?.id);
  const {weeklyStats, refresh: refreshWeeklyStats} = useWeeklyStats(user?.id);
  const {groups: joinedGroupsList} = useJoinedGroups(user?.id);
  const setDashboardStats = useDashboardStatsStore(s => s.setStats);
  const dashboardStreak = useDashboardStatsStore(s => s.streak);
  const dashboardLongestStreak = useDashboardStatsStore(s => s.longestStreak);

  useEffect(() => {
    if (!profileStats || !weeklyStats) return;
    const lastCheckIn = user?.id
      ? useGymStore.getState().getLastUserCheckIn(user.id)
      : undefined;
    setDashboardStats({
      streak: profileStats.currentStreak,
      longestStreak: profileStats.longestStreak,
      lastCheckInDateKey: lastCheckIn
        ? streak.getLocalDateString(lastCheckIn.checkInTime)
        : null,
      weeklyCheckins: weeklyStats.checkInsThisWeek,
      weeklyMinutes: weeklyStats.trainingMinutesThisWeek,
      lastCheckInAt: lastCheckIn?.checkInTime ?? null,
    });
  }, [profileStats, weeklyStats, setDashboardStats, user?.id]);

  useFocusEffect(
    useCallback(() => {
      refreshWorkoutFeedFromServer().catch(() => {});
      refreshProfileStats();
      refreshWeeklyStats();
    }, [refreshProfileStats, refreshWeeklyStats]),
  );

  const displayName = user?.displayName || 'Bruger';
  const username = user?.username || 'bruger';

  const centerRows = useMemo(() => {
    const ids = user?.favoriteGyms ?? [];
    return ids
      .slice(0, 3)
      .map(id => danishGyms.find(g => g.id === id))
      .filter(Boolean)
      .map(g => ({
        name: g!.name,
        city: g!.city,
      }));
  }, [user?.favoriteGyms]);

  const badgeUnlocks = useBadgeStore(s => s.unlockedByUser[user?.id ?? '']);
  const badgeCount = badgeUnlocks ? Object.keys(badgeUnlocks).length : 0;

  const stats = [
    {
      key: 'checkins',
      icon: 'checkmark-circle',
      label: 'Check-ins',
      value: profileStats?.totalCheckIns ?? 0,
      onPress: () => navigation.navigate('CheckIn'),
    },
    {
      key: 'time',
      icon: 'time',
      label: 'Træningstid',
      value: formatTotalTime(profileStats?.totalTrainingMinutes ?? 0),
    },
    {
      key: 'friends',
      icon: 'people',
      label: 'Venner',
      value: profileStats?.friendsCount ?? 0,
      onPress: () => navigation.navigate('Friends'),
    },
    {
      key: 'groups',
      icon: 'people-circle',
      label: 'Grupper',
      value: joinedGroupsList.length,
      onPress: () => navigation.navigate('Friends', {screen: 'Grupper'} as never),
    },
    {
      key: 'badges',
      emoji: '🏅',
      label: 'Badges',
      value: badgeCount,
    },
  ];

  const myFeedItems = useMemo(() => {
    return feedItems.filter(
      i =>
        (user?.id && i.userId === user?.id) ||
        (!i.userId && i.user === displayName),
    );
  }, [feedItems, user?.id, displayName]);

  const userWorkouts = useMemo(() => {
    const uid = user?.id;
    return workouts.filter(w =>
      uid ? w.userId === uid || w.userId === 'current_user' : w.userId === 'current_user',
    );
  }, [workouts, user?.id]);

  const dataTabWorkouts = useMemo(
    () => filterWorkoutsByPeriod(userWorkouts, dataWorkoutPeriod),
    [userWorkouts, dataWorkoutPeriod],
  );

  const dataTabWorkoutsSummary = useMemo(() => {
    const n = dataTabWorkouts.length;
    const min = sumWorkoutMinutes(dataTabWorkouts);
    return {count: n, minutes: min};
  }, [dataTabWorkouts]);

  const myActiveGoals = useMemo(() => {
    const uid = user?.id;
    return goals.filter(g => {
      if (g.isCompleted) return false;
      if (uid && g.userId === uid) return true;
      if (g.userId === 'current_user') return true;
      return false;
    });
  }, [goals, user?.id]);

  const renderWorkoutHistoryRow = (w: Workout, isLast?: boolean) => (
    <View
      key={w.id}
      style={[styles.workoutHistoryRow, isLast && styles.workoutHistoryRowLast]}>
      <View style={styles.workoutHistoryIcon}>
        <Icon name="barbell-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.workoutHistoryBody}>
        <Text style={styles.workoutHistoryTitle} numberOfLines={1}>
          {w.gymName || 'Træning'}
        </Text>
        <Text style={styles.workoutHistoryMeta} numberOfLines={1}>
          {formatWorkoutTypeDisplay(w.workoutType)} · {w.duration} min
        </Text>
        <Text style={styles.workoutHistoryTime}>
          {formatWorkoutDate(new Date(w.startTime))}
        </Text>
      </View>
    </View>
  );

  const renderFeedRow = (post: FeedItem, variant: 'workout' | 'pr') => (
    <View key={post.id} style={styles.feedPreviewRow}>
      {post.photoUri ? (
        <Image source={{uri: post.photoUri}} style={styles.feedPreviewThumb} />
      ) : (
        <View style={styles.feedPreviewThumbPlaceholder}>
          <Icon
            name={variant === 'pr' ? 'trophy-outline' : 'images-outline'}
            size={20}
            color={colors.primary}
          />
        </View>
      )}
      <View style={styles.feedPreviewBody}>
        <Text style={styles.feedPreviewMeta} numberOfLines={1}>
          {variant === 'pr'
            ? post.prInfo || post.workoutInfo || 'PR'
            : post.workoutInfo || 'Opslag'}
        </Text>
        {(post.description?.trim()?.length ?? 0) > 0 ? (
          <Text style={styles.feedPreviewCaption} numberOfLines={3}>
            {post.description}
          </Text>
        ) : null}
        <Text style={styles.feedPreviewTime}>{post.timestamp}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <ProfileHeader
          displayName={displayName}
          username={username}
          profileImageUrl={user?.profileImageUrl}
          showBio={false}
          onEditPress={() => navigation.navigate('EditProfile')}
          followersCount={profileStats?.followersCount ?? 0}
          followingCount={profileStats?.followingCount ?? 0}
          friendsCount={profileStats?.friendsCount ?? 0}
        />

        {user?.id ? <ProfileBadgeStrip userId={user.id} /> : null}

        {centerRows.length > 0 ? (
          <ProfileCentersList centers={centerRows} />
        ) : (
          <TouchableOpacity
            style={styles.noCentersHint}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.85}>
            <Icon name="location-outline" size={18} color={colors.primary} />
            <Text style={styles.noCentersHintText}>
              Tilføj dit lokale center under Rediger profil
            </Text>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Faner */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'feed' && styles.tabBtnActive]}
            onPress={() => setTab('feed')}
            activeOpacity={0.85}>
            <Icon
              name="newspaper-outline"
              size={18}
              color={tab === 'feed' ? colors.white : colors.textSecondary}
            />
            <Text
              style={[styles.tabBtnText, tab === 'feed' && styles.tabBtnTextActive]}>
              Feed
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'data' && styles.tabBtnActive]}
            onPress={() => setTab('data')}
            activeOpacity={0.85}>
            <Icon
              name="stats-chart-outline"
              size={18}
              color={tab === 'data' ? colors.white : colors.textSecondary}
            />
            <Text
              style={[styles.tabBtnText, tab === 'data' && styles.tabBtnTextActive]}>
              Data
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'feed' ? (
          <View style={styles.section}>
            <Text style={styles.blockTitle}>Dine træninger</Text>
            <Text style={styles.blockSubtitle}>
              Historik fra dine sessioner
            </Text>
            <Card variant="outlined" padding="md">
              {userWorkouts.length > 0 ? (
                userWorkouts.map((w, i) =>
                  renderWorkoutHistoryRow(w, i === userWorkouts.length - 1),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="fitness-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen træninger endnu</Text>
                  <Text style={styles.emptySubtext}>
                    Tjek ind og afslut en session for at se dem her
                  </Text>
                </View>
              )}
            </Card>

            <Text style={[styles.blockTitle, styles.blockTitleSpaced]}>
              Opslag & delte træninger
            </Text>
            <Text style={styles.blockSubtitle}>
              Billeder, PR&apos;s og hvad du har delt til feed
            </Text>
            <Card variant="outlined" padding="lg">
              {myFeedItems.length > 0 ? (
                myFeedItems.map(post =>
                  renderFeedRow(post, isPrItem(post) ? 'pr' : 'workout'),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="images-outline" size={36} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen opslag endnu</Text>
                  <Text style={styles.emptySubtext}>
                    Del efter træning for at vise billeder og tekst her
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyCta}
                    onPress={() => navigation.navigate('CheckIn')}
                    activeOpacity={0.85}>
                    <Text style={styles.emptyCtaText}>Gå til check-in</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistik</Text>
            <View style={styles.streakBlock}>
              <StreakHighlight
                currentStreak={dashboardStreak}
                longestStreak={dashboardLongestStreak}
                onPress={() => navigation.navigate('CheckIn')}
              />
            </View>
            <Card variant="outlined" padding="lg" style={styles.statsCard}>
              <ProfileStatGrid stats={stats} />
            </Card>

            <Text style={styles.recentWorkoutsHeading}>Seneste træninger</Text>
            <Text style={styles.recentWorkoutsSub}>
              {dataTabWorkoutsSummary.count === 0
                ? 'Ingen i valgt periode'
                : `${dataTabWorkoutsSummary.count} træning${
                    dataTabWorkoutsSummary.count === 1 ? '' : 'er'
                  } · ${formatTotalTime(dataTabWorkoutsSummary.minutes)}`}
            </Text>
            <View style={styles.periodChips}>
              {DATA_PERIOD_OPTIONS.map(({key, label}) => {
                const active = dataWorkoutPeriod === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.periodChip, active && styles.periodChipActive]}
                    onPress={() => setDataWorkoutPeriod(key)}
                    activeOpacity={0.85}>
                    <Text
                      style={[
                        styles.periodChipText,
                        active && styles.periodChipTextActive,
                      ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Card variant="outlined" padding="md">
              {dataTabWorkouts.length > 0 ? (
                dataTabWorkouts.map((w, i) =>
                  renderWorkoutHistoryRow(w, i === dataTabWorkouts.length - 1),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="calendar-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen træninger her</Text>
                  <Text style={styles.emptySubtext}>
                    Vælg en anden periode eller tjek ind for at bygge historik
                  </Text>
                </View>
              )}
            </Card>

            <Text style={styles.goalsHeading}>Mål</Text>
            <Card variant="outlined" padding="md">
              {myActiveGoals.length === 0 ? (
                <Text style={styles.goalsEmpty}>
                  Du har ingen aktive mål. Tilføj et for at holde fokus.
                </Text>
              ) : (
                myActiveGoals.map(goal => (
                  <View key={goal.id} style={styles.goalRow}>
                    <Icon name="flag" size={18} color={colors.primary} />
                    <View style={styles.goalBody}>
                      <Text style={styles.goalTitle} numberOfLines={2}>
                        {goal.title}
                      </Text>
                      <Text style={styles.goalMeta}>
                        {goal.progress}% · {goal.description}
                      </Text>
                    </View>
                  </View>
                ))
              )}
              <TouchableOpacity
                style={styles.addGoalBtn}
                onPress={() => navigation.navigate('AddGoal')}
                activeOpacity={0.85}>
                <Icon name="add-circle-outline" size={22} color={colors.primary} />
                <Text style={styles.addGoalBtnText}>Tilføj mål</Text>
              </TouchableOpacity>
            </Card>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {flex: 1},
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    padding: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 15,
  },
  tabBtnTextActive: {
    color: colors.white,
  },
  blockTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 2,
  },
  blockTitleSpaced: {
    marginTop: spacing.xl,
  },
  blockSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  noCentersHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  noCentersHintText: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  streakBlock: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  statsCard: {
    marginTop: 0,
  },
  recentWorkoutsHeading: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: 4,
  },
  recentWorkoutsSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  periodChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  periodChipText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: colors.primary,
  },
  workoutHistoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  workoutHistoryRowLast: {
    borderBottomWidth: 0,
  },
  workoutHistoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutHistoryBody: {flex: 1, minWidth: 0},
  workoutHistoryTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  workoutHistoryMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  workoutHistoryTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  feedPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  feedPreviewThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  feedPreviewThumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedPreviewBody: {flex: 1, minWidth: 0},
  feedPreviewMeta: {
    ...typography.small,
    fontWeight: '600',
    color: colors.text,
  },
  feedPreviewCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  feedPreviewTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary + '15',
    borderRadius: 10,
  },
  emptyCtaText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  goalsHeading: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  goalsEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  goalBody: {flex: 1},
  goalTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  goalMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  addGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '08',
  },
  addGoalBtnText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
});

export default ProfileScreen;
