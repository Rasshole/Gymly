import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

type Props = {
  message: string | null;
  onHidden?: () => void;
};

export const GymlyToast: React.FC<Props> = ({message, onHidden}) => {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!message) {
      return;
    }
    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}),
      Animated.spring(translateY, {toValue: 0, useNativeDriver: true, friction: 8}),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {toValue: 0, duration: 180, useNativeDriver: true}),
        Animated.timing(translateY, {toValue: 8, duration: 180, useNativeDriver: true}),
      ]).start(({finished}) => {
        if (finished) {
          onHidden?.();
        }
      });
    }, 2200);
    return () => clearTimeout(t);
  }, [message, opacity, translateY, onHidden]);

  if (!message) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.host, {bottom: insets.bottom + 88}]}>
      <Animated.View style={[styles.pill, {opacity, transform: [{translateY}]}]}>
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    maxWidth: '100%',
    ...typography.caption,
  },
  text: {
    color: colors.white,
    fontWeight: '600',
    textAlign: 'center',
  },
});
