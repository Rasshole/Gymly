/**
 * ActivityCard – Activity feed item card
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from './UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

type ActivityCardProps = {
  userName: string;
  message: string;
  secondaryInfo?: string;
  timestamp: string;
  type?: 'check_in' | 'streak' | 'badge' | 'leaderboard' | 'workout' | 'group';
  userImageUrl?: string | null;
  onPress?: () => void;
  style?: ViewStyle;
};

const typeIcons: Record<string, string> = {
  check_in: 'location',
  streak: 'flame',
  badge: 'medal',
  leaderboard: 'trophy',
  workout: 'fitness',
  group: 'people',
};

const typeColors: Record<string, string> = {
  check_in: colors.success,
  streak: colors.warning,
  badge: colors.rankGold,
  leaderboard: colors.primary,
  workout: colors.secondary,
  group: colors.accent,
};

export const ActivityCard: React.FC<ActivityCardProps> = ({
  userName,
  message,
  secondaryInfo,
  timestamp,
  type = 'check_in',
  userImageUrl,
  onPress,
  style,
}) => {
  const iconName = typeIcons[type] || 'ellipse';
  const iconColor = typeColors[type] || colors.primary;

  const content = (
    <>
      <UserAvatar name={userName} imageUrl={userImageUrl} size="md" />
      <View style={styles.content}>
        <Text style={styles.message} numberOfLines={2}>
          <Text style={styles.userName}>{userName}</Text>
          {' '}{message}
        </Text>
        {secondaryInfo && (
          <Text style={styles.secondary} numberOfLines={1}>
            {secondaryInfo}
          </Text>
        )}
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
      <View style={[styles.iconWrap, {backgroundColor: iconColor + '20'}]}>
        <Icon name={iconName as any} size={20} color={iconColor} />
      </View>
    </>
  );

  const cardStyle = [styles.card, style];

  if (onPress) {
    return (
      <TouchableOpacity style={cardStyle} onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{content}</View>;
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    gap: spacing.md,
    ...shadows.sm,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  message: {
    ...typography.body,
    color: colors.text,
  },
  secondary: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
