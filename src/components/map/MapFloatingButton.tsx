/**
 * Premium glass-style floating map control (layers, locate, etc.).
 */
import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import colors from '@/theme/colors';

const BTN_SIZE = 58;
const ICON_SIZE = 25;

type Props = {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** Visuelt “aktiv” (fx korttype-menu åben). */
  active?: boolean;
};

export function MapFloatingButton({
  icon,
  onPress,
  accessibilityLabel,
  active = false,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const gradId = useRef(`mapFab_${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      friction: 8,
      tension: 240,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.outer, {transform: [{scale}]}]}>
      <View
        style={[styles.glowRing, active && styles.glowRingActive]}
        pointerEvents="none"
      />
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.hit, active && styles.hitActive]}>
        <View style={styles.fallbackFill} />
        <View style={styles.shadowLayer} />
        <Svg width={BTN_SIZE} height={BTN_SIZE} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.primaryLight} />
              <Stop offset="0.5" stopColor={colors.primary} />
              <Stop offset="1" stopColor={colors.primaryDark} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={BTN_SIZE / 2}
            cy={BTN_SIZE / 2}
            r={BTN_SIZE / 2 - 1}
            fill={`url(#${gradId})`}
          />
        </Svg>
        <View style={styles.glassHighlight} pointerEvents="none" />
        <View style={styles.glassRim} pointerEvents="none" />
        <View style={styles.iconWrap}>
          <Icon name={icon} size={ICON_SIZE} color={colors.white} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: BTN_SIZE,
    height: BTN_SIZE,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: colors.primary,
    opacity: 0.2,
    transform: [{scale: 1.16}],
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.45,
        shadowRadius: 14,
      },
      android: {elevation: 8},
    }),
  },
  glowRingActive: {
    opacity: 0.32,
    transform: [{scale: 1.22}],
  },
  hit: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  fallbackFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary,
    borderRadius: BTN_SIZE / 2,
  },
  iconWrap: {
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitActive: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  shadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BTN_SIZE / 2,
    ...Platform.select({
      ios: {
        shadowColor: '#4C1D95',
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {elevation: 10},
    }),
  },
  glassHighlight: {
    position: 'absolute',
    top: 5,
    left: 9,
    right: 9,
    height: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  glassRim: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: BTN_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
