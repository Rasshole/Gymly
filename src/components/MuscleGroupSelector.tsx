/**
 * MuscleGroupSelector Component
 * Reusable component for selecting muscle groups
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Image} from 'react-native';
import {MuscleGroup} from '@/types/workout.types';
import {getMuscleGroupImage} from '@/utils/muscleGroupImages';
import {colors} from '@/theme/colors';

const MUSCLE_GROUPS: {key: MuscleGroup; label: string}[] = [
  {key: 'bryst', label: 'Bryst'},
  {key: 'triceps', label: 'Triceps'},
  {key: 'skulder', label: 'Skulder'},
  {key: 'ben', label: 'Ben'},
  {key: 'biceps', label: 'Biceps'},
  {key: 'mave', label: 'Mave'},
  {key: 'ryg', label: 'Ryg'},
  {key: 'hele_kroppen', label: 'Hele kroppen'},
];

interface MuscleGroupSelectorProps {
  selectedMuscles: MuscleGroup[];
  onToggleMuscle: (muscle: MuscleGroup) => void;
  style?: any;
  cardStyle?: any;
  cardActiveStyle?: any;
  imageStyle?: any;
  imageActiveStyle?: any;
  labelStyle?: any;
  labelActiveStyle?: any;
}

const MuscleGroupSelector: React.FC<MuscleGroupSelectorProps> = ({
  selectedMuscles,
  onToggleMuscle,
  style,
  cardStyle,
  cardActiveStyle,
  imageStyle,
  imageActiveStyle,
  labelStyle,
  labelActiveStyle,
}) => {
  return (
    <View style={[styles.muscleGrid, style]}>
      {MUSCLE_GROUPS.map(item => {
        const isActive = selectedMuscles.includes(item.key);
        return (
          <TouchableOpacity
            key={item.key}
            style={[
              styles.muscleCard,
              cardStyle,
              isActive && [styles.muscleCardActive, cardActiveStyle],
            ]}
            onPress={() => onToggleMuscle(item.key)}
            activeOpacity={0.85}>
            <Image
              source={getMuscleGroupImage(item.key)}
              style={[
                styles.muscleImage,
                imageStyle,
                isActive && [styles.muscleImageActive, imageActiveStyle],
              ]}
              resizeMode="contain"
            />
            <Text
              style={[
                styles.muscleLabel,
                labelStyle,
                isActive && [styles.muscleLabelActive, labelActiveStyle],
              ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  muscleCard: {
    width: '22%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
  },
  muscleCardActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  muscleImage: {
    width: 28,
    height: 28,
  },
  muscleImageActive: {
    tintColor: '#fff',
  },
  muscleLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  muscleLabelActive: {
    color: '#fff',
  },
});

export default MuscleGroupSelector;

