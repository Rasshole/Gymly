/**
 * FilterChips – Row of filter chips (Alle, Venner, Lokal, etc.)
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  Text,
} from 'react-native';
import Chip from './Chip';
import {spacing} from '@/theme/designTokens';
import colors from '@/theme/colors';

export type FilterOption<T = string> = {
  value: T;
  label: string;
};

type FilterChipsProps<T = string> = {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
  /** `segmented` = full-height pills for Online (Venner / Alle) */
  appearance?: 'default' | 'segmented';
};

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  style,
  appearance = 'default',
}: FilterChipsProps<T>) {
  if (appearance === 'segmented') {
    return (
      <View style={[styles.segmentedRow, style]}>
        {options.map(opt => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.85}
              onPress={() => onChange(opt.value)}
              style={[
                styles.segmentPill,
                selected ? styles.segmentPillActive : styles.segmentPillIdle,
              ]}
              accessibilityRole="button"
              accessibilityState={{selected}}>
              <Text
                style={[
                  styles.segmentLabel,
                  selected && styles.segmentLabelActive,
                ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {options.map(opt => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={value === opt.value}
          variant="outline"
          onPress={() => onChange(opt.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  segmentPill: {
    minHeight: 36,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentPillIdle: {
    backgroundColor: '#F2F2F7',
  },
  segmentPillActive: {
    backgroundColor: colors.primary + '22',
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  segmentLabelActive: {
    color: colors.primary,
  },
});
