/**
 * GymLogoView – officielle, bundtede mærke-PNG'er (via gymLogoService).
 * Ukendt mærke: standard Gymly-ikon + initialer, eller kun Gymly (`unknownFallback="gymly-only"`).
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

/** Ukendt kæde / intet bundtet logo */
export type GymLogoUnknownFallback = 'initials' | 'gymly-only';

/** `lavender`: lys lilla slot + blød skygge (fx “Dine centre” på forsiden) */
export type GymLogoSurface = 'default' | 'lavender';

const LAVENDER_SLOT_BG = '#F3F0FF';

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
  /** Når intet officielt logo: initialer under Gymly, eller kun Gymly-kettlebell */
  unknownFallback?: GymLogoUnknownFallback;
  /** Kun `variant="contained"`: lys lilla baggrund + blødere skygge */
  surface?: GymLogoSurface;
}

const GymLogoView: React.FC<GymLogoViewProps> = ({
  gymName,
  brand,
  logoUrl: _propLogoUrl,
  size = 48,
  style,
  variant = 'contained',
  fallbackStyle = 'default',
  unknownFallback = 'initials',
  surface = 'default',
}) => {
  const [loadError, setLoadError] = useState(false);
  const source = getLogoSource(brand, gymName);
  const initials = getLogoFallbackInitials(brand, gymName);
  const defaultGymly = getDefaultGymlyLogoAsset();

  const isOfficial =
    source.type === 'local' && source.localAsset != null && !loadError;

  const gymlyOnlySize = size * 0.55;

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
    if (unknownFallback === 'gymly-only') {
      return (
        <Image
          source={defaultGymly as ImageSourcePropType}
          style={{width: gymlyOnlySize, height: gymlyOnlySize}}
          resizeMode="contain"
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
        ) : unknownFallback === 'gymly-only' ? (
          <View
            style={[
              styles.plainUnknown,
              {width: '100%', height: '100%', borderRadius: size / 2},
            ]}>
            <Image
              source={defaultGymly as ImageSourcePropType}
              style={{width: size * 0.52, height: size * 0.52}}
              resizeMode="contain"
            />
          </View>
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

  const isLavender = surface === 'lavender';
  const pad = isLavender ? size * 0.12 : size * 0.1;
  const borderRadius = isLavender
    ? Math.min(16, Math.max(12, Math.round(size * 0.35)))
    : Math.max(10, size * 0.18);

  return (
    <View
      style={[
        styles.card,
        isLavender ? lavenderCardShadow : cardShadow,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: isLavender ? LAVENDER_SLOT_BG : '#FFFFFF',
        },
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

const lavenderCardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.08,
        shadowRadius: 6,
      }
    : {elevation: 3};

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
