/**
 * Activity Feed Screen
 * Hjertet i den sociale oplevelse – check-ins, streaks, badges, grupper
 */

import React, {useState, useMemo, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {Card} from '@/components/ui/Card';
import {EmptyState} from '@/components/ui/EmptyState';
import {ActivityCard} from '@/components/ui/ActivityCard';
import GymlyPostCard from '@/components/feed/GymlyPostCard';
import {useActivityData, useGroups} from '@/hooks/data';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import {mapEventTypeToActivityCard, buildSecondaryInfo} from '@/utils/activityUtils';
import {useAppStore} from '@/store/appStore';
import {useDashboardStatsStore} from '@/store/dashboardStatsStore';
import * as streak from '@/utils/streakUtils';
import type {ActivityEvent} from '@/types/activity.types';
import type {ActivityScope} from '@/types/activity.types';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';

type FilterScope = 'all' | ActivityScope;
type TimeFilter = 'today' | 'week';

const SCOPE_OPTIONS: {key: FilterScope; label: string}[] = [
  {key: 'all', label: 'Alt'},
  {key: 'friends', label: 'Venner'},
  {key: 'groups', label: 'Grupper'},
  {key: 'local', label: 'Lokal'},
  {key: 'trending', label: 'Trending'},
];

const TIME_OPTIONS: {key: TimeFilter; label: string}[] = [
  {key: 'today', label: 'I dag'},
  {key: 'week', label: 'Denne uge'},
];

const isToday = (d: Date) => {
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
};

const isThisWeek = (d: Date) => {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  return d.getTime() >= weekAgo;
};

const SummaryCard = ({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number | string;
  label: string;
  color: string;
}) => (
  <Card variant="outlined" padding="md" style={styles.summaryCard}>
    <Icon name={icon as any} size={22} color={color} />
    <Text style={styles.summaryValue} numberOfLines={1}>
      {value}
    </Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </Card>
);

const ActivityFeedScreen = () => {
  const navigation = useNavigation<any>();
  const [scopeFilter, setScopeFilter] = useState<FilterScope>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week');
  const currentUser = useAppStore(s => s.user);
  const dashboardStreak = useDashboardStatsStore(s => s.streak);

  const scopeChipOptions = useMemo(
    () => SCOPE_OPTIONS.filter(o => SURFACE_GROUPS_IN_APP || o.key !== 'groups'),
    [],
  );

  useEffect(() => {
    if (!SURFACE_GROUPS_IN_APP && scopeFilter === 'groups') {
      setScopeFilter('all');
    }
  }, [scopeFilter, SURFACE_GROUPS_IN_APP]);

  const {events: activityEvents, error, refresh} = useActivityData('current_user', scopeFilter === 'all' ? undefined : scopeFilter);
  const {groups} = useGroups('current_user');
  const groupsForSummary = SURFACE_GROUPS_IN_APP ? groups : [];

  const filteredEvents = useMemo(() => {
    let filtered = [...activityEvents];
    if (timeFilter === 'today') {
      filtered = filtered.filter(e => isToday(e.timestamp));
    } else if (timeFilter === 'week') {
      filtered = filtered.filter(e => isThisWeek(e.timestamp));
    }
    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activityEvents, timeFilter]);

  const summary = useMemo(() => {
    const todayEvents = activityEvents.filter(e => isToday(new Date(e.timestamp)));
    const friendsActive = new Set(
      activityEvents.filter(e => e.isFriend || e.scope === 'friends').map(e => e.userId)
    ).size;
    const checkInsToday = activityEvents.filter(
      e => e.type === 'check_in' && isToday(new Date(e.timestamp))
    ).length;
    const mostActiveGroup = groupsForSummary
      .filter(g => g.isJoined)
      .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))[0];
    return {
      activitiesToday: todayEvents.length,
      friendsActive: Math.min(friendsActive, 12),
      newCheckIns: checkInsToday,
      mostActiveGroup: mostActiveGroup?.name || '–',
    };
  }, [activityEvents, groupsForSummary]);

  const handleUserPress = (userId: string, name: string) => {
    navigation.navigate('FriendProfile', {
      friendId: userId,
      friendName: name,
      mutualFriends: 0,
      gyms: [],
    });
  };

  const isEmpty = filteredEvents.length === 0;

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Aktivitet" onBack={() => navigation.goBack()} showBack />
        <EmptyState
          icon="cloud-offline-outline"
          title="Kunne ikke hente aktivitet"
          message={error.message}
          actionLabel="Prøv igen"
          onAction={refresh}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Aktivitet"
        onBack={() => navigation.goBack()}
        showBack={true}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Aktivitet</Text>
          <Text style={styles.headerSubtitle}>
            {SURFACE_GROUPS_IN_APP
              ? 'Se hvad venner, grupper og lokale brugere laver'
              : 'Se hvad venner og lokale brugere laver'}
          </Text>
          <Text style={styles.headerSummary}>
            {filteredEvents.length} aktiviteter{timeFilter === 'today' ? ' i dag' : ' denne uge'}
          </Text>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <SummaryCard
            icon="pulse"
            value={summary.activitiesToday}
            label="Aktiviteter i dag"
            color={colors.primary}
          />
          <SummaryCard
            icon="people"
            value={summary.friendsActive}
            label="Venner aktive"
            color={colors.secondary}
          />
          <SummaryCard
            icon="checkmark-circle"
            value={summary.newCheckIns}
            label="Nye check-ins"
            color={colors.success}
          />
          {SURFACE_GROUPS_IN_APP ? (
            <SummaryCard
              icon="people-circle"
              value={summary.mostActiveGroup}
              label="Mest aktiv gruppe"
              color={colors.warning}
            />
          ) : null}
        </View>

        {/* Scope filter chips */}
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {scopeChipOptions.map(({key, label}) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, scopeFilter === key && styles.chipActive]}
                onPress={() => setScopeFilter(key)}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.chipText,
                    scopeFilter === key && styles.chipTextActive,
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Time filter chips */}
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {TIME_OPTIONS.map(({key, label}) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, timeFilter === key && styles.chipActive]}
                onPress={() => setTimeFilter(key)}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.chipText,
                    timeFilter === key && styles.chipTextActive,
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Feed list – GymlyPostCard for check-in/workout, ActivityCard for others */}
        {!isEmpty ? (
          <View style={styles.feedSection}>
            {filteredEvents.map(item => {
              const isWorkoutPost =
                item.type === 'check_in' || item.type === 'workout_completed';
              if (isWorkoutPost) {
                const ownPost =
                  item.userId === currentUser?.id || item.userId === 'current_user';
                const streakEmoji = ownPost
                  ? streak.getStreakIcon(dashboardStreak) || undefined
                  : undefined;
                return (
                  <GymlyPostCard
                    key={item.id}
                    userId={item.userId}
                    userName={item.displayName}
                    streakEmoji={streakEmoji}
                    userAvatar={item.profileImageUrl}
                    gymName={item.gymName || ''}
                    workoutType="fri"
                    duration={item.minutes ? `${item.minutes} min` : '–'}
                    caption={item.message || item.text}
                    timestamp={formatRelativeTime(item.timestamp)}
                    onUserPress={() =>
                      handleUserPress(item.userId, item.displayName)
                    }
                  />
                );
              }
              return (
                <ActivityCard
                  key={item.id}
                  userName={item.displayName}
                  message={item.message || item.text || ''}
                  secondaryInfo={buildSecondaryInfo(item)}
                  timestamp={formatRelativeTime(item.timestamp)}
                  type={mapEventTypeToActivityCard(item.type)}
                  userImageUrl={item.profileImageUrl}
                  onPress={() => handleUserPress(item.userId, item.displayName)}
                />
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="pulse-outline"
            title="Ingen aktivitet endnu"
            message="Dine venner har ikke checket ind endnu. Start selv eller inviter venner."
            actionLabel="Inviter venner"
            onAction={() => navigation.navigate('Friends')}
          />
        )}

        {/* Secondary empty CTA */}
        {isEmpty && (
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => navigation.navigate('CheckIn')}
              activeOpacity={0.8}>
              <Icon name="location" size={20} color={colors.primary} />
              <Text style={styles.ctaButtonText}>Lav dit første check-in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => navigation.navigate('Friends')}
              activeOpacity={0.8}>
              <Icon name="person-add" size={20} color={colors.primary} />
              <Text style={styles.ctaButtonText}>Find venner</Text>
            </TouchableOpacity>
            {SURFACE_GROUPS_IN_APP ? (
              <TouchableOpacity
                style={styles.ctaButton}
                onPress={() => navigation.navigate('Friends', {screen: 'Grupper'} as never)}
                activeOpacity={0.8}>
                <Icon name="people" size={20} color={colors.primary} />
                <Text style={styles.ctaButtonText}>Opret gruppe</Text>
              </TouchableOpacity>
            ) : null}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
  },
  headerSummary: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.h4,
    color: colors.text,
    marginTop: spacing.sm,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
  },
  feedSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary + '15',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    minWidth: 140,
  },
  ctaButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
});

export default ActivityFeedScreen;
