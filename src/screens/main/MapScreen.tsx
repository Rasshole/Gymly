/**
 * Map Screen – Kort-tab
 * Premium map experience with branded markers, activity badges, carousel
 */

import React, {useState, useRef, useEffect, useMemo, useCallback} from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Modal,
  ScrollView,
  PanResponder,
  TouchableWithoutFeedback,
  Text,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import MapView, {Marker, Region} from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect, useIsFocused} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';
import GymLogoView from '@/components/ui/GymLogoView';

const MAP_GYMS = getActiveDanishGyms();
import {useAppStore} from '@/store/appStore';
import {useOnlineUsers} from '@/hooks/useOnlineUsers';
import {getMapCenterActivity} from '@/data/mapCenterActivity';
import {getMapCenters, type MapCenter} from '@/data/mapCentersData';
import colors from '@/theme/colors';
import {
  SelectedCenterCard,
  NearbyCentersCarousel,
} from '@/components/map';
import {loadMapGymBadges} from '@/services/supabase/presenceService';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// INLINE MARKER STYLES - White circle, barbell fallback, NO purple/heart
const markerStyles = StyleSheet.create({
  wrapper: {alignItems: 'center', justifyContent: 'center'},
  circle: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  circleSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  circleWithFriends: {
    borderColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOpacity: 0.4,
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
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

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371;
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
  const isFocused = useIsFocused();
  const {user} = useAppStore();
  const currentUserId = user?.id || '';
  const {users: onlineFriends, refresh: refreshOnlineFriends} = useOnlineUsers(
    currentUserId || undefined,
    {filter: 'venner'},
  );

  const [mapFriendsByGymId, setMapFriendsByGymId] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [mapTotalByGymId, setMapTotalByGymId] = useState<Map<string, number>>(
    () => new Map(),
  );

  const refreshMapBadges = useCallback(async () => {
    if (!user?.id) {
      setMapFriendsByGymId(new Map());
      setMapTotalByGymId(new Map());
      return;
    }
    try {
      const {friendsByGymId, totalByGymId} = await loadMapGymBadges(user.id);
      setMapFriendsByGymId(friendsByGymId);
      setMapTotalByGymId(totalByGymId);
    } catch {
      setMapFriendsByGymId(new Map());
      setMapTotalByGymId(new Map());
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshMapBadges();
  }, [refreshMapBadges]);

  useFocusEffect(
    useCallback(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    }, [refreshMapBadges, refreshOnlineFriends]),
  );

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    });
  }, [isFocused, refreshMapBadges, refreshOnlineFriends]);

  useEffect(() => {
    if (!isFocused || !user?.id) {
      return;
    }
    const t = setInterval(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    }, 45000);
    return () => clearInterval(t);
  }, [isFocused, user?.id, refreshMapBadges, refreshOnlineFriends]);

  const friends = useMemo(
    () =>
      onlineFriends
        .filter(u => u.gymId && (u.status === 'training_now' || u.status === 'active_minutes'))
        .map(u => ({
          id: u.userId,
          name: u.displayName,
          gymId: u.gymId,
        })),
    [onlineFriends],
  );

  const mapRef = useRef<MapView>(null);
  const [selectedGym, setSelectedGym] = useState<DanishGym | null>(null);
  const [userLocation] = useState({latitude: 55.6761, longitude: 12.5683});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCentersSheet, setShowCentersSheet] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);

  const initialRegion: Region = {
    latitude: 55.6761,
    longitude: 12.5683,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  useEffect(() => {
    setTimeout(() => {
      mapRef.current?.animateToRegion(initialRegion, 1000);
    }, 200);
  }, []);

  const getDistanceText = useCallback(
    (gym: DanishGym): string => {
      const d = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        gym.latitude,
        gym.longitude,
      );
      return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
    },
    [userLocation],
  );

  const filteredAndSortedGyms = useMemo(() => {
    let filtered = MAP_GYMS;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        g =>
          g.name.toLowerCase().includes(q) ||
          g.city?.toLowerCase().includes(q) ||
          g.address?.toLowerCase().includes(q) ||
          g.brand?.toLowerCase().includes(q),
      );
    }
    return filtered
      .map(g => ({
        gym: g,
        distance: calculateDistance(userLocation.latitude, userLocation.longitude, g.latitude, g.longitude),
      }))
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.gym);
  }, [searchQuery, userLocation]);

  const nearestGyms = useMemo(() => {
    return filteredAndSortedGyms.slice(0, 5);
  }, [filteredAndSortedGyms]);

  /** Alle aktive centre — markører (søgning skjuler ikke pins) */
  const allMapCenters = useMemo(
    () => getMapCenters(MAP_GYMS, mapFriendsByGymId, mapTotalByGymId),
    [mapFriendsByGymId, mapTotalByGymId],
  );

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const total = MAP_GYMS.length;
    const explicit = allMapCenters.filter(c => c.hasExplicitGeocode).length;
    const approx = total - explicit;
    console.warn(
      `[Map] Aktive centre: ${total}. Eksplicit lat/lng i JSON: ${explicit}. Post/fallback: ${approx}. Markører: ${allMapCenters.length}.`,
    );
    if (approx > 0) {
      console.warn(
        '[Map] Kør: node scripts/geocode-centers.mjs for at skrive rigtige koordinater til centers.json',
      );
    }
  }, [allMapCenters]);

  const nearestCentersForCarousel = useMemo(() => {
    return filteredAndSortedGyms.slice(0, 5).map(gym => {
      const c = allMapCenters.find(x => x.id === gym.id);
      return {
        gym,
        distanceText: getDistanceText(gym),
        totalActiveCount: c?.totalActiveCount ?? 0,
        friendsActiveCount: c?.friendsActiveCount ?? 0,
      };
    });
  }, [filteredAndSortedGyms, allMapCenters, getDistanceText]);

  const categorizedGyms = useMemo(() => {
    const withDist = MAP_GYMS.map(g => ({
      gym: g,
      distance: calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        g.latitude,
        g.longitude,
      ),
    }));
    const within5km = withDist.filter(w => w.distance <= 5).sort((a, b) => a.distance - b.distance).map(w => w.gym);
    const beyond5km = withDist.filter(w => w.distance > 5).sort((a, b) => a.distance - b.distance).map(w => w.gym);
    return {within5km, beyond5km};
  }, [userLocation]);

  const handleSelectGym = useCallback(
    (gym: DanishGym) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedGym(gym);
      const mc = allMapCenters.find(x => x.id === gym.id);
      const lat = mc?.mapLatitude ?? gym.latitude;
      const lng = mc?.mapLongitude ?? gym.longitude;
      mapRef.current?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        400,
      );
    },
    [allMapCenters],
  );

  const handleCloseSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedGym(null);
    setShowCentersSheet(false);
    setTimeout(() => {
      mapRef.current?.animateToRegion(initialRegion, 500);
    }, 100);
  }, []);

  const handleOpenCentersSheet = useCallback(() => setShowCentersSheet(true), []);
  const handleCloseCentersSheet = useCallback(() => setShowCentersSheet(false), []);

  const centersBarPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10 && gs.dy < 0,
        onPanResponderRelease: (_, gs) => {
          if (gs.dy < -30) handleOpenCentersSheet();
        },
      }),
    [handleOpenCentersSheet],
  );

  // INLINE MARKER - Old purple heart markers REMOVED. This is the ONLY marker render path.
  const renderGymMarker = (center: MapCenter) => {
    const gym = MAP_GYMS.find(g => g.id === center.id);
    if (!gym) {
      return null;
    }
    const isSelected = selectedGym?.id === center.id;
    const size = isSelected ? 48 : 42;
    return (
      <Marker
        key={center.id}
        coordinate={{latitude: center.mapLatitude, longitude: center.mapLongitude}}
        onPress={() => handleSelectGym(gym)}
        tracksViewChanges={false}>
        <View style={markerStyles.wrapper}>
          <View
            style={[
              markerStyles.circle,
              {width: size, height: size, borderRadius: size / 2},
              isSelected && markerStyles.circleSelected,
              center.friendsActiveCount > 0 && !isSelected && markerStyles.circleWithFriends,
            ]}>
            <GymLogoView
              gymName={center.name}
              brand={center.brand}
              variant="plain"
              size={size - 8}
            />
          </View>
          {center.friendsActiveCount > 0 ? (
            <View style={[markerStyles.badgeTop, markerStyles.badgeFriends]}>
              <Icon name="person" size={10} color="#fff" />
              <Text style={markerStyles.badgeText}>{center.friendsActiveCount}</Text>
            </View>
          ) : null}
          {center.totalActiveCount > 0 ? (
            <View style={[markerStyles.badgeBottom, markerStyles.badgeTotal]}>
              <Icon name="people" size={10} color="#fff" />
              <Text style={markerStyles.badgeText}>{center.totalActiveCount}</Text>
            </View>
          ) : null}
        </View>
      </Marker>
    );
  };

  const selectedActivity = useMemo(() => {
    if (!selectedGym) {
      return null;
    }
    const c = allMapCenters.find(x => x.id === selectedGym.id);
    return getMapCenterActivity(
      selectedGym.id,
      c?.friendsActiveCount ?? 0,
      c?.totalActiveCount ?? 0,
    );
  }, [selectedGym, allMapCenters]);

  const getActivityForGymId = useCallback(
    (gymId: string) => {
      const c = allMapCenters.find(x => x.id === gymId);
      return getMapCenterActivity(
        gymId,
        c?.friendsActiveCount ?? 0,
        c?.totalActiveCount ?? 0,
      );
    },
    [allMapCenters],
  );

  const friendNamesAtSelected = selectedGym
    ? friends.filter(f => f.gymId === selectedGym.id).map(f => f.name)
    : [];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        mapType={mapType}
        scrollEnabled
        zoomEnabled
        pitchEnabled
        rotateEnabled
        onMapReady={() => mapRef.current?.animateToRegion(initialRegion, 1000)}>
        <Marker coordinate={userLocation} title="Din placering">
          <View style={styles.userMarker}>
            <View style={styles.userMarkerDot} />
          </View>
        </Marker>
        {allMapCenters.map(renderGymMarker)}
      </MapView>

      {/* Search */}
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
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Icon name="close-circle" size={20} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>

      {/* Map type picker */}
      <TouchableOpacity
        style={styles.mapTypeBtn}
        onPress={() => setShowMapTypePicker(!showMapTypePicker)}
        activeOpacity={0.8}>
        <Icon name="layers" size={24} color="#fff" />
      </TouchableOpacity>

      {showMapTypePicker && (
        <>
          <TouchableWithoutFeedback onPress={() => setShowMapTypePicker(false)}>
            <View style={styles.pickerBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.mapTypePicker}>
            {(['standard', 'satellite', 'hybrid', 'terrain'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.pickerOption, mapType === t && styles.pickerOptionActive]}
                onPress={() => {
                  setMapType(t);
                  setShowMapTypePicker(false);
                }}
                activeOpacity={0.7}>
                <Icon
                  name={mapType === t ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={mapType === t ? colors.primary : '#8E8E93'}
                />
                <Text style={[styles.pickerText, mapType === t && styles.pickerTextActive]}>
                  {t === 'standard' ? 'Standard' : t === 'satellite' ? 'Satellit' : t === 'hybrid' ? 'Hybrid' : 'Terræn'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Center on user */}
      <TouchableOpacity
        style={styles.locateBtn}
        onPress={() => mapRef.current?.animateToRegion(initialRegion, 1000)}
        activeOpacity={0.8}>
        <Icon name="locate" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Selected center card - floats above carousel */}
      {selectedGym && selectedActivity && (
        <View style={styles.selectedCardWrapper}>
          <SelectedCenterCard
          gymName={selectedGym.name}
          brand={selectedGym.brand}
          city={selectedGym.city}
          address={selectedGym.address}
          distanceText={getDistanceText(selectedGym)}
          totalActiveCount={selectedActivity.totalActiveCount}
          friendsActiveCount={selectedActivity.friendsActiveCount}
          activityLevel={selectedActivity.activityLevel}
          friendNames={friendNamesAtSelected}
          onClose={handleCloseSelection}
          onViewDetails={() =>
            navigation.navigate('GymDetail', {gymId: selectedGym.id, gym: selectedGym})
          }
        />
        </View>
      )}

      {/* Nearby carousel */}
      <View style={styles.carouselWrapper}>
        <NearbyCentersCarousel
          centers={nearestCentersForCarousel}
          selectedGymId={selectedGym?.id ?? null}
          onSelectCenter={handleSelectGym}
        />
      </View>

      {/* I Nærheden bar */}
      <View style={styles.centersBar} {...centersBarPanResponder.panHandlers}>
        <View style={styles.centersBarDivider} />
        <View style={styles.centersBarContent}>
          <View style={styles.centersBarHandle} />
          <Icon name="location" size={18} color={colors.primary} style={styles.centersBarIcon} />
          <Text style={styles.centersBarText}>I Nærheden</Text>
        </View>
      </View>

      {/* Full centers sheet */}
      <Modal
        visible={showCentersSheet}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCentersSheet}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={handleCloseCentersSheet} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>I Nærheden</Text>
              <TouchableOpacity onPress={handleCloseCentersSheet}>
                <Icon name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {categorizedGyms.within5km.length > 0 && (
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>Indenfor 5 km</Text>
                  {categorizedGyms.within5km.map(gym => {
                    const activity = getActivityForGymId(gym.id);
                    return (
                      <TouchableOpacity
                        key={gym.id}
                        style={styles.sheetItem}
                        onPress={() => {
                          handleSelectGym(gym);
                          handleCloseCentersSheet();
                        }}>
                        <View style={styles.sheetLogoWrapper}>
                          <GymLogoView gymName={gym.name} brand={gym.brand} size={48} />
                        </View>
                        <View style={styles.sheetItemInfo}>
                          <Text style={styles.sheetItemName}>{gym.name}</Text>
                          {gym.city && <Text style={styles.sheetItemCity}>{gym.city}</Text>}
                          <View style={styles.sheetActivity}>
                            <Icon name="people" size={14} color={colors.secondary} />
                            <Text style={[styles.sheetActivityText, {color: colors.secondary}]}>
                              {activity.totalActiveCount} aktive
                            </Text>
                            <Icon name="person" size={14} color={colors.primary} style={{marginLeft: 12}} />
                            <Text style={[styles.sheetActivityText, {color: colors.primary}]}>
                              {activity.friendsActiveCount} venner
                            </Text>
                          </View>
                        </View>
                        <View style={styles.sheetItemRight}>
                          <Text style={styles.sheetDistance}>{getDistanceText(gym)}</Text>
                          <Icon name="chevron-forward" size={16} color="#8E8E93" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {categorizedGyms.beyond5km.length > 0 && (
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>Længere væk</Text>
                  {categorizedGyms.beyond5km.map(gym => {
                    const activity = getActivityForGymId(gym.id);
                    return (
                      <TouchableOpacity
                        key={gym.id}
                        style={styles.sheetItem}
                        onPress={() => {
                          handleSelectGym(gym);
                          handleCloseCentersSheet();
                        }}>
                        <View style={styles.sheetLogoWrapper}>
                          <GymLogoView gymName={gym.name} brand={gym.brand} size={48} />
                        </View>
                        <View style={styles.sheetItemInfo}>
                          <Text style={styles.sheetItemName}>{gym.name}</Text>
                          {gym.city && <Text style={styles.sheetItemCity}>{gym.city}</Text>}
                          <View style={styles.sheetActivity}>
                            <Icon name="people" size={14} color={colors.secondary} />
                            <Text style={[styles.sheetActivityText, {color: colors.secondary}]}>
                              {activity.totalActiveCount} aktive
                            </Text>
                            <Icon name="person" size={14} color={colors.primary} style={{marginLeft: 12}} />
                            <Text style={[styles.sheetActivityText, {color: colors.primary}]}>
                              {activity.friendsActiveCount} venner
                            </Text>
                          </View>
                        </View>
                        <View style={styles.sheetItemRight}>
                          <Text style={styles.sheetDistance}>{getDistanceText(gym)}</Text>
                          <Icon name="chevron-forward" size={16} color="#8E8E93" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
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
  container: {flex: 1},
  map: {width: Dimensions.get('window').width, height: Dimensions.get('window').height},
  searchContainer: {
    position: 'absolute',
    top: 30,
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
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 100,
  },
  searchIcon: {marginRight: 8},
  searchInput: {flex: 1, fontSize: 16, color: colors.text, padding: 0},
  clearBtn: {padding: 4, marginLeft: 8},
  mapTypeBtn: {
    position: 'absolute',
    bottom: 280,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 101,
  },
  pickerBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99},
  mapTypePicker: {
    position: 'absolute',
    top: 144,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 101,
    minWidth: 150,
  },
  pickerOption: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16},
  pickerOptionActive: {backgroundColor: `${colors.primary}15`},
  pickerText: {fontSize: 16, color: colors.text, marginLeft: 12, fontWeight: '500'},
  pickerTextActive: {color: colors.primary, fontWeight: '600'},
  locateBtn: {
    position: 'absolute',
    bottom: 220,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 100,
  },
  userMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.secondary,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  selectedCardWrapper: {
    position: 'absolute',
    bottom: 210,
    left: 0,
    right: 0,
    zIndex: 65,
  },
  userMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    alignSelf: 'center',
    marginTop: 2,
  },
  carouselWrapper: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    zIndex: 60,
    backgroundColor: 'transparent',
  },
  centersBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 55,
    backgroundColor: colors.backgroundCard,
  },
  centersBarDivider: {height: 0.5, backgroundColor: '#E5E5EA', width: '100%'},
  centersBarContent: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  centersBarHandle: {
    position: 'absolute',
    top: 4,
    width: 36,
    height: 4,
    backgroundColor: '#C7C7CC',
    borderRadius: 2,
    alignSelf: 'center',
  },
  centersBarIcon: {marginRight: 8},
  centersBarText: {fontSize: 14, fontWeight: '500', color: colors.text},
  sheetOverlay: {flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end'},
  sheetBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  sheetContainer: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: Dimensions.get('window').height * 0.55,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHandle: {alignItems: 'center', paddingTop: 12, paddingBottom: 8},
  sheetHandleBar: {width: 40, height: 4, backgroundColor: '#E5E5EA', borderRadius: 2},
  sheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {fontSize: 22, fontWeight: '700', color: colors.text, flex: 1},
  sheetScroll: {flex: 1},
  sheetContent: {paddingBottom: 40},
  sheetSection: {marginTop: 20, paddingHorizontal: 20},
  sheetSectionTitle: {fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 12},
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  sheetLogoWrapper: {width: 48, height: 48, marginRight: 12},
  sheetLogo: {width: 48, height: 48, borderRadius: 12, marginRight: 12, backgroundColor: colors.surfaceLight},
  sheetLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetLogoText: {fontSize: 20, fontWeight: '700', color: '#fff'},
  sheetItemInfo: {flex: 1},
  sheetItemName: {fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2},
  sheetItemCity: {fontSize: 13, color: colors.textMuted, marginBottom: 4},
  sheetActivity: {flexDirection: 'row', alignItems: 'center'},
  sheetActivityText: {fontSize: 12, fontWeight: '500', marginLeft: 4},
  sheetItemRight: {flexDirection: 'row', alignItems: 'center', marginLeft: 12},
  sheetDistance: {fontSize: 14, fontWeight: '600', color: colors.primary, marginRight: 4},
});

export default MapScreen;
