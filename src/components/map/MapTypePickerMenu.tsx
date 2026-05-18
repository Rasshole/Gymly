/**
 * Korttype-vælger (Standard / Satellit / Hybrid / Terræn).
 */
import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  Platform,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import colors from '@/theme/colors';
import {radius, spacing} from '@/theme/designTokens';

export type MapTypeValue = 'standard' | 'satellite' | 'hybrid' | 'terrain';

const OPTIONS: {value: MapTypeValue; label: string}[] = [
  {value: 'standard', label: 'Standard'},
  {value: 'satellite', label: 'Satellit'},
  {value: 'hybrid', label: 'Hybrid'},
  {value: 'terrain', label: 'Terræn'},
];

type Props = {
  visible: boolean;
  value: MapTypeValue;
  onSelect: (value: MapTypeValue) => void;
  onClose: () => void;
  menuStyle?: StyleProp<ViewStyle>;
};

export function MapTypePickerMenu({
  visible,
  value,
  onSelect,
  onClose,
  menuStyle,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.94);
      translateY.setValue(8);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, scale, translateY]);

  if (!visible) {
    return null;
  }

  return (
    <>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[
          styles.menu,
          menuStyle,
          {
            opacity,
            transform: [{scale}, {translateY}],
          },
        ]}>
        {OPTIONS.map(opt => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={({pressed}) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 98,
  },
  menu: {
    position: 'absolute',
    right: spacing.lg,
    minWidth: 168,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.xl,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    zIndex: 260,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 8},
        shadowOpacity: 0.14,
        shadowRadius: 20,
      },
      android: {elevation: 12},
    }),
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.xs,
    borderRadius: radius.lg,
  },
  optionSelected: {
    backgroundColor: colors.primary + '12',
  },
  optionPressed: {
    opacity: 0.85,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginLeft: spacing.sm,
    letterSpacing: -0.2,
  },
  optionLabelSelected: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
