/**
 * ActiveUsersList – Horizontal scroll of users training at gym
 * Highlights friends with subtle badge
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

const CARD_WIDTH = 80;
const WORKOUT_EMOJI: Record<string, string> = {
  fri: '🏋️',
  styrke: '💪',
  kondi: '🏃',
  ben: '🦵',
  overkrop: '💪',
};

export interface ActiveUser {
  id: string;
  name: string;
  avatar?: string | null;
  isFriend?: boolean;
  workoutEmoji?: string;
  workoutType?: string;
}

export interface ActiveUsersListProps {
  users: ActiveUser[];
  totalActive: number;
  friendsActive: number;
  onUserPress: (user: ActiveUser) => void;
}

const ActiveUsersList: React.FC<ActiveUsersListProps> = ({
  users,
  totalActive,
  friendsActive,
  onUserPress,
}) => {
  return (
    <View style={styles.section}>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Icon name="people" size={16} color={colors.secondary} />
          <Text style={styles.statText}>{totalActive} personer aktive</Text>
        </View>
        <View style={styles.stat}>
          <Icon name="person" size={16} color={colors.primary} />
          <Text style={styles.statText}>{friendsActive} venner aktive</Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Aktive i centeret</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {users.map((user) => (
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
                  <Icon name="heart" size={10} color={colors.white} />
                </View>
              )}
            </View>
            <Text style={styles.userName} numberOfLines={1}>
              {user.name}
            </Text>
            {(user.workoutType || user.workoutEmoji) && (
              <View style={styles.workoutChip}>
                <Text style={styles.workoutEmoji}>
                  {user.workoutEmoji ||
                    WORKOUT_EMOJI[user.workoutType || 'fri'] ||
                    '🏋️'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingRight: spacing.lg,
    gap: spacing.md,
  },
  userCard: {
    width: CARD_WIDTH,
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  friendBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  workoutChip: {
    marginTop: 2,
  },
  workoutEmoji: {
    fontSize: 14,
  },
});

export default ActiveUsersList;
