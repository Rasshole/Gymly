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
  /** Smaller badge for dense headers (e.g. main tab bell) */
  compact?: boolean;
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
  compact,
}) => {
  const displayCount = count > maxCount ? `${maxCount}+` : String(count);
  const bg = variantBackground[variant] ?? variantBackground.primary;

  return (
    <View style={[styles.badge, compact && styles.badgeCompact, bg, style]}>
      <Text style={[styles.text, compact && styles.textCompact]}>{displayCount}</Text>
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
  badgeCompact: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
  },
  text: {
    color: colors.white,
    ...typography.badge,
  },
  textCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
});

export default Badge;
