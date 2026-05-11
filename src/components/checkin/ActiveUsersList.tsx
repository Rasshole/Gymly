import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius} from '@/theme/designTokens';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {getStreakBadge} from '@/utils/streakUtils';
import {
  getUserStatsMap,
  subscribeUserStats,
  type UserStats,
} from '@/services/supabase/userStatsService';

const CARD_WIDTH = 116;

export interface ActiveUser {
  id: string;
  name: string;
  avatar?: string | null;
  isFriend?: boolean;
  workoutEmoji?: string;
  workoutType?: string;
  centerName?: string;
  startedAt?: string;
}

export interface ActiveUsersListProps {
  users: ActiveUser[];
  totalActive: number;
  friendsActive: number;
  onUserPress: (user: ActiveUser) => void;
}

const ActiveUsersList: React.FC<ActiveUsersListProps> = ({
  users,
  totalActive: _totalActive,
  friendsActive: _friendsActive,
  onUserPress,
}) => {
  const uniqueUsers = useMemo(
    () => Array.from(new Map(users.map(user => [user.id, user])).values()),
    [users],
  );
  const safeUsers = uniqueUsers.slice(0, 30);
  const totalActive = uniqueUsers.length;
  const friendsActive = uniqueUsers.filter(user => user.isFriend).length;
  const [statsByUser, setStatsByUser] = useState<Record<string, UserStats>>({});
  const userIds = useMemo(() => safeUsers.map(u => u.id), [safeUsers]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const next = await getUserStatsMap(userIds);
        if (mounted) {
          setStatsByUser(next);
        }
      } catch {
        if (mounted) {
          setStatsByUser({});
        }
      }
    };
    void load();
    const unsubs = userIds.map(id => subscribeUserStats(id, () => void load()));
    return () => {
      mounted = false;
      unsubs.forEach(fn => fn());
    };
  }, [userIds]);

  return (
    <View style={styles.section}>
      <View style={styles.statsRow}>
        <View style={styles.pill}>
          <Icon name="people" size={14} color={colors.primaryDark} />
          <Text style={styles.pillText}>
            {totalActive} {totalActive === 1 ? 'aktiv' : 'aktive'}
          </Text>
        </View>
        <View style={styles.pill}>
          <Icon name="person" size={14} color={colors.primaryDark} />
          <Text style={styles.pillText}>{friendsActive} venner aktive</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillEmoji}>🔥</Text>
          <Text style={styles.pillText}>streak aktiv</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Live i centret</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {safeUsers.map(user => (
          <TouchableOpacity
            key={user.id}
            style={styles.userCard}
            onPress={() => onUserPress(user)}
            activeOpacity={0.8}>
            <View style={styles.avatarWrapper}>
              <UserAvatar
                name={user.name}
                imageUrl={user.avatar}
                size="lg"
                showOnlineIndicator
                isOnline
              />
              {user.isFriend && (
                <View style={styles.friendBadge}>
                  <Icon name="person" size={10} color={colors.white} />
                </View>
              )}
            </View>
            <Text style={styles.userName} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={styles.trainingType} numberOfLines={1}>
              {user.workoutEmoji ? `${user.workoutEmoji} ` : ''}
              {formatWorkoutTypeDisplay(user.workoutType || 'cardio')}
            </Text>
            {(() => {
              const streak = statsByUser[user.id]?.currentStreak ?? 0;
              if (streak <= 0) {
                return null;
              }
              const badge = getStreakBadge(streak);
              return (
                <Text style={styles.streakMeta} numberOfLines={1}>
                  {badge ? `${badge} ` : ''}
                  {streak} dages streak
                </Text>
              );
            })()}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl + spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundLight,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  pillEmoji: {
    fontSize: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingRight: spacing.xl,
    gap: spacing.md,
  },
  userCard: {
    width: CARD_WIDTH,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundLight,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  friendBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  trainingType: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  streakMeta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default ActiveUsersList;
