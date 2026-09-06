/**
 * Premium glass-style floating map control (layers, locate, etc.).
 */
import React, {useEffect, useMemo, useRef} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';

/** Compact circular control — matches compass stack rhythm. */
export const MAP_FAB_SIZE = 44;
export const MAP_FAB_ICON_SIZE = 22;
/** Vertical gap between map FABs (and below compass). */
export const MAP_FAB_GAP = 10;

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
  const styles = useMemo(() => createStyles(MAP_FAB_SIZE), []);

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
      toValue: 0.92,
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
    <Animated.View
      style={[
        styles.outer,
        {
          opacity: entrance,
          transform: [
            {scale},
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityState={active ? {selected: true} : {}}
        accessibilityLabel={accessibilityLabel}
        hitSlop={6}
        style={[styles.hit, active && styles.hitActive]}>
        <Icon name={icon} size={MAP_FAB_ICON_SIZE} color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
}

function createStyles(size: number) {
  return StyleSheet.create({
    outer: {
      width: size,
      height: size,
    },
    hit: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(15, 23, 42, 0.12)',
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.12,
          shadowRadius: 4,
        },
        android: {elevation: 3},
      }),
    },
    hitActive: {
      borderColor: colors.primary,
      borderWidth: 1.5,
      backgroundColor: '#F8FAFC',
    },
  });
}
