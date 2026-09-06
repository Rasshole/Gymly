/**
 * Træningstype-ikon: PNG-muskler + PNG cardio (battle ropes, transparent baggrund).
 */

import React from 'react';
import {
  View,
  Image,
  StyleProp,
  ImageStyle,
  ViewStyle,
} from 'react-native';
import type {MuscleGroup} from '@/types/workout.types';
import muscleImg from '@/utils/muscleGroupImages';
import colors from '@/theme/colors';

const CARDIO_TILE = require('@/assets/muscleGroups/cardio.png');

export type MuscleGroupTileIconProps = {
  group: MuscleGroup;
  size: number;
  /** Ydre layout (fx marginRight ved check-in kort) */
  style?: StyleProp<ViewStyle>;
  /** Muskel-PNG: inaktiv grå / aktiv hvid via tint. Cardio-PNG bruger egne farver (ignoreres til tint). */
  color?: string;
  /** Når sat, tones muskel-PNG (fx hvid på valgt check-in kort) */
  tintColor?: string;
  imageStyle?: StyleProp<ImageStyle>;
};

const MuscleGroupTileIcon: React.FC<MuscleGroupTileIconProps> = ({
  group,
  size,
  style,
  color = colors.textMuted,
  tintColor,
  imageStyle,
}) => {
  const box: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
    },
    style,
  ];

  if (group === 'cardio') {
    const onPurpleCard = tintColor != null;
    return (
      <View style={box}>
        <Image
          source={CARDIO_TILE}
          style={[
            {
              width: size,
              height: size,
              resizeMode: 'contain',
              opacity: onPurpleCard ? 1 : 0.88,
            },
            imageStyle,
          ]}
          resizeMode="contain"
        />
      </View>
    );
  }

  const source = muscleImg.getMuscleGroupImage(group);
  const imageBoxStyle = {width: size, height: size, resizeMode: 'contain' as const};

  // iOS: fjernelse af tint kræver at prop udelades helt — ellers kan ikonet blive blåt/gråt
  // efter valg (fx bryst i Ny session-grid).
  if (tintColor != null) {
    return (
      <View style={box}>
        <Image
          source={source}
          style={[imageBoxStyle, {tintColor}, imageStyle]}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <View style={box}>
      <Image
        source={source}
        style={[imageBoxStyle, imageStyle]}
        resizeMode="contain"
      />
    </View>
  );
};

export default MuscleGroupTileIcon;
