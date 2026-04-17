/**
 * FilterChips – Row of filter chips (Alle, Venner, Lokal, etc.)
 */

import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import Chip from './Chip';
import {spacing} from '@/theme/designTokens';

export type FilterOption<T = string> = {
  value: T;
  label: string;
};

type FilterChipsProps<T = string> = {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
};

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  style,
}: FilterChipsProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map((opt) => (
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
});
