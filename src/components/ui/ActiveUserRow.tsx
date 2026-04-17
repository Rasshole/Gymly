/**
 * ActiveUserRow – user row with avatar, name, status
 * Used in GymPresenceScreen
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {UserAvatar} from './UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import type {UserPresence} from '@/types/gymPresence.types';

function formatUserStatus(user: UserPresence): string {
  switch (user.status) {
    case 'training_now':
      return 'træner nu';
    case 'active_minutes':
      return `aktiv for ${user.minutesAgo ?? 0} min siden`;
    case 'checked_in_minutes':
      return `checkede ind for ${user.minutesAgo ?? 0} min siden`;
    default:
      return '';
  }
}

export type ActiveUserRowProps = {
  user: UserPresence;
  onPress?: () => void;
  onSeeProfile?: () => void;
  onSendMessage?: () => void;
  onInviteToGroup?: () => void;
  /** Compact mode: hide action buttons */
  compact?: boolean;
};

export const ActiveUserRow: React.FC<ActiveUserRowProps> = ({
  user,
  onPress,
  onSeeProfile,
  onSendMessage,
  onInviteToGroup,
  compact = false,
}) => {
  const statusText = formatUserStatus(user);
  const statusColor =
    user.status === 'training_now'
      ? colors.success
      : user.status === 'active_minutes'
        ? colors.primary
        : colors.textSecondary;

  const content = (
    <>
      <UserAvatar name={user.name} imageUrl={user.avatar} size="md" />
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={[styles.status, {color: statusColor}]}>{statusText}</Text>
      </View>
      {!compact && (onSeeProfile || onSendMessage || onInviteToGroup) && (
        <View style={styles.actions}>
          {onSeeProfile && (
            <TouchableOpacity
              onPress={onSeeProfile}
              style={styles.actionBtn}
              activeOpacity={0.7}>
              <Icon name="person-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          {onSendMessage && (
            <TouchableOpacity
              onPress={onSendMessage}
              style={styles.actionBtn}
              activeOpacity={0.7}>
              <Icon name="chatbubble-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          {onInviteToGroup && (
            <TouchableOpacity
              onPress={onInviteToGroup}
              style={styles.actionBtn}
              activeOpacity={0.7}>
              <Icon name="people-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.row}>{content}</View>;
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.bodyBold,
    color: colors.text,
  },
  status: {
    ...typography.caption,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    padding: spacing.xs,
  },
});
