/**
 * Badge – Unread counts, status indicators
 */

import React from 'react';
import {View, Text, StyleSheet, ViewStyle} from 'react-native';
import colors from '@/theme/colors';
import {radius, typography} from '@/theme/designTokens';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error';

type BadgeProps = {
  count: number;
  variant?: BadgeVariant;
  maxCount?: number;
  style?: ViewStyle;
};

const variantBackground: Record<BadgeVariant, ViewStyle> = {
  default: {backgroundColor: colors.textMuted},
  primary: {backgroundColor: colors.primary},
  success: {backgroundColor: colors.success},
  warning: {backgroundColor: colors.warning},
  error: {backgroundColor: colors.error},
};

const Badge: React.FC<BadgeProps> = ({
  count,
  variant = 'primary',
  maxCount = 99,
  style,
}) => {
  const displayCount = count > maxCount ? `${maxCount}+` : String(count);
  const bg = variantBackground[variant] ?? variantBackground.primary;

  return (
    <View style={[styles.badge, bg, style]}>
      <Text style={styles.text}>{displayCount}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  text: {
    color: colors.white,
    ...typography.badge,
  },
});

export default Badge;
