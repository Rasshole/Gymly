/**
 * Image-first exercise card for the Add Exercise 2-column grid.
 * Reuses Gymly illustration resolution + display-name / muscle labels.
 */

import React, {memo, useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import type {ExerciseLibraryItem} from '@/types/workoutLog.types';
import {muscleGroupLabelDa} from '@/utils/workoutLogFormat';
import {getExerciseDisplayName} from '@/i18n/exerciseNames';
import {useTranslation} from '@/i18n';
import ExerciseIllustrationThumb from '@/components/workoutLog/ExerciseIllustrationThumb';

export type ExerciseGridCardProps = {
  exercise: ExerciseLibraryItem;
  onPress: (exercise: ExerciseLibraryItem) => void;
};

const ExerciseGridCard: React.FC<ExerciseGridCardProps> = memo(
  ({exercise, onPress}) => {
    const {t, language} = useTranslation();
    const name = getExerciseDisplayName({
      exerciseId: exercise.id,
      fallbackName: exercise.name,
      language,
    });
    const muscle = muscleGroupLabelDa(exercise.muscleGroup);
    const meta = exercise.isCustom
      ? `${muscle} · ${t('workoutLog.customBadge')}`
      : muscle;

    const handlePress = useCallback(() => {
      onPress(exercise);
    }, [exercise, onPress]);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${meta}`}>
        <View style={styles.imageWell}>
          <ExerciseIllustrationThumb
            exerciseId={exercise.id}
            exerciseName={exercise.name}
            size="fill"
          />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

ExerciseGridCard.displayName = 'ExerciseGridCard';

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border + '99',
  },
  imageWell: {
    width: '100%',
    // Slightly shorter than square → denser vertical browsing (~2×3 visible).
    aspectRatio: 0.92,
    backgroundColor: colors.backgroundCardLight ?? colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.sm - 2,
    minHeight: 44,
  },
  name: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 17,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
});

export default ExerciseGridCard;
