/**
 * CenterMarker – Branded map marker for fitness centers
 * Shows center logo, activity badges (total + friends), selected state
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';

export interface CenterMarkerProps {
  logoUrl: string | null;
  hasLogo: boolean;
  gymName: string;
  totalActiveCount: number;
  friendsActiveCount: number;
  isSelected: boolean;
  hasActivity: boolean;
}

const CenterMarker: React.FC<CenterMarkerProps> = ({
  logoUrl,
  hasLogo,
  gymName,
  totalActiveCount,
  friendsActiveCount,
  isSelected,
  hasActivity,
}) => {
  const markerSize = isSelected ? 44 : 36;
  const logoSize = isSelected ? 32 : 26;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.marker,
          {
            width: markerSize,
            height: markerSize,
            borderRadius: markerSize / 2,
          },
          isSelected && styles.markerSelected,
          hasActivity && !isSelected && styles.markerActive,
          friendsActiveCount > 0 && !isSelected && styles.markerWithFriends,
        ]}>
        {hasLogo && logoUrl ? (
          <Image
            source={{uri: logoUrl}}
            style={[styles.logo, {width: logoSize, height: logoSize, borderRadius: logoSize / 2}]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.fallback, {width: logoSize, height: logoSize, borderRadius: logoSize / 2}]}>
            <Text style={styles.fallbackText} numberOfLines={1}>
              {gymName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      {(totalActiveCount > 0 || friendsActiveCount > 0) && (
        <View style={styles.badges}>
          {totalActiveCount > 0 && (
            <View style={[styles.badge, styles.badgeTotal]}>
              <Icon name="people" size={8} color="#fff" />
              <Text style={styles.badgeText}>{totalActiveCount}</Text>
            </View>
          )}
          {friendsActiveCount > 0 && (
            <View style={[styles.badge, styles.badgeFriends]}>
              <Icon name="person" size={8} color="#fff" />
              <Text style={styles.badgeText}>{friendsActiveCount}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 2.5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  markerSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  markerActive: {
    borderColor: colors.secondary,
  },
  markerWithFriends: {
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  logo: {
    backgroundColor: '#fff',
  },
  fallback: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  badges: {
    position: 'absolute',
    bottom: -4,
    left: '50%',
    marginLeft: -20,
    flexDirection: 'row',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fff',
    marginRight: 2,
  },
  badgeTotal: {
    backgroundColor: colors.secondary,
  },
  badgeFriends: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 2,
  },
});

export default CenterMarker;
