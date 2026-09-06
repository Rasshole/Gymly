import React, {memo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import GymLogoView from '@/components/ui/GymLogoView';
import type {MapCenter} from '@/data/mapCentersData';
import colors from '@/theme/colors';

type Props = {
  center: MapCenter;
  selected: boolean;
};

/** Memoised map pin — matches legacy MapScreen marker styling. */
const MapGymMarkerView = memo(function MapGymMarkerView({center, selected}: Props) {
  const size = selected ? 50 : 44;
  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.circle,
          {width: size, height: size, borderRadius: size / 2},
          selected && styles.circleSelected,
          center.friendsActiveCount > 0 && !selected && styles.circleWithFriends,
        ]}>
        <GymLogoView
          gymName={center.name}
          brand={center.brand}
          variant="plain"
          size={size - 8}
        />
      </View>
      {center.friendsActiveCount > 0 ? (
        <View style={[styles.badgeTop, styles.badgeFriends]}>
          <Icon name="person" size={10} color="#fff" />
          <Text style={styles.badgeText}>{center.friendsActiveCount}</Text>
        </View>
      ) : null}
      {center.totalActiveCount > 0 ? (
        <View style={[styles.badgeBottom, styles.badgeTotal]}>
          <Icon name="people" size={10} color="#fff" />
          <Text style={styles.badgeText}>{center.totalActiveCount}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {alignItems: 'center', justifyContent: 'center'},
  circle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  circleSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 12,
  },
  circleWithFriends: {
    borderColor: colors.secondary + 'CC',
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
  },
  badgeTop: {
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
  badgeFriends: {backgroundColor: colors.primary},
  badgeTotal: {backgroundColor: colors.secondary},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '800', marginLeft: 3},
});

export default MapGymMarkerView;
