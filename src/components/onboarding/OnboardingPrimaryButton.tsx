import React, {useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT = 56;

export function OnboardingPrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (disabled || loading) {
      return;
    }
    Animated.spring(scale, {toValue: 0.97, friction: 8, tension: 280, useNativeDriver: true}).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {toValue: 1, friction: 5, tension: 160, useNativeDriver: true}).start();
  };

  return (
    <Animated.View style={[styles.wrap, style, {transform: [{scale}]}]}>
      {!disabled ? <View style={styles.glow} pointerEvents="none" /> : null}
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled || loading}
        style={[styles.hit, disabled ? styles.hitDisabled : styles.hitEnabled]}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <View style={styles.sheen} pointerEvents="none" />
        <View style={styles.inner}>
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.label}>{label}</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: spacing.sm,
  },
  glow: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
    bottom: -4,
    borderRadius: 26,
    backgroundColor: colors.primary,
    opacity: 0.22,
    transform: [{scaleY: 1.08}],
  },
  hit: {
    minHeight: HEIGHT,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hitEnabled: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDark,
        shadowOffset: {width: 0, height: 10},
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: {elevation: 8},
    }),
  },
  hitDisabled: {
    backgroundColor: '#C4B5FD',
    opacity: 0.55,
    ...Platform.select({
      ios: {shadowOpacity: 0},
      android: {elevation: 0},
    }),
  },
  sheen: {
    position: 'absolute',
    top: 6,
    left: 22,
    right: 22,
    height: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  inner: {
    minHeight: HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  label: {
    ...typography.bodyBold,
    fontSize: 17,
    color: colors.white,
    letterSpacing: -0.2,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.12)',
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 2,
      },
    }),
  },
});
