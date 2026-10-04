import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Solid primary Continue CTA. Matches the language-step continue button. */
const HEIGHT = 52;

export function OnboardingPrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: Props) {
  const inactive = Boolean(disabled || loading);

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({pressed}) => [
        styles.hit,
        inactive && styles.hitDisabled,
        pressed && !inactive && styles.hitPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: inactive, busy: Boolean(loading)}}>
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: '100%',
    minHeight: HEIGHT,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  hitDisabled: {
    opacity: 0.4,
  },
  hitPressed: {
    opacity: 0.88,
  },
  label: {
    ...typography.bodyBold,
    color: colors.white,
    textAlign: 'center',
  },
});
