/**
 * Premium floating compose button for Beskeder.
 */
import React, {useRef} from 'react';
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

const FAB_SIZE = 60;
const ICON_SIZE = 26;

type Props = {
  onPress: () => void;
  bottom: number;
  right?: number;
};

export function ComposeMessageFab({onPress, bottom, right = 16}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      friction: 8,
      tension: 220,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.outer,
        {
          right,
          bottom,
          transform: [{scale}],
        },
      ]}>
      <View style={styles.glowRing} pointerEvents="none" />
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel="Ny besked"
        style={styles.hit}>
        <View style={styles.shadowLayer} />
        <Svg width={FAB_SIZE} height={FAB_SIZE} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="fabGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.primaryLight} />
              <Stop offset="0.45" stopColor={colors.primary} />
              <Stop offset="1" stopColor={colors.primaryDark} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={FAB_SIZE / 2}
            cy={FAB_SIZE / 2}
            r={FAB_SIZE / 2 - 1}
            fill="url(#fabGrad)"
          />
        </Svg>
        <View style={styles.glassHighlight} pointerEvents="none" />
        <Icon name="create" size={ICON_SIZE} color={colors.white} style={styles.icon} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 20,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    opacity: 0.22,
    transform: [{scale: 1.18}],
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.55,
        shadowRadius: 16,
      },
      android: {elevation: 10},
    }),
  },
  hit: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_SIZE / 2,
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDark,
        shadowOffset: {width: 0, height: 10},
        shadowOpacity: 0.38,
        shadowRadius: 14,
      },
      android: {elevation: 12},
    }),
  },
  glassHighlight: {
    position: 'absolute',
    top: 6,
    left: 10,
    right: 10,
    height: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  icon: {
    marginTop: 1,
    marginLeft: 1,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
});
