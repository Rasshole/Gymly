/**
 * Small “live / training nu” marker (iMessage-style green dot).
 * Use on avatars for users with an active check-in; hide when session ends.
 */

import React from 'react';
import {View, StyleSheet, Platform, type ViewStyle} from 'react-native';
import colors from '@/theme/colors';

export type LiveTrainingDotProps = {
  /** Outer diameter in px */
  size?: number;
  /** Ring color — match avatar/card surface behind the dot */
  borderColor?: string;
  style?: ViewStyle;
};

export const LiveTrainingDot: React.FC<LiveTrainingDotProps> = ({
  size = 12,
  borderColor = colors.backgroundCard,
  style,
}) => {
  const borderWidth = Math.max(2, Math.round(size * 0.2));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {
    backgroundColor: '#34C759',
    ...Platform.select({
      ios: {
        shadowColor: '#15803d',
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.4,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
});
