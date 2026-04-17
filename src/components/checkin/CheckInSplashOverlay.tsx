/**
 * Fuldskærm splash ved tjek ind — Gymly kettlebell + bløde ringe
 */

import React, {useEffect, useRef} from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import colors from '@/theme/colors';

const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');
const LOGO_MAX = Math.min(SCREEN_W, SCREEN_H) * 0.38;

type Props = {
  visible: boolean;
  /** Kaldes når fade-out er færdig (skjul overlay) */
  onHidden: () => void;
};

export const CheckInSplashOverlay: React.FC<Props> = ({visible, onHidden}) => {
  const backdrop = useSharedValue(0);
  const logoScale = useSharedValue(0.35);
  const logoOpacity = useSharedValue(0);
  const ring = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      backdrop.value = 0;
      logoScale.value = 0.35;
      logoOpacity.value = 0;
      ring.value = 0;
      ring2.value = 0;
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      return;
    }

    ring.value = 0;
    ring2.value = 0;
    backdrop.value = 0;
    logoScale.value = 0.35;
    logoOpacity.value = 0;

    backdrop.value = withTiming(1, {duration: 220, easing: Easing.out(Easing.cubic)});
    logoOpacity.value = withTiming(1, {duration: 180});
    logoScale.value = withSpring(1, {damping: 14, stiffness: 220, mass: 0.8});
    ring.value = withTiming(1, {duration: 900, easing: Easing.out(Easing.quad)});
    ring2.value = withDelay(
      120,
      withTiming(1, {duration: 900, easing: Easing.out(Easing.quad)}),
    );

    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      logoOpacity.value = withTiming(0, {duration: 260});
      logoScale.value = withTiming(0.94, {duration: 260});
      backdrop.value = withTiming(
        0,
        {duration: 300, easing: Easing.in(Easing.cubic)},
        finished => {
          if (finished) runOnJS(onHidden)();
        },
      );
    }, 760);

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [visible, backdrop, logoScale, logoOpacity, ring, ring2, onHidden]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.92,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{scale: logoScale.value}],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.35, 1], [0.55, 0.25, 0]),
    transform: [
      {
        scale: interpolate(ring.value, [0, 1], [0.65, 2.4]),
      },
    ],
  }));

  const ring2Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring2.value, [0, 0.4, 1], [0.4, 0.18, 0]),
    transform: [
      {
        scale: interpolate(ring2.value, [0, 1], [0.5, 2.1]),
      },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onHidden}>
      <Pressable style={styles.pressBlock} onPress={() => {}}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <View style={styles.center} pointerEvents="none">
          <Animated.View style={[styles.ring, ring2Style]} />
          <Animated.View style={[styles.ring, ring1Style]} />
          <Animated.View style={logoStyle}>
            <Image
              source={require('@/assets/images/gymly-kettlebell-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  pressBlock: {
    width: SCREEN_W,
    height: SCREEN_H,
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: LOGO_MAX * 1.1,
    height: LOGO_MAX * 1.1,
    borderRadius: LOGO_MAX,
    borderWidth: 2,
    borderColor: colors.primary + 'AA',
  },
  logo: {
    width: LOGO_MAX,
    height: LOGO_MAX,
  },
});

export default CheckInSplashOverlay;
