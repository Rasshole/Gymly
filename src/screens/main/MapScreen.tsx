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
  Modal,
  ScrollView,
  PanResponder,
  TouchableWithoutFeedback,
  Text,
  Keyboard,
  LayoutAnimation,
  UIManager,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import Geolocation, {
  type GeolocationError,
  type GeolocationResponse,
} from '@react-native-community/geolocation';
import {
  getLocationPermissionStatus,
  isLocationAuthorized,
  mapLegacyLocationPermissionStatus,
  requestLocationPermissionIfNeeded,
  showLocationDeniedInAppMessage,
} from '@/services/location/locationPermission';
import MapView, {Marker, Region, AnimatedRegion} from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {StackNavigationProp} from '@react-navigation/stack';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {useTranslation} from '@/i18n';
import {useGymSearch} from '@/hooks/useGymSearch';
import {GymSearchResultsPanel} from '@/components/gym/GymSearchResultsPanel';

const MAP_GYMS = getActiveDanishGyms();
import {useAppStore} from '@/store/appStore';
import {useOnlineUsers} from '@/hooks/useOnlineUsers';
import {getMapCenterActivity} from '@/data/mapCenterActivity';
import {getMapCenters, type MapCenter} from '@/data/mapCentersData';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import {
  SelectedCenterCard,
  NearbyCentersCarousel,
  MapFloatingButton,
  MapTypePickerMenu,
} from '@/components/map';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {loadMapGymBadges} from '@/services/supabase/presenceService';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// INLINE MARKER STYLES - White circle, barbell fallback, NO purple/heart
const MAP_CONTROL_GAP = 12;
const MAP_CONTROL_SIZE = 58;

const markerStyles = StyleSheet.create({
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
  const {t} = useTranslation();
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
    if (!user?.id) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    });
  }, [user?.id, refreshMapBadges, refreshOnlineFriends]);

  /** Udebliver Realtime: sjælden synk (rollup + venner) */
  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const t = setInterval(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    }, 3 * 60_000);
    return () => clearInterval(t);
  }, [user?.id, refreshMapBadges, refreshOnlineFriends]);

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
  const [userLocation, setUserLocation] = useState({latitude: 55.6761, longitude: 12.5683});
  const userAnimatedCoordinateRef = useRef(
    new AnimatedRegion({
      latitude: 55.6761,
      longitude: 12.5683,
      latitudeDelta: 0.0005,
      longitudeDelta: 0.0005,
    }),
  );
  const markerPulse = useRef(new Animated.Value(0.35)).current;
  const lastLocationUpdateMsRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const [followUserMode, setFollowUserMode] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    'idle' | 'granted' | 'denied' | 'unavailable'
  >('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCentersSheet, setShowCentersSheet] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();
  /** Lige over “Tæt på dig”-karrusel — samme placering som før redesign. */
  const mapControlsBottom = tabBarHeight + 128;
  const mapControlsEntrance = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      mapControlsEntrance.setValue(0);
      Animated.timing(mapControlsEntrance, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, [mapControlsEntrance]),
  );

  const initialRegion = useMemo<Region>(
    () => ({
      latitude: 55.6761,
      longitude: 12.5683,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    }),
    [],
  );

  useEffect(() => {
    setTimeout(() => {
      mapRef.current?.animateToRegion(initialRegion, 1000);
    }, 200);
  }, [initialRegion]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(markerPulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(markerPulse, {
          toValue: 0.35,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [markerPulse]);

  const applyLocationUpdate = useCallback(
    (position: GeolocationResponse) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const now = Date.now();
      if (now - lastLocationUpdateMsRef.current < 900) {
        return;
      }
      lastLocationUpdateMsRef.current = now;
      setUserLocation(prev => {
        const dLat = Math.abs(prev.latitude - latitude);
        const dLng = Math.abs(prev.longitude - longitude);
        if (dLat < 0.00001 && dLng < 0.00001) {
          return prev;
        }
        return {latitude, longitude};
      });
      (userAnimatedCoordinateRef.current as any)
        .timing({
          latitude,
          longitude,
          latitudeDelta: 0.0005,
          longitudeDelta: 0.0005,
          duration: 550,
        })
        .start();
      if (followUserMode) {
        mapRef.current?.animateCamera(
          {
            center: {latitude, longitude},
            zoom: 16.2,
          },
          {duration: 700},
        );
      }
    },
    [followUserMode],
  );

  const startLocationWatchIfAuthorized = useCallback(async () => {
    const status = await getLocationPermissionStatus();
    const legacy = mapLegacyLocationPermissionStatus(status);
    setLocationPermissionStatus(
      legacy === 'granted' ? 'granted' : legacy === 'denied' ? 'denied' : 'unavailable',
    );
    if (!isLocationAuthorized(status)) {
      return;
    }

    Geolocation.getCurrentPosition(
      pos => applyLocationUpdate(pos),
      (_err: GeolocationError) => {
        setLocationPermissionStatus('unavailable');
      },
      {enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000},
    );

    watchIdRef.current = Geolocation.watchPosition(
      pos => applyLocationUpdate(pos),
      (err: GeolocationError) => {
        if (err?.code === 1) {
          setLocationPermissionStatus('denied');
        }
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 6,
        interval: 2500,
        fastestInterval: 1500,
        useSignificantChanges: false,
      },
    ) as unknown as number;
  }, [applyLocationUpdate]);

  const requestLocationForMap = useCallback(async () => {
    const status = await requestLocationPermissionIfNeeded();
    const legacy = mapLegacyLocationPermissionStatus(status);
    setLocationPermissionStatus(
      legacy === 'granted' ? 'granted' : legacy === 'denied' ? 'denied' : 'unavailable',
    );
    if (status === 'denied' || status === 'restricted') {
      showLocationDeniedInAppMessage();
      return false;
    }
    if (!isLocationAuthorized(status)) {
      return false;
    }
    if (watchIdRef.current != null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    await startLocationWatchIfAuthorized();
    return true;
  }, [startLocationWatchIfAuthorized]);

  useFocusEffect(
    useCallback(() => {
      void startLocationWatchIfAuthorized().catch(() => {
        setLocationPermissionStatus('unavailable');
      });
      return () => {
        if (watchIdRef.current != null) {
          Geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setFollowUserMode(false);
      };
    }, [startLocationWatchIfAuthorized]),
  );

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

  const favoriteGymIds = user?.favoriteGyms ?? [];

  const {hits: searchHits, isActive: isSearchActive, showLoading: searchLoading} =
    useGymSearch(searchQuery, {
      userLat: userLocation.latitude,
      userLng: userLocation.longitude,
      favoriteIds: favoriteGymIds,
      limit: 20,
      gyms: MAP_GYMS,
    });

  const filteredAndSortedGyms = useMemo(
    () => (isSearchActive ? searchHits.map(h => h.gym) : MAP_GYMS),
    [isSearchActive, searchHits],
  );

  const searchMatchIds = useMemo(
    () => new Set(filteredAndSortedGyms.map(g => g.id)),
    [filteredAndSortedGyms],
  );

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
      if (Platform.OS === 'android') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
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
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectedGym(null);
    setShowCentersSheet(false);
    setTimeout(() => {
      mapRef.current?.animateToRegion(initialRegion, 500);
    }, 100);
  }, [initialRegion]);

  const handleOpenCentersSheet = useCallback(() => setShowCentersSheet(true), []);
  const handleCloseCentersSheet = useCallback(() => setShowCentersSheet(false), []);

  const centersBarPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10 && gs.dy < 0,
        onPanResponderRelease: (_, gs) => {
          if (gs.dy < -30) {
            handleOpenCentersSheet();
          }
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
    const size = isSelected ? 50 : 44;
    return (
      <Marker
        key={center.id}
        coordinate={{latitude: center.mapLatitude, longitude: center.mapLongitude}}
        onPress={() => handleSelectGym(gym)}
        zIndex={isSelected ? 999 : center.friendsActiveCount > 0 ? 50 : 1}
        tracksViewChanges={isSelected}>
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
        onPanDrag={() => {
          if (followUserMode) {
            setFollowUserMode(false);
          }
        }}
        onRegionChangeComplete={(_, gesture) => {
          if (followUserMode && gesture?.isGesture) {
            setFollowUserMode(false);
          }
        }}
        onMapReady={() => mapRef.current?.animateToRegion(initialRegion, 1000)}>
        <Marker.Animated
          coordinate={userAnimatedCoordinateRef.current as unknown as {latitude: number; longitude: number}}
          title={t('map.yourLocation')}>
          <View style={styles.userMarkerWrap}>
            <Animated.View
              style={[
                styles.userMarkerPulse,
                {
                  transform: [
                    {
                      scale: markerPulse.interpolate({
                        inputRange: [0.35, 1],
                        outputRange: [1, 1.9],
                      }),
                    },
                  ],
                  opacity: markerPulse.interpolate({
                    inputRange: [0.35, 1],
                    outputRange: [0.2, 0.03],
                  }),
                },
              ]}
            />
            <View style={styles.userMarker}>
              <View style={styles.userMarkerDot} />
            </View>
          </View>
        </Marker.Animated>
        {allMapCenters
          .filter(c => !isSearchActive || searchMatchIds.has(c.id))
          .map(renderGymMarker)}
      </MapView>

      <SocialSearchBar
        variant="map"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('map.searchPlaceholder')}
        style={styles.searchContainer}
      />

      {isSearchActive ? (
        <View style={styles.mapSearchResults} pointerEvents="box-none">
          <GymSearchResultsPanel
            hits={searchHits}
            isActive={isSearchActive}
            showLoading={searchLoading}
            favoriteIds={favoriteGymIds}
            variant="map"
            maxHeight={280}
            onSelectGym={gym => {
              Keyboard.dismiss();
              handleSelectGym(gym);
            }}
            formatDistance={gym => getDistanceText(gym)}
          />
        </View>
      ) : null}

      <MapTypePickerMenu
        visible={showMapTypePicker}
        value={mapType}
        onSelect={t => {
          setMapType(t);
          setShowMapTypePicker(false);
        }}
        onClose={() => setShowMapTypePicker(false)}
        menuStyle={{
          bottom:
            mapControlsBottom + MAP_CONTROL_SIZE + MAP_CONTROL_GAP + MAP_CONTROL_SIZE + 14,
        }}
      />

      {locationPermissionStatus === 'denied' ? (
        <View style={styles.locationHint}>
          <Text style={styles.locationHintText}>
            {t('map.locationDisabled')}
          </Text>
        </View>
      ) : null}

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

      {/* Nearby carousel — hidden while search results are shown */}
      {!isSearchActive ? (
        <View style={styles.carouselWrapper}>
          <NearbyCentersCarousel
            centers={nearestCentersForCarousel}
            selectedGymId={selectedGym?.id ?? null}
            onSelectCenter={handleSelectGym}
          />
        </View>
      ) : null}

      {/* Flydende kortknapper — altid synlige over karrusel */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.mapControlsColumn,
          {
            bottom: mapControlsBottom,
            opacity: mapControlsEntrance,
            transform: [
              {
                translateY: mapControlsEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}>
        <MapFloatingButton
          icon="layers-outline"
          accessibilityLabel="Korttype"
          active={showMapTypePicker}
          onPress={() => setShowMapTypePicker(v => !v)}
        />
        <View style={styles.mapControlSpacer} />
        <MapFloatingButton
          icon="locate"
          accessibilityLabel={t('map.centerOnMe')}
          onPress={() => {
            void requestLocationForMap().then(ok => {
              if (!ok) {
                return;
              }
              setFollowUserMode(true);
              mapRef.current?.animateCamera(
                {
                  center: userLocation,
                  zoom: 16.2,
                },
                {duration: 600},
              );
            });
          }}
        />
      </Animated.View>

      {/* I Nærheden bar */}
      <View style={styles.centersBar} {...centersBarPanResponder.panHandlers}>
        <View style={styles.centersBarDivider} />
        <View style={styles.centersBarContent}>
          <View style={styles.centersBarHandle} />
          <Icon name="location" size={18} color={colors.primary} style={styles.centersBarIcon} />
          <Text style={styles.centersBarText}>{t('map.nearby')}</Text>
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
              <Text style={styles.sheetTitle}>{t('map.nearby')}</Text>
              <TouchableOpacity onPress={handleCloseCentersSheet}>
                <Icon name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {categorizedGyms.within5km.length > 0 && (
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>{t('map.within5km')}</Text>
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
                          <Text style={styles.sheetItemName}>{formatGymDisplayName(gym)}</Text>
                          {gym.city && <Text style={styles.sheetItemCity}>{gym.city}</Text>}
                          <View style={styles.sheetActivity}>
                            <Icon name="people" size={14} color={colors.secondary} />
                            <Text style={[styles.sheetActivityText, {color: colors.secondary}]}>
                              {t('map.activeCount', {
                                count: String(activity.totalActiveCount),
                              })}
                            </Text>
                            <Icon name="person" size={14} color={colors.primary} style={{marginLeft: 12}} />
                            <Text style={[styles.sheetActivityText, {color: colors.primary}]}>
                              {t('map.friendsCount', {
                                count: String(activity.friendsActiveCount),
                              })}
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
                  <Text style={styles.sheetSectionTitle}>{t('map.furtherAway')}</Text>
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
                          <Text style={styles.sheetItemName}>{formatGymDisplayName(gym)}</Text>
                          {gym.city && <Text style={styles.sheetItemCity}>{gym.city}</Text>}
                          <View style={styles.sheetActivity}>
                            <Icon name="people" size={14} color={colors.secondary} />
                            <Text style={[styles.sheetActivityText, {color: colors.secondary}]}>
                              {t('map.activeCount', {
                                count: String(activity.totalActiveCount),
                              })}
                            </Text>
                            <Icon name="person" size={14} color={colors.primary} style={{marginLeft: 12}} />
                            <Text style={[styles.sheetActivityText, {color: colors.primary}]}>
                              {t('map.friendsCount', {
                                count: String(activity.friendsActiveCount),
                              })}
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
    top: 28,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 100,
  },
  mapSearchResults: {
    position: 'absolute',
    top: 28 + 50 + 8,
    left: 0,
    right: 0,
    zIndex: 110,
  },
  mapControlsColumn: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 250,
    alignItems: 'center',
    ...Platform.select({
      android: {elevation: 24},
    }),
  },
  mapControlSpacer: {
    height: MAP_CONTROL_GAP,
  },
  userMarkerWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  userMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
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
  locationHint: {
    position: 'absolute',
    top: 86,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 101,
  },
  locationHintText: {
    color: colors.white,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  carouselWrapper: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    zIndex: 60,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Dimensions.get('window').height * 0.55,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHandle: {alignItems: 'center', paddingTop: 10, paddingBottom: 6},
  sheetHandleBar: {width: 40, height: 5, backgroundColor: '#C7C7CC', borderRadius: 3},
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
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
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
  sheetItemRight: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minWidth: 80,
  },
  sheetDistance: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
});

export default MapScreen;
