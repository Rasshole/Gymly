/**
 * Short rising 💪 burst for notification tap feedback (respects reduce motion).
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, AccessibilityInfo} from 'react-native';

type Props = {
  token: number;
  onDone?: () => void;
};

export function BicepsBurst({token, onDone}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    opacity.setValue(1);
    translateY.setValue(0);
    scale.setValue(0.85);

    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => {
        if (cancelled) {
          return;
        }
        if (reduce) {
          opacity.setValue(1);
          Animated.sequence([
            Animated.delay(120),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 160,
              useNativeDriver: true,
            }),
          ]).start(({finished}) => {
            if (finished) {
              onDone?.();
            }
          });
          return;
        }
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -36,
            duration: 520,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.spring(scale, {
              toValue: 1.15,
              friction: 5,
              tension: 140,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 280,
              delay: 120,
              useNativeDriver: true,
            }),
          ]),
        ]).start(({finished}) => {
          if (finished) {
            onDone?.();
          }
        });
      })
      .catch(() => {
        onDone?.();
      });

    return () => {
      cancelled = true;
    };
  }, [token, opacity, translateY, scale, onDone]);

  if (!token) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.burst,
        {
          opacity,
          transform: [{translateY}, {scale}],
        },
      ]}>
      <Text style={styles.emoji}>💪</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  burst: {
    position: 'absolute',
    left: 10,
    top: -4,
    zIndex: 5,
  },
  emoji: {
    fontSize: 22,
  },
});
