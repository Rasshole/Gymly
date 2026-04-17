/**
 * GymLogoView – Shared gym logo component
 * Priority: local asset → remote URL → clean fallback (initials)
 */

import React, {useState} from 'react';
import {View, Text, Image, StyleSheet, ImageSourcePropType} from 'react-native';
import {
  getLogoSource,
  getLogoFallbackInitials,
  type LogoSource,
} from '@/services/gymLogoService';
import colors from '@/theme/colors';

export interface GymLogoViewProps {
  gymName: string;
  brand?: string;
  logoUrl?: string | null;
  size?: number;
  style?: object;
  fallbackStyle?: 'default' | 'minimal';
}

const GymLogoView: React.FC<GymLogoViewProps> = ({
  gymName,
  brand,
  logoUrl: propLogoUrl,
  size = 48,
  style,
  fallbackStyle = 'default',
}) => {
  const [imageError, setImageError] = useState(false);
  const [remoteError, setRemoteError] = useState(false);

  const source = getLogoSource(brand, gymName);
  const initials = getLogoFallbackInitials(brand, gymName);

  const hasLocalAsset = source.type === 'local' && source.localAsset !== undefined;
  const url = propLogoUrl || (source.type === 'remote' && source.remoteUrl ? source.remoteUrl : null);
  const useFallback = imageError || remoteError || (!hasLocalAsset && !url);

  if (useFallback) {
    if (__DEV__) {
      console.log(`[GymLogoView] FALLBACK for "${gymName}" (brand=${brand}) - initials="${initials}"`);
    }
    return (
      <View style={[styles.fallback, {width: size, height: size, borderRadius: size / 2}, style]}>
        <Text style={[styles.fallbackText, {fontSize: size * 0.4}]}>{initials}</Text>
      </View>
    );
  }

  if (hasLocalAsset && source.localAsset) {
    return (
      <Image
        source={source.localAsset as ImageSourcePropType}
        style={[styles.logo, {width: size, height: size, borderRadius: size / 2}, style]}
        resizeMode="cover"
        onError={() => {
          if (__DEV__) console.log(`[GymLogoView] Local asset failed for "${gymName}"`);
          setImageError(true);
        }}
      />
    );
  }

  if (url) {
    return (
      <Image
        source={{uri: url}}
        style={[styles.logo, {width: size, height: size, borderRadius: size / 2}, style]}
        resizeMode="cover"
        onError={() => {
          if (__DEV__) console.log(`[GymLogoView] Remote URL failed for "${gymName}": ${url}`);
          setRemoteError(true);
        }}
      />
    );
  }

  return (
    <View style={[styles.fallback, {width: size, height: size, borderRadius: size / 2}, style]}>
      <Text style={[styles.fallbackText, {fontSize: size * 0.4}]}>{initials}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  logo: {
    backgroundColor: colors.surfaceLight,
  },
  fallback: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
});

export default GymLogoView;
