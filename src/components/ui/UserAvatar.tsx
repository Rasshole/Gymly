/**
 * UserAvatar – Avatar with optional online indicator
 * Re-exports Avatar with enhanced props for user display
 */

import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import Avatar from './Avatar';
import colors from '@/theme/colors';

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

  return (
    <View style={[styles.wrapper, style]}>
      <Avatar name={resolvedName} imageUrl={resolvedImage} size={size} />
      {showOnlineIndicator && (
        <View
          style={[
            styles.indicator,
            {
              width: dimension * 0.3,
              height: dimension * 0.3,
              borderRadius: (dimension * 0.3) / 2,
              bottom: 0,
              right: 0,
              borderWidth: Math.max(2, dimension * 0.05),
            },
            isOnline ? styles.indicatorOnline : styles.indicatorOffline,
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    borderColor: colors.backgroundCard,
  },
  indicatorOnline: {
    backgroundColor: colors.success,
  },
  indicatorOffline: {
    backgroundColor: colors.textMuted,
  },
});
