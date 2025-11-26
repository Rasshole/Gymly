/**
 * Map Screen
 * Shows a map with locations where people are online at gyms
 */

import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import MapView, {Marker} from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {useGymStore} from '@/store/gymStore';

type OnlineUser = {
  id: string;
  name: string;
  gymId: number;
  latitude: number;
  longitude: number;
};

// Mock friends for counting online friends
type Friend = {
  id: string;
  name: string;
  isOnline: boolean;
  gymId?: number;
};

const mockFriends: Friend[] = [
  {id: '1', name: 'Jeff', isOnline: true, gymId: 1},
  {id: '2', name: 'Marie', isOnline: false},
  {id: '3', name: 'Lars', isOnline: true, gymId: 2},
  {id: '4', name: 'Sofia', isOnline: true, gymId: 1},
];

const MapScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const mapRef = useRef<MapView>(null);
  const [selectedGym, setSelectedGym] = useState<DanishGym | null>(null);
  const {getActiveUsersCount} = useGymStore();

  // Count total active users and friends online
  const totalActiveUsers = danishGyms.reduce(
    (sum, gym) => sum + getActiveUsersCount(gym.id),
    0,
  );
  const friendsOnline = mockFriends.filter(friend => friend.isOnline).length;

  // Calculate initial region to show all Danish gyms
  const calculateInitialRegion = () => {
    if (danishGyms.length === 0) {
      return {
        latitude: 55.6761, // Copenhagen center
        longitude: 12.5683,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }

    const latitudes = danishGyms.map(gym => gym.latitude);
    const longitudes = danishGyms.map(gym => gym.longitude);
    
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    
    // Add padding
    const latDelta = (maxLat - minLat) * 1.3;
    const lonDelta = (maxLon - minLon) * 1.3;

    return {
      latitude: centerLat,
      longitude: centerLon,
      latitudeDelta: Math.max(latDelta, 0.5),
      longitudeDelta: Math.max(lonDelta, 0.5),
    };
  };

  const initialRegion = calculateInitialRegion();

  const handleMarkerPress = (gym: DanishGym) => {
    setSelectedGym(gym);
    mapRef.current?.animateToRegion(
      {
        latitude: gym.latitude,
        longitude: gym.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500,
    );
  };

  const renderGymMarker = (gym: DanishGym) => {
    const activeCount = getActiveUsersCount(gym.id);
    const hasActiveUsers = activeCount > 0;
    const logoUrl = getGymLogo(gym.brand);
    const hasLogo = hasGymLogo(gym.brand);

    return (
      <Marker
        key={gym.id}
        coordinate={{
          latitude: gym.latitude,
          longitude: gym.longitude,
        }}
        onPress={() => handleMarkerPress(gym)}>
        <View style={styles.markerContainer}>
          <View
            style={[
              styles.marker,
              hasActiveUsers && styles.markerActive,
            ]}>
            {hasLogo && logoUrl ? (
              <Image
                source={{uri: logoUrl}}
                style={styles.markerLogo}
                resizeMode="contain"
              />
            ) : (
              <Icon
                name="fitness"
                size={hasActiveUsers ? 24 : 20}
                color={hasActiveUsers ? '#fff' : '#8E8E93'}
              />
            )}
          </View>
          {hasActiveUsers && (
            <View style={styles.userCountBadge}>
              <Text style={styles.userCountText}>{activeCount}</Text>
            </View>
          )}
        </View>
      </Marker>
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        mapType="standard"
        scrollEnabled={true}
        zoomEnabled={true}
        pitchEnabled={false}
        rotateEnabled={false}>
        {danishGyms.map(gym => renderGymMarker(gym))}
      </MapView>

      {/* Info Panel */}
      {selectedGym && (
        <View style={styles.infoPanel}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedGym(null)}>
            <Icon name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.gymName}>{selectedGym.name}</Text>
          {selectedGym.city && (
            <Text style={styles.gymLocation}>{selectedGym.city}</Text>
          )}
          {selectedGym.address && (
            <Text style={styles.gymAddress}>{selectedGym.address}</Text>
          )}
          <View style={styles.userInfo}>
            <Icon name="people" size={16} color="#007AFF" />
            <Text style={styles.userInfoText}>
              {getActiveUsersCount(selectedGym.id)}{' '}
              {getActiveUsersCount(selectedGym.id) === 1 ? 'person' : 'personer'} aktive
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewDetailsButton}
            onPress={() => {
              if (selectedGym) {
                navigation.navigate('GymDetail', {
                  gymId: selectedGym.id,
                  gym: selectedGym,
                });
              }
            }}>
            <Text style={styles.viewDetailsText}>Se detaljer</Text>
            <Icon name="chevron-forward" size={16} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendMarker, styles.markerActive]} />
          <View style={styles.legendTextContainer}>
            <Text style={styles.legendText}>Folk aktive</Text>
            <Text style={styles.legendCount}>{totalActiveUsers}</Text>
          </View>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendMarker, styles.marker]} />
          <View style={styles.legendTextContainer}>
            <Text style={styles.legendText}>Venner online</Text>
            <Text style={styles.legendCount}>{friendsOnline}</Text>
          </View>
        </View>
      </View>

      {/* Empty State Info Box - Non-blocking */}
      {totalActiveUsers === 0 && !selectedGym && (
        <View style={styles.emptyInfoBox}>
          <View style={styles.emptyInfoContent}>
            <Icon name="people-outline" size={20} color="#8E8E93" />
            <Text style={styles.emptyInfoText}>Ingen aktive endnu</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerActive: {
    backgroundColor: '#007AFF',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  markerLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  userCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  userCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  gymName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
    paddingRight: 32,
  },
  gymLocation: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 2,
  },
  gymAddress: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  userInfoText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 6,
    fontWeight: '500',
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
  },
  viewDetailsText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginRight: 4,
  },
  legend: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  legendTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendText: {
    fontSize: 12,
    color: '#000',
  },
  legendCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 4,
  },
  emptyInfoBox: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  emptyInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyInfoText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 8,
    fontWeight: '500',
  },
});

export default MapScreen;

