import React from 'react';
import {View, StyleSheet} from 'react-native';
import colors from '@/theme/colors';
import {sheet, spacing} from '@/theme/designTokens';

export function SheetHandle() {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no">
      <View style={styles.bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  bar: {
    width: sheet.handleWidth,
    height: sheet.handleHeight,
    borderRadius: sheet.handleRadius,
    backgroundColor: colors.border,
    opacity: 0.9,
  },
});
