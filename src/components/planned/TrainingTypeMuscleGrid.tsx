/**
 * Fælles 2-kolonne træningstype-grid (Planlagte sessions → Ny session + Inviter til træning).
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {MuscleGroup} from '@/types/workout.types';
import MuscleGroupTileIcon from '@/components/ui/MuscleGroupTileIcon';
import colors from '@/theme/colors';
import {spacing, radius} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';

const MUSCLE_GROUP_KEYS: MuscleGroup[] = [
  'bryst',
  'triceps',
  'skulder',
  'ben',
  'biceps',
  'mave',
  'ryg',
  'cardio',
  'reformer',
  'pilates',
];

const MUSCLE_LABEL_KEYS: Record<MuscleGroup, string> = {
  bryst: 'checkIn.muscleChest',
  triceps: 'checkIn.muscleTriceps',
  skulder: 'checkIn.muscleShoulder',
  ben: 'checkIn.muscleLegs',
  biceps: 'checkIn.muscleBiceps',
  mave: 'checkIn.muscleAbs',
  ryg: 'checkIn.muscleBack',
  cardio: 'checkIn.muscleCardio',
  reformer: 'checkIn.muscleReformer',
  pilates: 'checkIn.musclePilates',
};

/** Afstand mellem kort (krav: 16px) */
const CARD_GAP = spacing.lg;

export type TrainingTypeMuscleGridProps = {
  value: MuscleGroup;
  onChange: (group: MuscleGroup) => void;
};

const TrainingTypeMuscleGrid: React.FC<TrainingTypeMuscleGridProps> = ({
  value,
  onChange,
}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.grid}>
      {MUSCLE_GROUP_KEYS.map(key => {
        const label = t(MUSCLE_LABEL_KEYS[key]);
        const isActive = value === key;
        return (
          <View key={key} style={styles.cellOuter}>
            <TouchableOpacity
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{selected: isActive}}
              accessibilityLabel={label}
              onPress={() => onChange(key)}
              style={[styles.cell, isActive && styles.cellActive]}>
              <MuscleGroupTileIcon
                group={key}
                size={40}
                color={isActive ? '#fff' : colors.textMuted}
                tintColor={isActive ? '#fff' : undefined}
              />
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellOuter: {
    width: '50%',
    paddingHorizontal: CARD_GAP / 2,
    marginBottom: CARD_GAP,
  },
  cell: {
    minHeight: 108,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCardLight,
  },
  cellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 6,
  },
  label: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  labelActive: {
    color: '#fff',
  },
});

export default TrainingTypeMuscleGrid;
