/**
 * UserAvatar – Avatar with optional online indicator
 * Re-exports Avatar with enhanced props for user display
 */

import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import Avatar from './Avatar';
import colors from '@/theme/colors';
import {LiveTrainingDot} from './LiveTrainingDot';

type UserAvatarProps = {
  name: string;
  imageUrl?: string | null;
  user?: {
    full_name?: string | null;
    displayName?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    avatarUrl?: string | null;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showOnlineIndicator?: boolean;
  isOnline?: boolean;
  style?: ViewStyle;
};

const sizeMap = {xs: 24, sm: 32, md: 40, lg: 56};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  imageUrl,
  user,
  size = 'md',
  showOnlineIndicator = false,
  isOnline = false,
  style,
}) => {
  const dimension = sizeMap[size];
  const resolvedName =
    user?.full_name?.trim() ||
    user?.displayName?.trim() ||
    user?.username?.trim() ||
    name;
  const resolvedImage = user?.avatar_url ?? user?.avatarUrl ?? imageUrl;

  const indicatorSize = Math.max(10, Math.round(dimension * 0.3));

  return (
    <View style={[styles.wrapper, style]}>
      <Avatar name={resolvedName} imageUrl={resolvedImage} size={size} />
      {showOnlineIndicator &&
        (isOnline ? (
          <LiveTrainingDot
            size={indicatorSize}
            borderColor={colors.backgroundCard}
            style={styles.indicatorCorner}
          />
        ) : (
          <View
            style={[
              styles.indicatorCorner,
              styles.indicatorOffline,
              {
                width: indicatorSize,
                height: indicatorSize,
                borderRadius: indicatorSize / 2,
                borderWidth: Math.max(2, dimension * 0.05),
              },
            ]}
          />
        ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  indicatorCorner: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  indicatorOffline: {
    backgroundColor: colors.textMuted,
    borderColor: colors.backgroundCard,
  },
});
