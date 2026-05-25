/**
 * Reusable Card — premium rounded surfaces
 */

import React from 'react';
import {View, ViewStyle, StyleSheet} from 'react-native';
import colors from '@/theme/colors';
import {spacing, radius, shadows} from '@/theme/designTokens';
import {GymlyPressable} from './GymlyPressable';

type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined' | 'flat';
  padding?: keyof typeof spacing;
};

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  style,
  variant = 'default',
  padding = 'lg',
}) => {
  const cardStyle = [
    styles.base,
    variant === 'elevated' && styles.elevated,
    variant === 'outlined' && styles.outlined,
    variant === 'flat' && styles.flat,
    {padding: spacing[padding]},
  ];

  if (onPress) {
    return (
      <GymlyPressable onPress={onPress} style={[cardStyle, style]} haptic="selection">
        {children}
      </GymlyPressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  elevated: {
    ...shadows.md,
  },
  outlined: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.none,
  },
  flat: {
    backgroundColor: colors.backgroundCardLight,
    ...shadows.none,
  },
});
