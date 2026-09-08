/**
 * iOS-style segmented control — sliding pill (tabs) or chip row (filters).
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, animation} from '@/theme/designTokens';
import {GymlyPressable} from './GymlyPressable';
import {triggerHaptic} from '@/utils/haptics';

export type Segment<T extends string> = {
  key: T;
  label: string;
  icon?: string;
};

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  variant?: 'tabs' | 'chips';
  style?: StyleProp<ViewStyle>;
  scrollableChips?: boolean;
};

/** Equal tab width inside the track (accounts for track padding). */
export function segmentedTabWidth(trackWidth: number, segmentCount: number): number {
  if (trackWidth <= 0 || segmentCount <= 0) {
    return 0;
  }
  return (trackWidth - 6) / segmentCount;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  variant = 'tabs',
  style,
  scrollableChips = false,
}: Props<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const slideX = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(
    0,
    segments.findIndex(s => s.key === value),
  );

  useEffect(() => {
    if (variant !== 'tabs' || trackWidth <= 0 || segments.length === 0) {
      return;
    }
    const segmentW = segmentedTabWidth(trackWidth, segments.length);
    Animated.spring(slideX, {
      toValue: activeIndex * segmentW,
      ...animation.springSnappy,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slideX, segments.length, trackWidth, variant]);

  const select = (key: T) => {
    if (key === value) {
      return;
    }
    triggerHaptic('selection');
    onChange(key);
  };

  if (variant === 'chips') {
    const chips = segments.map(seg => {
      const active = seg.key === value;
      return (
        <GymlyPressable
          key={seg.key}
          onPress={() => select(seg.key)}
          haptic={false}
          style={[styles.chip, active && styles.chipActive]}>
          <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
            {seg.label}
          </Text>
        </GymlyPressable>
      );
    });

    if (scrollableChips) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipsRow, style]}
          style={styles.chipsScroll}>
          {chips}
        </ScrollView>
      );
    }

    return <View style={[styles.chipsRow, style]}>{chips}</View>;
  }

  const segmentW = segmentedTabWidth(trackWidth, segments.length);

  return (
    <View
      style={[styles.tabTrack, style]}
      onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist">
      {segmentW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabSlider,
            {
              width: segmentW,
              transform: [{translateX: slideX}],
            },
          ]}
        />
      ) : null}
      {segments.map(seg => {
        const active = seg.key === value;
        return (
          <View key={seg.key} style={styles.tabSlot}>
            <Pressable
              onPress={() => select(seg.key)}
              style={styles.tabBtn}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              accessibilityLabel={seg.label}
              testID={`segment-tab-${seg.key}`}>
              <View style={styles.tabContent} testID={`segment-tab-content-${seg.key}`}>
                {seg.icon ? (
                  <Icon
                    name={seg.icon as never}
                    size={17}
                    color={active ? colors.white : colors.textSecondary}
                    style={styles.tabIcon}
                  />
                ) : null}
                <Text
                  style={[styles.tabLabel, active && styles.tabLabelActive]}
                  numberOfLines={1}>
                  {seg.label}
                </Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabTrack: {
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
    padding: 3,
    backgroundColor: '#EFEFF4',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabSlider: {
    position: 'absolute',
    top: 3,
    left: 3,
    height: '86%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    ...shadows.glow,
  },
  /** Equal-width slot — flex lives here, not inside GymlyPressable's scale wrapper. */
  tabSlot: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  tabBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
    paddingHorizontal: spacing.xs,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabLabel: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  tabLabelActive: {
    color: colors.white,
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: colors.primary,
    ...shadows.sm,
  },
  chipLabel: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
