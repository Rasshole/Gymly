/**
 * Fælles 2-kolonne træningstype-grid (Planlagte sessions → Ny session + Inviter til træning).
 */

import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import type {MuscleGroup} from '@/types/workout.types';
import MuscleGroupTileIcon from '@/components/ui/MuscleGroupTileIcon';
import colors from '@/theme/colors';
import {spacing, radius} from '@/theme/designTokens';

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: 'Bryst'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'skulder', label: 'Skulder'},
  {key: 'ben', label: 'Ben'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'mave', label: 'Mave'},
  {key: 'ryg', label: 'Ryg'},
  {key: 'cardio', label: 'Cardio'},
  {key: 'reformer', label: 'Reformer'},
  {key: 'pilates', label: 'Pilates'},
];

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
  return (
    <View style={styles.grid}>
      {MUSCLE_GROUPS.map(item => {
        const isActive = value === item.key;
        return (
          <View key={item.key} style={styles.cellOuter}>
            <TouchableOpacity
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{selected: isActive}}
              accessibilityLabel={item.label}
              onPress={() => onChange(item.key)}
              style={[styles.cell, isActive && styles.cellActive]}>
              <MuscleGroupTileIcon
                group={item.key}
                size={40}
                color={isActive ? '#fff' : colors.textMuted}
                tintColor={isActive ? '#fff' : undefined}
              />
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {item.label}
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
