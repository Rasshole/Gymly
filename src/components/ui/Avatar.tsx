/**
 * Avatar – User avatars with fallback initials
 */

import React from 'react';
import {View, Image, Text, StyleSheet, ViewStyle} from 'react-native';
import colors from '@/theme/colors';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const sizeMap = {xs: 24, sm: 32, md: 40, lg: 64, xl: 96};

type AvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  style?: ViewStyle;
};

const Avatar: React.FC<AvatarProps> = ({
  name,
  imageUrl,
  size = 'md',
  style,
}) => {
  const dimension = sizeMap[size];
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (imageUrl) {
    return (
      <Image
        source={{uri: imageUrl}}
        style={[
          styles.image,
          {width: dimension, height: dimension, borderRadius: dimension / 2},
          style,
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {width: dimension, height: dimension, borderRadius: dimension / 2},
        style,
      ]}>
      <Text
        style={[
          styles.initials,
          {fontSize: dimension * 0.4},
        ]}>
        {initials || '?'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {},
  placeholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default Avatar;
