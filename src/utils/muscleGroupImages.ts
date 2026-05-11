/**
 * Muscle Group Images
 * Utility for getting muscle group images
 */

import {ImageSourcePropType} from 'react-native';
import {MuscleGroup} from '@/types/workout.types';

// Import muscle group images
const muscleGroupImages: Record<MuscleGroup, ImageSourcePropType> = {
  bryst: require('@/assets/muscleGroups/bryst.png'),
  triceps: require('@/assets/muscleGroups/triceps.png'),
  skulder: require('@/assets/muscleGroups/skulder.png'),
  ben: require('@/assets/muscleGroups/ben.png'),
  biceps: require('@/assets/muscleGroups/biceps.png'),
  mave: require('@/assets/muscleGroups/mave.png'),
  ryg: require('@/assets/muscleGroups/ryg.png'),
  cardio: require('@/assets/muscleGroups/cardio.png'),
  reformer: require('@/assets/muscleGroups/reformer.png'),
  pilates: require('@/assets/muscleGroups/pilates.png'),
};

/**
 * Get the image source for a muscle group
 */
export const getMuscleGroupImage = (muscleGroup: MuscleGroup): ImageSourcePropType => {
  return muscleGroupImages[muscleGroup];
};

/**
 * Get muscle group image from string (for compatibility with older code)
 */
export const getMuscleGroupImageFromString = (muscleGroup: string): ImageSourcePropType | null => {
  const first = muscleGroup.split(',')[0]?.trim() ?? muscleGroup;
  let raw = first.toLowerCase().replace(/\s+/g, '_');
  if (raw === 'hele_kroppen') {
    raw = 'cardio';
  }
  const key = raw as MuscleGroup;
  return muscleGroupImages[key] || null;
};

/**
 * Default export: API + map — Hermes/Metro kan undlade named exports på namespace-import;
 * `import muscle from '...'` er stabil.
 */
const muscleGroupImagesDefault = {
  muscleGroupImages,
  getMuscleGroupImage,
  getMuscleGroupImageFromString,
};

export default muscleGroupImagesDefault;





