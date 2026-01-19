/**
 * Loading Spinner Component
 * Consistent loading indicator
 */

import React from 'react';
import {View, ActivityIndicator, StyleSheet, Text} from 'react-native';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  message?: string;
  fullScreen?: boolean;
}

const LoadingSpinner = ({
  size = 'large',
  color = colors.primary,
  message,
  fullScreen = false,
}: LoadingSpinnerProps) => {
  const container = fullScreen ? styles.fullScreen : styles.container;

  return (
    <View style={container}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});

export default LoadingSpinner;




