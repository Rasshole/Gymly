/**
 * Avatar – User avatars with fallback initials
 */

import React, {useMemo, useState, useEffect} from 'react';
import {View, Image, Text, StyleSheet, ViewStyle, ActivityIndicator} from 'react-native';
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
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const normalizedUrl = useMemo(() => {
    const raw = (imageUrl ?? '').trim();
    return raw.length > 0 ? raw : null;
  }, [imageUrl]);
  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [normalizedUrl]);
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (normalizedUrl && !imageFailed) {
    return (
      <View
        style={[
          styles.imageWrap,
          {width: dimension, height: dimension, borderRadius: dimension / 2},
          style,
        ]}>
        <Image
          source={{uri: normalizedUrl}}
          style={[
            styles.image,
            {width: dimension, height: dimension, borderRadius: dimension / 2},
          ]}
          resizeMode="cover"
          onLoadEnd={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
        {!imageLoaded ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </View>
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
  imageWrap: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {},
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
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
