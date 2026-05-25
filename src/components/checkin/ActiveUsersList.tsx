import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {useTranslation, getRuntimeLanguage} from '@/i18n';
import {formatDurationIgang} from '@/utils/activeSessionFormat';
import {getStreakBadge} from '@/utils/streakUtils';
import {
  getUserStatsMap,
  subscribeUserStats,
  type UserStats,
} from '@/services/supabase/userStatsService';

/** Demo-kort: modal bruger lokalt indhold (ingen Supabase-UUID). */
export type LiveDemoFriendship =
  | 'friend'
  | 'none'
  | 'pending_sent'
  | 'pending_received';

export type LiveCenterUserDemoSeed = {
  synthetic: true;
  friendship: LiveDemoFriendship;
  streakDays: number;
  primaryCenterLabel?: string | null;
};

export interface ActiveUser {
  id: string;
  name: string;
  avatar?: string | null;
  isFriend?: boolean;
  workoutEmoji?: string;
  workoutType?: string;
  centerName?: string;
  startedAt?: string;
  liveDemoSeed?: LiveCenterUserDemoSeed;
}

export interface ActiveUsersListProps {
  users: ActiveUser[];
  totalActive: number;
  friendsActive: number;
  onUserPress: (user: ActiveUser) => void;
}

/** Afstand til kant matcher `ActiveSessionView` scrollContent. */
const SECTION_HORIZONTAL_PAD = spacing.lg + 2;
const COLUMN_GAP = spacing.sm;
const ROW_GAP = spacing.sm;

function isDemoLiveListId(id: string): boolean {
  return id.startsWith('demo-live-');
}

const ActiveUsersList: React.FC<ActiveUsersListProps> = ({
  users,
  totalActive: _totalActive,
  friendsActive: _friendsActive,
  onUserPress,
}) => {
  const {t} = useTranslation();
  const {width: windowWidth} = useWindowDimensions();
  const uniqueUsers = useMemo(
    () => Array.from(new Map(users.map(user => [user.id, user])).values()),
    [users],
  );
  const safeUsers = uniqueUsers.slice(0, 30);
  const totalActive = uniqueUsers.length;
  const friendsActive = uniqueUsers.filter(user => user.isFriend).length;
  const [statsByUser, setStatsByUser] = useState<Record<string, UserStats>>({});
  const statsUserIds = useMemo(
    () => safeUsers.map(u => u.id).filter(id => !isDemoLiveListId(id)),
    [safeUsers],
  );

  /** Floor så 3 × bredde + 2 × gap ikke overstiger rækken (undgår kun 2 pr. række på iOS). */
  const cardWidth = useMemo(() => {
    const contentW = windowWidth - SECTION_HORIZONTAL_PAD * 2;
    return Math.max(92, Math.floor((contentW - COLUMN_GAP * 2) / 3));
  }, [windowWidth]);

  const rowChunks = useMemo(() => {
    const chunks: ActiveUser[][] = [];
    for (let i = 0; i < safeUsers.length; i += 3) {
      chunks.push(safeUsers.slice(i, i + 3));
    }
    return chunks;
  }, [safeUsers]);

  useEffect(() => {
    if (statsUserIds.length === 0) {
      setStatsByUser({});
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        const next = await getUserStatsMap(statsUserIds);
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
    const unsubs = statsUserIds.map(id =>
      subscribeUserStats(id, () => void load()),
    );
    return () => {
      mounted = false;
      unsubs.forEach(fn => fn());
    };
  }, [statsUserIds]);

  return (
    <View style={styles.section}>
      <View style={styles.statsRow}>
        <View style={styles.pill}>
          <Icon name="people" size={14} color={colors.primaryDark} />
          <Text style={styles.pillText}>
            {t('activeCenter.active', {count: totalActive})}
          </Text>
        </View>
        <View style={styles.pill}>
          <Icon name="person" size={14} color={colors.primaryDark} />
          <Text style={styles.pillText}>
            {t('activeCenter.activeAndFriends', {count: totalActive, friends: friendsActive})}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillEmoji}>🔥</Text>
          <Text style={styles.pillText}>streak aktiv</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Live i centret</Text>

      <View style={styles.gridContainer}>
        {rowChunks.map((row, rowIdx) => (
          <View key={`live-row-${rowIdx}`} style={styles.gridRow}>
            {row.map((user, colIdx) => {
              const started = user.startedAt;
              const durationLine = started
                ? formatDurationIgang(started)
                : 'Lige startet';
              const streak = statsByUser[user.id]?.currentStreak ?? 0;
              const badge = streak > 0 ? getStreakBadge(streak) : null;
              return (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.userCard,
                    {
                      width: cardWidth,
                      marginRight: colIdx < row.length - 1 ? COLUMN_GAP : 0,
                    },
                  ]}
                  onPress={() => onUserPress(user)}
                  activeOpacity={0.82}>
                  <View style={styles.avatarRow}>
                    <UserAvatar
                      name={user.name}
                      imageUrl={user.avatar}
                      size="sm"
                      showOnlineIndicator
                      isOnline
                    />
                    {user.isFriend ? (
                      <View style={styles.friendBadge}>
                        <Icon name="person" size={8} color={colors.white} />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.userName} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <Text style={styles.trainingType} numberOfLines={2}>
                    {user.workoutEmoji ? `${user.workoutEmoji} ` : ''}
                    {formatWorkoutTypeDisplay(
                      user.workoutType || 'cardio',
                      getRuntimeLanguage(),
                    )}
                  </Text>
                  <Text style={styles.durationText} numberOfLines={1}>
                    {durationLine}
                  </Text>
                  {streak > 0 && badge ? (
                    <Text style={styles.streakMeta} numberOfLines={1}>
                      {badge} {streak}d
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl + spacing.sm,
    alignSelf: 'stretch',
    width: '100%',
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
  gridContainer: {
    width: '100%',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: ROW_GAP,
  },
  userCard: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border + '66',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarRow: {
    position: 'relative',
    marginBottom: spacing.xs + 2,
    alignSelf: 'center',
  },
  friendBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundLight,
  },
  userName: {
    ...typography.small,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    width: '100%',
    marginBottom: 1,
  },
  trainingType: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    width: '100%',
    lineHeight: 13,
    marginBottom: 3,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
    width: '100%',
  },
  streakMeta: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    width: '100%',
  },
});

export default ActiveUsersList;
