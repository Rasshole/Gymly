/**
 * LeaderboardRow – Consistent leaderboard row layout
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ViewStyle} from 'react-native';
import {UserAvatar} from './UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type LeaderboardRowProps = {
  rank: number;
  name: string;
  value: string;
  valueLabel?: string;
  badge?: string;
  imageUrl?: string | null;
  isCurrentUser?: boolean;
  isFriend?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

const rankColors = [colors.rankGold, colors.rankSilver, colors.rankBronze];

export const LeaderboardRow: React.FC<LeaderboardRowProps> = ({
  rank,
  name,
  value,
  valueLabel,
  badge,
  imageUrl,
  isCurrentUser = false,
  isFriend = false,
  onPress,
  style,
}) => {
  const rankColor = rank <= 3 ? rankColors[rank - 1] : colors.textMuted;
  const content = (
    <>
      <Text style={[styles.rank, {color: rankColor}]}>{rank}</Text>
      <UserAvatar name={name} imageUrl={imageUrl} size="sm" />
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.name, isCurrentUser && styles.nameHighlight]}
            numberOfLines={1}>
            {name}
          </Text>
          {isFriend && !isCurrentUser && (
            <View style={styles.friendBadge}>
              <Text style={styles.friendBadgeText}>Ven</Text>
            </View>
          )}
        </View>
        {valueLabel && (
          <Text style={styles.valueLabel} numberOfLines={1}>
            {valueLabel}
          </Text>
        )}
      </View>
      <View style={styles.rightSection}>
        <Text style={styles.value}>{value}</Text>
        {badge && (
          <View style={styles.badgeWrap}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
    </>
  );

  const rowStyle = [
    styles.row,
    isCurrentUser && styles.rowCurrentUser,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={rowStyle}
        onPress={onPress}
        activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={rowStyle}>{content}</View>;
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  rowCurrentUser: {
    borderColor: colors.primary + '50',
    backgroundColor: colors.primary + '08',
  },
  rank: {
    ...typography.bodyBold,
    width: 24,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
  },
  nameHighlight: {
    color: colors.primary,
  },
  valueLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  friendBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  friendBadgeText: {
    ...typography.badge,
    color: colors.primary,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  value: {
    ...typography.bodyBold,
    color: colors.text,
  },
  badgeWrap: {
    marginTop: 2,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    ...typography.badge,
    color: colors.primary,
  },
});
