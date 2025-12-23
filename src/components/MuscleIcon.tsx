import React from 'react';
import {View, StyleSheet, Image, ImageStyle} from 'react-native';
import {MuscleGroup} from '@/types/workout.types';

type MuscleIconProps = {
  muscle: MuscleGroup;
  size?: number;
  color?: string;
};

const MuscleIcon: React.FC<MuscleIconProps> = ({
  muscle,
  size = 24,
  color = '#007AFF',
}) => {
  const getIconSource = () => {
    switch (muscle) {
      case 'bryst':
        return require('@/assets/images/muscle-bryst.png');
      case 'triceps':
        return require('@/assets/images/muscle-triceps.png');
      case 'skulder':
        return require('@/assets/images/muscle-skulder.png');
      case 'ben':
        return require('@/assets/images/muscle-ben.png');
      case 'biceps':
        return require('@/assets/images/muscle-biceps.png');
      case 'mave':
        return require('@/assets/images/muscle-mave.png');
      case 'ryg':
        return require('@/assets/images/muscle-ryg.png');
      case 'hele_kroppen':
        return require('@/assets/images/muscle-hele-kroppen.png');
      default:
        return null;
    }
  };

  const iconSource = getIconSource();

  if (!iconSource) {
    return null;
  }

  // Scale icons ensartet så alle muskelgrupper har samme visuelle størrelse
  const finalSize = size * 2.5;

  const imageStyle: ImageStyle = {
    width: finalSize,
    height: finalSize,
    tintColor: color !== '#007AFF' && color !== '#fff' ? color : undefined,
    resizeMode: 'contain',
  };

  return (
    <View style={[styles.container, {width: finalSize, height: finalSize}]}>
      <Image
        source={iconSource}
        style={imageStyle}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MuscleIcon;
