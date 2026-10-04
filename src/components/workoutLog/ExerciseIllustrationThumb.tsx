/**
 * Thumbnail for exercise selector rows and grid cards.
 * Shows illustration when mapped; otherwise Gymly fallback icon.
 */

import React from 'react';
import {View, Image, StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {radius} from '@/theme/designTokens';
import {getExerciseIllustrationSource} from '@/data/exerciseIllustrations';

export type ExerciseIllustrationThumbProps = {
  exerciseId: string;
  exerciseName: string;
  /** Pixel size for list rows, or `"fill"` to fill the parent (grid cards). */
  size?: number | 'fill';
  style?: StyleProp<ViewStyle>;
};

const ExerciseIllustrationThumb: React.FC<ExerciseIllustrationThumbProps> = ({
  exerciseId,
  exerciseName,
  size = 44,
  style,
}) => {
  const source = getExerciseIllustrationSource({
    id: exerciseId,
    name: exerciseName,
  });
  const fill = size === 'fill';
  const px = fill ? undefined : size;
  const iconSize = fill ? 36 : (size as number) * 0.45;

  return (
    <View
      style={[
        styles.wrap,
        fill
          ? styles.wrapFill
          : {
              width: px,
              height: px,
              borderRadius: Math.min(radius.md, (px as number) * 0.28),
              marginRight: 12,
            },
        style,
      ]}>
      {source ? (
        <Image
          source={source}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name="barbell-outline" size={iconSize} color={colors.primary} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border + '99',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wrapFill: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
    borderRadius: 0,
    marginRight: 0,
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default ExerciseIllustrationThumb;
