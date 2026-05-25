/**
 * Pressable with spring scale + optional haptic — use for premium taps app-wide.
 */

import React, {useRef} from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {animation} from '@/theme/designTokens';
import {triggerHaptic, type HapticKind} from '@/utils/haptics';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  haptic?: HapticKind | false;
  scaleTo?: number;
};

export function GymlyPressable({
  children,
  style,
  haptic = 'light',
  scaleTo = animation.pressScale,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[{transform: [{scale}]}, style]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPress={e => {
          if (haptic !== false && !disabled) {
            triggerHaptic(haptic);
          }
          onPress?.(e);
        }}
        onPressIn={e => {
          if (!disabled) {
            Animated.spring(scale, {
              toValue: scaleTo,
              ...animation.springSnappy,
              useNativeDriver: true,
            }).start();
          }
          onPressIn?.(e);
        }}
        onPressOut={e => {
          Animated.spring(scale, {
            toValue: 1,
            ...animation.springSoft,
            useNativeDriver: true,
          }).start();
          onPressOut?.(e);
        }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
