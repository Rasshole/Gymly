/**
 * GymLogoView – officielle, bundtede mærke-PNG'er (via gymLogoService).
 * Ingen lilla/hjerte; ukendt mærke → Gymly-ikon + initialer.
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ImageSourcePropType,
  Platform,
} from 'react-native';
import {
  getLogoSource,
  getLogoFallbackInitials,
  getDefaultGymlyLogoAsset,
} from '@/services/gymLogoService';
import colors from '@/theme/colors';

export type GymLogoViewVariant = 'contained' | 'plain';

export interface GymLogoViewProps {
  gymName: string;
  brand?: string;
  /** @deprecated forsynes ikke længere; logo løses fra brand+navn */
  logoUrl?: string | null;
  size?: number;
  style?: object;
  /** Kort: hvid boks, skygge, padding. plain: kun billede (fx indeni rund markør). */
  variant?: GymLogoViewVariant;
  fallbackStyle?: 'default' | 'minimal';
}

const GymLogoView: React.FC<GymLogoViewProps> = ({
  gymName,
  brand,
  logoUrl: _propLogoUrl,
  size = 48,
  style,
  variant = 'contained',
  fallbackStyle = 'default',
}) => {
  const [loadError, setLoadError] = useState(false);
  const source = getLogoSource(brand, gymName);
  const initials = getLogoFallbackInitials(brand, gymName);
  const defaultGymly = getDefaultGymlyLogoAsset();

  const isOfficial =
    source.type === 'local' && source.localAsset != null && !loadError;

  const renderInner = () => {
    if (isOfficial && source.type === 'local' && source.localAsset != null) {
      return (
        <Image
          source={source.localAsset as ImageSourcePropType}
          style={styles.logoFill}
          resizeMode="contain"
          onError={() => setLoadError(true)}
        />
      );
    }
    if (fallbackStyle === 'minimal') {
      return (
        <View style={styles.unknownOnly}>
          <Text style={[styles.unknownText, {fontSize: size * 0.35}]}>{initials}</Text>
        </View>
      );
    }
    return (
      <View style={styles.unknownBlock}>
        <Image
          source={defaultGymly as ImageSourcePropType}
          style={[styles.gymlyIcon, {width: size * 0.5, height: size * 0.5}]}
          resizeMode="contain"
        />
        <Text style={[styles.unknownText, {fontSize: size * 0.22}]} numberOfLines={1}>
          {initials}
        </Text>
      </View>
    );
  };

  if (variant === 'plain') {
    return (
      <View
        style={[
          styles.plainBase,
          {width: size, height: size, borderRadius: size / 2},
          style,
        ]}>
        {isOfficial && source.type === 'local' && source.localAsset != null ? (
          <Image
            source={source.localAsset as ImageSourcePropType}
            style={[styles.logoFill, {width: '100%', height: '100%'}]}
            resizeMode="contain"
            onError={() => setLoadError(true)}
          />
        ) : (
          <View
            style={[
              styles.plainUnknown,
              {width: '100%', height: '100%', borderRadius: size / 2},
            ]}>
            <Image
              source={defaultGymly as ImageSourcePropType}
              style={{width: size * 0.45, height: size * 0.45}}
              resizeMode="contain"
            />
            <Text style={{fontSize: size * 0.2, fontWeight: '700', color: colors.textSecondary}}>
              {initials}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const pad = size * 0.1;
  return (
    <View
      style={[
        styles.card,
        cardShadow,
        {width: size, height: size, borderRadius: Math.max(10, size * 0.18)},
        style,
      ]}>
      <View style={[styles.cardInner, {padding: pad}]}>{renderInner()}</View>
    </View>
  );
};

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.12,
        shadowRadius: 2,
      }
    : {elevation: 2};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFill: {
    width: '100%',
    height: '100%',
  },
  plainBase: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plainUnknown: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unknownBlock: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownOnly: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymlyIcon: {},
  unknownText: {
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
});

export default GymLogoView;
