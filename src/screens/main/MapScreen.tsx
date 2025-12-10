/**
 * Map Screen
 * Shows a map with locations where people are online at gyms
 * Starts from user's current location and allows exploring nearby fitness centers
 */

import React, {useState, useRef, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  TextInput,
  Modal,
  ScrollView,
  FlatList,
} from 'react-native';
import MapView, {Marker, Region} from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {useGymStore} from '@/store/gymStore';
import {colors} from '@/theme/colors';

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

// Calculate distance between two coordinates in kilometers (Haversine formula)
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const MapScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const mapRef = useRef<MapView>(null);
  const [selectedGym, setSelectedGym] = useState<DanishGym | null>(null);
  // Always use Copenhagen as user location
  // Always use Copenhagen as user location - don't use actual device location
  const [userLocation] = useState<{
    latitude: number;
    longitude: number;
  }>({
    latitude: 55.6761, // Copenhagen, Sjælland
    longitude: 12.5683,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const [showCentersSheet, setShowCentersSheet] = useState(false);
  const {getActiveUsersCount} = useGymStore();

  // Always start with Copenhagen, Sjælland on mount
  useEffect(() => {
    // Always use Copenhagen as the location - don't fetch actual device location
    const copenhagenRegion: Region = {
      latitude: 55.6761, // Copenhagen, Sjælland
      longitude: 12.5683,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
    setRegion(copenhagenRegion);
    
    // Animate map to Copenhagen when map is ready
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.animateToRegion(copenhagenRegion, 1000);
      }
    }, 200);
  }, []);

  const centerOnUserLocation = () => {
    // Always center on Copenhagen
    const copenhagenRegion: Region = {
      latitude: 55.6761, // Copenhagen, Sjælland
        longitude: 12.5683,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
    if (mapRef.current) {
      mapRef.current.animateToRegion(copenhagenRegion, 1000);
      setRegion(copenhagenRegion);
    }
  };

  // Filter and sort gyms based on search and distance from user
  const filteredAndSortedGyms = useMemo(() => {
    let filtered = danishGyms;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        gym =>
          gym.name.toLowerCase().includes(query) ||
          gym.city?.toLowerCase().includes(query) ||
          gym.address?.toLowerCase().includes(query) ||
          gym.brand?.toLowerCase().includes(query),
      );
    }

    // Sort by distance if user location is available
    if (userLocation) {
      filtered = filtered
        .map(gym => ({
          gym,
          distance: calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            gym.latitude,
            gym.longitude,
          ),
        }))
        .sort((a, b) => a.distance - b.distance)
        .map(item => item.gym);
    }

    return filtered;
  }, [searchQuery, userLocation]);

  // Categorize gyms by distance (within 5km and beyond)
  const categorizedGyms = useMemo(() => {
    if (!userLocation) {
      return {within5km: [], beyond5km: []};
    }

    const gymsWithDistance = danishGyms.map(gym => ({
      gym,
      distance: calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        gym.latitude,
        gym.longitude,
      ),
    }));

    const within5km = gymsWithDistance
      .filter(item => item.distance <= 5)
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.gym);

    const beyond5km = gymsWithDistance
      .filter(item => item.distance > 5)
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.gym);

    return {within5km, beyond5km};
  }, [userLocation]);

  // Handle opening/closing centers sheet
  const handleOpenCentersSheet = () => {
    setShowCentersSheet(true);
  };

  const handleCloseCentersSheet = () => {
    setShowCentersSheet(false);
    setSelectedGym(null); // Also close info panel if open
  };

  // Get first 5 nearest gyms for horizontal slider
  const nearestGyms = useMemo(() => {
    if (!userLocation) return [];
    
    const gymsWithDistance = danishGyms.map(gym => ({
      gym,
      distance: calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        gym.latitude,
        gym.longitude,
      ),
    }));

    return gymsWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(item => item.gym);
  }, [userLocation]);

  // Count total active users and friends online
  const totalActiveUsers = danishGyms.reduce(
    (sum, gym) => sum + getActiveUsersCount(gym.id),
    0,
  );
  const friendsOnline = mockFriends.filter(friend => friend.isOnline).length;

  // Always start in Copenhagen, Sjælland
  const initialRegion: Region = {
    latitude: 55.6761, // Copenhagen center
    longitude: 12.5683,
    latitudeDelta: 0.1, // Show Copenhagen area
    longitudeDelta: 0.1,
  };

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

  const handleCloseInfoPanel = () => {
    setSelectedGym(null);
    setShowCentersSheet(false);
    // Reset map to overview of Copenhagen
    setTimeout(() => {
      const copenhagenRegion: Region = {
        latitude: 55.6761,
        longitude: 12.5683,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
      if (mapRef.current) {
        mapRef.current.animateToRegion(copenhagenRegion, 500);
        setRegion(copenhagenRegion);
      }
    }, 100);
  };

  const renderGymMarker = (gym: DanishGym) => {
    const activeCount = getActiveUsersCount(gym.id);
    const hasActiveUsers = activeCount > 0;
    const logoUrl = getGymLogo(gym.brand);
    const hasLogo = hasGymLogo(gym.brand);

    // Calculate distance if user location is available
    const distance = userLocation
      ? calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          gym.latitude,
          gym.longitude,
        )
      : null;

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

  const getDistanceText = (gym: DanishGym): string => {
    if (!userLocation) return '';
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      gym.latitude,
      gym.longitude,
    );
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(1)} km`;
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
        pitchEnabled={true}
        rotateEnabled={true}
        minZoomLevel={5}
        maxZoomLevel={20}
        onMapReady={() => {
          // Force map to center on Copenhagen when ready
          const copenhagenRegion: Region = {
            latitude: 55.6761, // Copenhagen, Sjælland
            longitude: 12.5683,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          };
          if (mapRef.current) {
            mapRef.current.animateToRegion(copenhagenRegion, 1000);
            setRegion(copenhagenRegion);
          }
        }}>
        {/* User location marker in Copenhagen */}
        <Marker
          coordinate={{
            latitude: 55.6761, // Copenhagen, Sjælland
            longitude: 12.5683,
          }}
          title="Din placering"
          description="København, Sjælland">
          <View style={styles.userLocationMarker}>
            <View style={styles.userLocationDot} />
          </View>
        </Marker>
        {filteredAndSortedGyms.map(gym => renderGymMarker(gym))}
      </MapView>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg efter fitness centre..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}>
            <Icon name="close-circle" size={20} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>

      {/* Center on User Location Button */}
      <TouchableOpacity
        style={styles.centerLocationButton}
        onPress={centerOnUserLocation}
        activeOpacity={0.8}>
        <Icon name="locate" size={24} color="#007AFF" />
      </TouchableOpacity>

      {/* Info Panel */}
      {selectedGym && (
        <View style={styles.infoPanel}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleCloseInfoPanel}
            activeOpacity={0.7}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon name="close" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.gymName}>{selectedGym.name}</Text>
          {selectedGym.city && (
            <Text style={styles.gymLocation}>{selectedGym.city}</Text>
          )}
          {selectedGym.address && (
            <Text style={styles.gymAddress}>{selectedGym.address}</Text>
          )}
          {userLocation && (
            <View style={styles.distanceInfo}>
              <Icon name="location" size={16} color="#007AFF" />
              <Text style={styles.distanceText}>{getDistanceText(selectedGym)} væk</Text>
            </View>
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


      {/* Horizontal Slider - First 5 Nearest Centers */}
      {!selectedGym && nearestGyms.length > 0 && (
        <View style={styles.sliderContainer}>
          <FlatList
            data={nearestGyms}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.sliderContent}
            renderItem={({item: gym}) => {
              const logoUrl = getGymLogo(gym.brand);
              const hasLogo = hasGymLogo(gym.brand);
              const activeFriends = mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length;
              
              return (
                <TouchableOpacity
                  style={styles.sliderCard}
                  onPress={() => handleMarkerPress(gym)}
                  activeOpacity={0.8}>
                  {/* Gym Image/Logo */}
                  <View style={styles.sliderImageContainer}>
                    {hasLogo && logoUrl ? (
                      <Image
                        source={{uri: logoUrl}}
                        style={styles.sliderImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.sliderImagePlaceholder}>
                        <Icon name="fitness" size={40} color="#8E8E93" />
                      </View>
                    )}
                  </View>
                  
                  {/* Gym Info */}
                  <View style={styles.sliderInfo}>
                    <Text style={styles.sliderGymName} numberOfLines={1}>
                      {gym.name}
                    </Text>
                    {gym.address && (
                      <Text style={styles.sliderAddress} numberOfLines={1}>
                        {gym.address}
                      </Text>
                    )}
                    <View style={styles.sliderDetails}>
                      <View style={styles.sliderDetailRow}>
                        <Icon name="location" size={12} color="#007AFF" />
                        <Text style={styles.sliderDetailText}>
                          {getDistanceText(gym)}
                        </Text>
                      </View>
                      <View style={styles.sliderDetailRow}>
                        <Icon name="people" size={12} color="#007AFF" />
                        <Text style={styles.sliderDetailText}>
                          {getActiveUsersCount(gym.id)} aktive
                        </Text>
                      </View>
                      {activeFriends > 0 && (
                        <View style={styles.sliderDetailRow}>
                          <Icon name="person" size={12} color="#34C759" />
                          <Text style={styles.sliderDetailText}>
                            {activeFriends} {activeFriends === 1 ? 'ven' : 'venner'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Centre tæt på dig Bar */}
      {!selectedGym && (
        <TouchableOpacity
          style={styles.centersBarWrapper}
          onPress={handleOpenCentersSheet}
          activeOpacity={0.8}>
          <View style={styles.centersBarDivider} />
          <View style={styles.centersBarContent}>
            <Text style={styles.centersBarText}>
              {categorizedGyms.within5km.length + categorizedGyms.beyond5km.length} fitness centre
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Centers Bottom Sheet */}
      <Modal
        visible={showCentersSheet}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCentersSheet}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={handleCloseCentersSheet}
          />
          <View style={styles.sheetContainer}>
            {/* Sheet Handle */}
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
        </View>

            {/* Sheet Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {categorizedGyms.within5km.length + categorizedGyms.beyond5km.length}{' '}
                fitness centre
              </Text>
              <TouchableOpacity
                style={styles.sheetCloseButton}
                onPress={handleCloseCentersSheet}>
                <Icon name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Centers List */}
            <ScrollView
              style={styles.sheetScrollView}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}>
              {/* Centres within 5km */}
              {categorizedGyms.within5km.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Indenfor 5 km</Text>
                  {categorizedGyms.within5km.map(gym => (
                    <TouchableOpacity
                      key={gym.id}
                      style={styles.centerItem}
                      onPress={() => {
                        handleMarkerPress(gym);
                        handleCloseCentersSheet();
                      }}>
                      {hasGymLogo(gym.brand) && getGymLogo(gym.brand) && (
                        <Image
                          source={{uri: getGymLogo(gym.brand)!}}
                          style={styles.centerLogo}
                          resizeMode="contain"
                        />
                      )}
                      <View style={styles.centerInfo}>
                        <Text style={styles.centerName}>{gym.name}</Text>
                        {gym.city && (
                          <Text style={styles.centerCity}>{gym.city}</Text>
                        )}
                        {gym.address && (
                          <Text style={styles.centerAddress}>{gym.address}</Text>
                        )}
                        <View style={styles.centerActivityInfo}>
                          <View style={styles.activityRow}>
                            <Icon name="people" size={14} color="#007AFF" />
                            <Text style={styles.activityText}>
                              {getActiveUsersCount(gym.id)}{' '}
                              {getActiveUsersCount(gym.id) === 1 ? 'person' : 'personer'} aktive
                            </Text>
                          </View>
                          {mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length > 0 && (
                            <View style={styles.activityRow}>
                              <Icon name="person" size={14} color="#34C759" />
                              <Text style={styles.activityText}>
                                {mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length}{' '}
                                {mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length === 1 ? 'ven' : 'venner'} aktive
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.centerDistance}>
                        <Text style={styles.centerDistanceText}>
                          {getDistanceText(gym)}
                        </Text>
                        <Icon name="chevron-forward" size={16} color="#8E8E93" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Centres beyond 5km */}
              {categorizedGyms.beyond5km.length > 0 && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Længere væk</Text>
                  {categorizedGyms.beyond5km.map(gym => (
                    <TouchableOpacity
                      key={gym.id}
                      style={styles.centerItem}
                      onPress={() => {
                        handleMarkerPress(gym);
                        handleCloseCentersSheet();
                      }}>
                      {hasGymLogo(gym.brand) && getGymLogo(gym.brand) && (
                        <Image
                          source={{uri: getGymLogo(gym.brand)!}}
                          style={styles.centerLogo}
                          resizeMode="contain"
                        />
                      )}
                      <View style={styles.centerInfo}>
                        <Text style={styles.centerName}>{gym.name}</Text>
                        {gym.city && (
                          <Text style={styles.centerCity}>{gym.city}</Text>
                        )}
                        {gym.address && (
                          <Text style={styles.centerAddress}>{gym.address}</Text>
                        )}
                        <View style={styles.centerActivityInfo}>
                          <View style={styles.activityRow}>
                            <Icon name="people" size={14} color="#007AFF" />
                            <Text style={styles.activityText}>
                              {getActiveUsersCount(gym.id)}{' '}
                              {getActiveUsersCount(gym.id) === 1 ? 'person' : 'personer'} aktive
                            </Text>
                          </View>
                          {mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length > 0 && (
                            <View style={styles.activityRow}>
                              <Icon name="person" size={14} color="#34C759" />
                              <Text style={styles.activityText}>
                                {mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length}{' '}
                                {mockFriends.filter(f => f.isOnline && f.gymId === gym.id).length === 1 ? 'ven' : 'venner'} aktive
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.centerDistance}>
                        <Text style={styles.centerDistanceText}>
                          {getDistanceText(gym)}
                        </Text>
                        <Icon name="chevron-forward" size={16} color="#8E8E93" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textMuted,
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  searchContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  centerLocationButton: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
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
    backgroundColor: colors.secondary,
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
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 101,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
  },
  gymName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
    paddingRight: 32,
  },
  gymLocation: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 2,
  },
  gymAddress: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  distanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 14,
    color: colors.secondary,
    marginLeft: 6,
    fontWeight: '500',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  userInfoText: {
    fontSize: 14,
    color: colors.secondary,
    marginLeft: 6,
    fontWeight: '500',
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  viewDetailsText: {
    fontSize: 16,
    color: colors.secondary,
    fontWeight: '600',
    marginRight: 4,
  },
  nearbyGymsInfo: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    alignItems: 'center',
    zIndex: 50,
  },
  nearbyGymsText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  userLocationMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  userLocationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.backgroundCard,
    alignSelf: 'center',
    marginTop: 2,
  },
  centersBarWrapper: {
    position: 'absolute',
    bottom: 49, // Position directly above main tabs
    left: 0,
    right: 0,
    zIndex: 55,
    backgroundColor: colors.backgroundCard,
  },
  centersBarDivider: {
    height: 0.5,
    backgroundColor: '#E5E5EA',
    width: '100%',
  },
  centersBarContent: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centersBarText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.text,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: Dimensions.get('window').height * 0.5,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  sheetCloseButton: {
    padding: 4,
  },
  sheetScrollView: {
    flex: 1,
  },
  sheetContent: {
    paddingBottom: 40,
  },
  sectionContainer: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  centerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  centerLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#F2F2F7',
  },
  centerInfo: {
    flex: 1,
  },
  centerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  centerCity: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 2,
  },
  centerAddress: {
    fontSize: 12,
    color: colors.textMuted,
  },
  centerDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  centerDistanceText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.secondary,
    marginRight: 4,
  },
  centerActivityInfo: {
    marginTop: 8,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activityText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sliderContainer: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    height: 140,
    zIndex: 60,
  },
  sliderContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sliderCard: {
    width: Dimensions.get('window').width * 0.85,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    marginRight: 12,
    flexDirection: 'row',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  sliderImageContainer: {
    width: 120,
    height: 140,
  },
  sliderImage: {
    width: '100%',
    height: '100%',
  },
  sliderImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  sliderGymName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sliderAddress: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  sliderDetails: {
    marginTop: 4,
  },
  sliderDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sliderDetailText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 4,
  },
});

export default MapScreen;
