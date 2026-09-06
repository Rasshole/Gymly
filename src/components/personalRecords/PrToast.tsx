/**
 * Non-blocking PR celebration toast for live workouts.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {radius, spacing, typography, shadows} from '@/theme/designTokens';

type Props = {
  title: string | null;
  subtitle?: string | null;
  detail?: string | null;
  onHidden?: () => void;
};

export const PrToast: React.FC<Props> = ({
  title,
  subtitle,
  detail,
  onHidden,
}) => {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    if (!title) {
      return;
    }
    opacity.setValue(0);
    translateY.setValue(-8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
      }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -6,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (finished) {
          onHidden?.();
        }
      });
    }, 2400);
    return () => clearTimeout(t);
  }, [title, subtitle, detail, opacity, translateY, onHidden]);

  if (!title) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.host, {top: insets.top + spacing.sm}]}>
      <Animated.View
        style={[styles.card, {opacity, transform: [{translateY}]}]}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
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
    zIndex: 10000,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '33',
    alignItems: 'center',
    minWidth: '70%',
    ...shadows.md,
  },
  title: {
    ...typography.body,
    color: colors.primaryDark,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
