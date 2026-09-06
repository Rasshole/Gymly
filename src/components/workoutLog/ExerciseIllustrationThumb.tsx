/**
 * Thumbnail for exercise selector rows.
 * Shows illustration when mapped; otherwise Gymly fallback icon.
 */

import React from 'react';
import {View, Image, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {radius} from '@/theme/designTokens';
import {getExerciseIllustrationSource} from '@/data/exerciseIllustrations';

export type ExerciseIllustrationThumbProps = {
  exerciseId: string;
  exerciseName: string;
  size?: number;
};

const ExerciseIllustrationThumb: React.FC<ExerciseIllustrationThumbProps> = ({
  exerciseId,
  exerciseName,
  size = 44,
}) => {
  const source = getExerciseIllustrationSource({
    id: exerciseId,
    name: exerciseName,
  });

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: Math.min(radius.md, size * 0.28),
        },
      ]}>
      {source ? (
        <Image
          source={source}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name="barbell-outline" size={size * 0.45} color={colors.primary} />
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
    marginRight: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default ExerciseIllustrationThumb;
