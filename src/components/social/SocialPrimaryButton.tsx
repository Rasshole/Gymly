import React, {useCallback, useId, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  StyleSheet,
  View,
  Platform,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import colors from '@/theme/colors';
import {typography} from '@/theme/designTokens';
import {SOCIAL_PRIMARY_MIN_HEIGHT, SOCIAL_PRIMARY_RADIUS} from './socialUiTokens';

export type SocialPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  iconName?: string;
  style?: StyleProp<ViewStyle>;
  /** Premium gradient + gloss (Beskeder FAB style) */
  variant?: 'flat' | 'premium';
};

const PREMIUM_HEIGHT = 54;

const SocialPrimaryButton: React.FC<SocialPrimaryButtonProps> = ({
  label,
  onPress,
  disabled,
  loading,
  iconName,
  style,
  variant = 'flat',
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const isPremium = variant === 'premium';
  const gradId = useId().replace(/:/g, '');
  const [size, setSize] = useState({w: 1, h: PREMIUM_HEIGHT});

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({w: width, h: height});
    }
  }, []);

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 8,
      tension: 280,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 160,
    }).start();
  };

  return (
    <Animated.View style={[{transform: [{scale}]}, style]}>
      {isPremium ? <View style={styles.premiumGlow} pointerEvents="none" /> : null}
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onLayout={isPremium ? onLayout : undefined}
        disabled={disabled || loading}
        style={({pressed}) => [
          isPremium ? styles.btnPremium : styles.btn,
          (disabled || loading) && styles.btnDisabled,
          pressed && !disabled && !loading && styles.btnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}>
        {isPremium ? (
          <>
            <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.primaryLight} />
                  <Stop offset="45%" stopColor={colors.primary} />
                  <Stop offset="100%" stopColor={colors.primaryDark} />
                </LinearGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={size.w}
                height={size.h}
                rx={SOCIAL_PRIMARY_RADIUS}
                fill={`url(#${gradId})`}
              />
            </Svg>
            <View style={styles.premiumSheen} pointerEvents="none" />
          </>
        ) : null}
        <View style={styles.inner}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.label}>{label}</Text>
            </>
          ) : (
            <>
              {iconName ? (
                <Icon name={iconName as never} size={22} color={colors.white} />
              ) : null}
              <Text style={styles.label}>{label}</Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    minHeight: SOCIAL_PRIMARY_MIN_HEIGHT,
    borderRadius: SOCIAL_PRIMARY_RADIUS,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPremium: {
    width: '100%',
    minHeight: PREMIUM_HEIGHT,
    borderRadius: SOCIAL_PRIMARY_RADIUS,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDark,
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.32,
        shadowRadius: 14,
      },
      android: {elevation: 8},
    }),
  },
  premiumGlow: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 8,
    bottom: -2,
    borderRadius: SOCIAL_PRIMARY_RADIUS,
    backgroundColor: colors.primary,
    opacity: 0.2,
  },
  premiumSheen: {
    position: 'absolute',
    top: 6,
    left: 24,
    right: 24,
    height: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPressed: {
    opacity: 0.94,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 1,
  },
  label: {
    ...typography.bodyBold,
    fontSize: 16,
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

export default SocialPrimaryButton;
