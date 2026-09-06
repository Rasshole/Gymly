/**
 * Solid / gradient fill for non-transparent share backgrounds.
 * Avoids adding react-native-linear-gradient — layered Views approximate purple blend.
 */

import React from 'react';
import {View, StyleSheet} from 'react-native';
import colors from '@/theme/colors';
import type {ShareWorkoutBackground} from '@/types/shareWorkout.types';

type Props = {
  variant: Exclude<ShareWorkoutBackground, 'transparent' | 'photo'>;
};

const ShareWorkoutBackgroundFill: React.FC<Props> = ({variant}) => {
  if (variant === 'white') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.white]} />;
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.purpleBase]}>
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />
      <View style={[styles.blob, styles.blobMid]} />
    </View>
  );
};

const styles = StyleSheet.create({
  white: {
    backgroundColor: colors.white,
  },
  purpleBase: {
    backgroundColor: colors.primaryVeryDark,
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.55,
  },
  blobTop: {
    width: 900,
    height: 900,
    top: -220,
    left: -180,
    backgroundColor: colors.primary,
  },
  blobMid: {
    width: 700,
    height: 700,
    top: 520,
    right: -260,
    backgroundColor: colors.primaryLight,
    opacity: 0.35,
  },
  blobBottom: {
    width: 1000,
    height: 1000,
    bottom: -360,
    left: -120,
    backgroundColor: '#4C1D95',
  },
});

export default ShareWorkoutBackgroundFill;
