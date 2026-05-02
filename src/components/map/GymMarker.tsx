/**
 * GymMarker – Map marker for fitness centers
 * NO purple. Logo or clean fallback. Activity badges ALWAYS visible.
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';

export interface GymMarkerProps {
  logoUrl: string | null;
  gymName: string;
  friendsActiveCount: number;
  totalActiveCount: number;
  isSelected: boolean;
}

const GymMarker: React.FC<GymMarkerProps> = ({
  logoUrl,
  gymName,
  friendsActiveCount,
  totalActiveCount,
  isSelected,
}) => {
  const hasFriends = friendsActiveCount > 0;
  const hasActivity = totalActiveCount > 0;
  const baseSize = isSelected ? 48 : 40;
  const scaledSize = hasActivity ? baseSize + 4 : baseSize;

  return (
    <View style={styles.wrapper}>
      {/* Main circular marker - white/light, NEVER purple */}
      <View
        style={[
          styles.marker,
          {
            width: scaledSize,
            height: scaledSize,
            borderRadius: scaledSize / 2,
          },
          isSelected && styles.markerSelected,
          hasFriends && !isSelected && styles.markerWithFriends,
        ]}>
        {logoUrl ? (
          <Image
            source={{uri: logoUrl}}
            style={[
              styles.logo,
              {
                width: scaledSize - 8,
                height: scaledSize - 8,
                borderRadius: (scaledSize - 8) / 2,
              },
            ]}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.fallback}>
            <Icon name="barbell-outline" size={scaledSize / 2} color={colors.textSecondary} />
          </View>
        )}
      </View>

      {/* Badge top-right: friends count (ALWAYS visible) */}
      <View style={[styles.badgeTopRight, styles.badgeFriends]}>
        <Icon name="person" size={10} color="#fff" />
        <Text style={styles.badgeText}>{friendsActiveCount}</Text>
      </View>

      {/* Badge bottom: total active (ALWAYS visible) */}
      <View style={[styles.badgeBottom, styles.badgeTotal]}>
        <Icon name="people" size={10} color="#fff" />
        <Text style={styles.badgeText}>{totalActiveCount}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  marker: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 8,
  },
  markerSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  markerWithFriends: {
    borderColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  logo: {
    backgroundColor: '#F5F5F5',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeTopRight: {
    position: 'absolute',
    top: -2,
    right: -4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#fff',
    minWidth: 24,
    justifyContent: 'center',
  },
  badgeBottom: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#fff',
    minWidth: 28,
    justifyContent: 'center',
  },
  badgeFriends: {
    backgroundColor: colors.primary,
  },
  badgeTotal: {
    backgroundColor: colors.secondary,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 3,
  },
});

export default GymMarker;
