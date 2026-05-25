/**
 * Button – unified CTA styles (primary, secondary, ghost, outline)
 */

import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, layout} from '@/theme/designTokens';
import {GymlyPressable} from './GymlyPressable';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
};

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth,
}) => {
  const isDisabled = disabled || loading;

  const buttonStyle = [
    styles.base,
    styles[`${variant}Button`],
    styles[`${size}Button`],
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
    variant === 'primary' && !isDisabled && shadows.glow,
    style,
  ];

  const labelStyle = [
    styles.label,
    styles[`${variant}Label`],
    styles[`${size}Label`],
    textStyle,
  ];

  return (
    <GymlyPressable
      style={buttonStyle}
      onPress={onPress}
      disabled={isDisabled}
      haptic={isDisabled ? false : 'light'}>
      <View style={styles.inner}>
        {variant === 'primary' && !isDisabled ? (
          <View style={styles.sheen} pointerEvents="none" />
        ) : null}
        {loading ? (
          <ActivityIndicator
            color={
              variant === 'primary' || variant === 'secondary'
                ? colors.white
                : colors.primary
            }
            size="small"
          />
        ) : (
          <Text style={labelStyle}>{title}</Text>
        )}
      </View>
    </GymlyPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  inner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheen: {
    position: 'absolute',
    top: 6,
    left: '18%',
    right: '18%',
    height: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  secondaryButton: {
    backgroundColor: colors.primaryDark,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  smButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
  },
  mdButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: layout.buttonMinHeight,
  },
  lgButton: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    minHeight: 56,
  },
  label: {
    ...typography.bodyBold,
    letterSpacing: -0.2,
  },
  primaryLabel: {
    color: colors.white,
  },
  secondaryLabel: {
    color: colors.white,
  },
  ghostLabel: {
    color: colors.primary,
  },
  outlineLabel: {
    color: colors.primary,
  },
  smLabel: {
    fontSize: 14,
  },
  mdLabel: {
    fontSize: 16,
  },
  lgLabel: {
    fontSize: 17,
  },
});

export default Button;
