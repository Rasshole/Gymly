/**
 * Chip – Filter chips, tags
 */

import React from 'react';
import {TouchableOpacity, Text, StyleSheet, ViewStyle} from 'react-native';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

type ChipVariant = 'filled' | 'outline';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  variant?: ChipVariant;
  style?: ViewStyle;
};

const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onPress,
  variant = 'filled',
  style,
}) => {
  const chipStyle = [
    styles.chip,
    selected && (variant === 'outline' ? styles.chipSelectedOutline : styles.chipSelected),
    style,
  ];
  const labelStyle = [
    styles.label,
    selected && (variant === 'outline' ? styles.labelSelectedOutline : styles.labelSelected),
  ];
  return (
    <TouchableOpacity
      style={chipStyle}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress}>
      <Text style={labelStyle}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipSelectedOutline: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary + '60',
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.white,
  },
  labelSelectedOutline: {
    color: colors.primary,
  },
});

export default Chip;
