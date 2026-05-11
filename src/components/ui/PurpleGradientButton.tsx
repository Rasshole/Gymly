/**
 * Primær CTA med blød lilla gradient (Gymly-identitet).
 */

import React, {useId, useState, useCallback} from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import colors from '@/theme/colors';

type Props = {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  activeOpacity?: number;
};

export function PurpleGradientButton({
  onPress,
  children,
  style,
  disabled,
  activeOpacity = 0.88,
}: Props) {
  const raw = useId().replace(/:/g, '');
  const gradId = `pgbtn_${raw}`;
  const [size, setSize] = useState({w: 1, h: 50});

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({w: width, h: height});
    }
  }, []);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={activeOpacity}
      onPress={onPress}
      disabled={disabled}
      style={[styles.touch, disabled && styles.touchDisabled, style]}
      onLayout={onLayout}>
      <View style={styles.clip}>
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.primaryLight} />
              <Stop offset="48%" stopColor={colors.primary} />
              <Stop offset="100%" stopColor={colors.primaryDark} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} rx={12} fill={`url(#${gradId})`} />
        </Svg>
        <View style={styles.row} pointerEvents="none">
          {children}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    borderRadius: 12,
    minHeight: 50,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  clip: {
    borderRadius: 12,
    overflow: 'hidden',
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  touchDisabled: {
    opacity: 0.48,
  },
});
