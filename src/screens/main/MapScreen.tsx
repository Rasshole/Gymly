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
import {useNavigation} from '@react-navigation/native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {StackNavigationProp} from '@react-navigation/stack';
import {DanishGym} from '@/data/danishGyms';
import {
  buildMapRuntimeInChunks,
  peekMapRuntime,
  type MapRuntime,
} from '@/data/mapRuntime';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {useTranslation} from '@/i18n';
import {useGymSearch} from '@/hooks/useGymSearch';
import {GymSearchResultsPanel} from '@/components/gym/GymSearchResultsPanel';
import {pickBrowseGyms} from '@/utils/pickBrowseGyms';
import {isFocusRefreshStale, markFocusRefreshed} from '@/utils/focusRefreshThrottle';
import {useMapViewportMarkers} from '@/hooks/useMapViewportMarkers';
import type {MapDisplayMarker} from '@/utils/mapMarkerClustering';
import {
  normalizeMapRegion,
  regionsApproxEqual,
} from '@/utils/normalizeMapRegion';
import {useAppStore} from '@/store/appStore';
import {useOnlineUsers} from '@/hooks/useOnlineUsers';
import {getMapCenterActivity} from '@/data/mapCenterActivity';
import {type MapCenter} from '@/data/mapCentersData';
import type {MapCenterSpatialIndex} from '@/utils/mapCenterSpatialIndex';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import {
  SelectedCenterCard,
  NearbyCentersCarousel,
  MapFloatingButton,
  MapTypePickerMenu,
} from '@/components/map';
import MapGymLogoMarker, {
  subscribeMapSnapshotDrain,
} from '@/components/map/MapGymLogoMarker';
import {
  MAP_FAB_GAP,
  MAP_FAB_SIZE,
} from '@/components/map/MapFloatingButton';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {
  loadMapGymBadges,
  peekSettledMapGymBadges,
  takePrefetchedMapGymBadges,
} from '@/services/supabase/presenceService';
import {perfEnd, perfHas, perfPhase, perfStart} from '@/utils/perfMark';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';

type MapScreenProps = {
  /** True when the Map sub-tab is selected. */
  isActive?: boolean;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAP_CONTROL_GAP = MAP_FAB_GAP;
const MAP_CONTROL_SIZE = MAP_FAB_SIZE;

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

const EMPTY_GYMS: readonly DanishGym[] = [];
const EMPTY_GYM_BY_ID: ReadonlyMap<string, DanishGym> = new Map();
const EMPTY_CENTERS: readonly MapCenter[] = [];
const EMPTY_CENTER_INDEX: MapCenterSpatialIndex = {cellDeg: 0.35, buckets: new Map()};

function overlayLiveCounts(
  center: MapCenter,
  friendsByGymId: ReadonlyMap<string, number>,
  totalByGymId: ReadonlyMap<string, number>,
): MapCenter {
  const friendsActiveCount = friendsByGymId.get(center.id) ?? 0;
  const totalActiveCount = Math.max(totalByGymId.get(center.id) ?? 0, friendsActiveCount);
  if (
    center.friendsActiveCount === friendsActiveCount &&
    center.totalActiveCount === totalActiveCount
  ) {
    return center;
  }
  return {...center, friendsActiveCount, totalActiveCount};
}

const MapScreen = ({isActive = true}: MapScreenProps) => {
  const [mapRuntime, setMapRuntime] = useState<MapRuntime | null>(() => peekMapRuntime());
  const mapGyms = mapRuntime?.gyms ?? EMPTY_GYMS;
  const mapGymById = mapRuntime?.gymById ?? EMPTY_GYM_BY_ID;
  const baseMapCenters = mapRuntime?.baseCenters ?? EMPTY_CENTERS;
  const mapCenterIndex = mapRuntime?.centerIndex ?? EMPTY_CENTER_INDEX;

  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();
  const {user} = useAppStore();
  const currentUserId = user?.id || '';
  const {users: onlineFriends, refresh: refreshOnlineFriends} = useOnlineUsers(
    currentUserId || undefined,
    {filter: 'venner', enabled: isActive},
  );

  const [mapFriendsByGymId, setMapFriendsByGymId] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [mapTotalByGymId, setMapTotalByGymId] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [badgesReady, setBadgesReady] = useState(false);
  const badgesReadyRef = useRef(badgesReady);
  badgesReadyRef.current = badgesReady;
  const [mapNativeReady, setMapNativeReady] = useState(false);

  useEffect(() => {
    perfPhase('map', 'map_mount');
    const existing = peekMapRuntime();
    if (existing) {
      setMapRuntime(existing);
      perfPhase('map', 'runtime', 'buildMs=0');
      return;
    }
    return buildMapRuntimeInChunks((runtime, buildMs) => {
      setMapRuntime(runtime);
      perfPhase('map', 'runtime', `buildMs=${buildMs}`);
    });
  }, []);

  const refreshMapBadges = useCallback(async () => {
    if (!user?.id) {
      setMapFriendsByGymId(new Map());
      setMapTotalByGymId(new Map());
      setBadgesReady(true);
      return;
    }
    try {
      const fetchStarted = Date.now();
      const prefetched = takePrefetchedMapGymBadges(user.id);
      const settled = prefetched ? null : peekSettledMapGymBadges(user.id);
      const {friendsByGymId, totalByGymId} = settled
        ? settled
        : await (prefetched ?? loadMapGymBadges(user.id));
      setMapFriendsByGymId(friendsByGymId);
      setMapTotalByGymId(totalByGymId);
      setBadgesReady(true);
      perfPhase(
        'map',
        'badges',
        `fetchMs=${Date.now() - fetchStarted} gyms=${totalByGymId.size}`,
      );
    } catch (e) {
      setMapFriendsByGymId(new Map());
      setMapTotalByGymId(new Map());
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'message' in e
            ? String((e as {message: unknown}).message)
            : String(e);
      perfPhase('map', 'badges_error', message.slice(0, 160));
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isActive || !mapNativeReady) {
      return;
    }
    perfPhase('map', 'visible');
  }, [isActive, mapNativeReady]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const mapKey = user?.id ? `map:badges:${user.id}` : 'map:badges:anon';
    if (!isFocusRefreshStale(mapKey, 30_000)) {
      if (badgesReadyRef.current) {
        perfPhase('map', 'badges', 'fetchMs=0 cached=1');
      }
      return;
    }
    void refreshMapBadges();
    void refreshOnlineFriends();
    markFocusRefreshed(mapKey);
  }, [isActive, refreshMapBadges, refreshOnlineFriends, user?.id]);

  useEffect(() => {
    if (!isActive || !user?.id) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    });
  }, [isActive, user?.id, refreshMapBadges, refreshOnlineFriends]);

  /** Udebliver Realtime: sjælden synk (rollup + venner) */
  useEffect(() => {
    if (!isActive || !user?.id) {
      return;
    }
    const timer = setInterval(() => {
      void refreshMapBadges();
      void refreshOnlineFriends();
    }, 3 * 60_000);
    return () => clearInterval(timer);
  }, [isActive, user?.id, refreshMapBadges, refreshOnlineFriends]);

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
  const hasCenteredMapOnUserRef = useRef(false);
  const userBrowsingRef = useRef(false);
  const panGestureStartedRef = useRef(false);
  const seededRuntimeRef = useRef(false);
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const pendingProgrammaticRegionRef = useRef<Region | null>(null);
  const seedMapRegionRef = useRef<
    ((region: Region, opts?: {immediate?: boolean}) => void) | null
  >(null);
  const [followUserMode, setFollowUserMode] = useState(false);
  const [browsingAway, setBrowsingAway] = useState(false);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    'idle' | 'granted' | 'denied' | 'unavailable'
  >('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCentersSheet, setShowCentersSheet] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');
  const [showMapTypePicker, setShowMapTypePicker] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();
  /** Over nearby carousel with breathing room — lower = closer to cards. */
  const mapControlsBottom = tabBarHeight + 96;
  const mapControlsEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) {
      return;
    }
    mapControlsEntrance.setValue(0);
    Animated.timing(mapControlsEntrance, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isActive, mapControlsEntrance]);

  const homeRegion = useMemo<Region>(
    () => ({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    }),
    [userLocation.latitude, userLocation.longitude],
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
    if (!isActive) {
      return;
    }
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
  }, [isActive, markerPulse]);

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
      } else if (!hasCenteredMapOnUserRef.current) {
        hasCenteredMapOnUserRef.current = true;
        const region: Region = {
          latitude,
          longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };
        // Seed discovery markers once from GPS — later pans must not be overwritten by GPS.
        pendingProgrammaticRegionRef.current = region;
        seedMapRegionRef.current?.(region, {immediate: true});
        mapRef.current?.animateToRegion(region, 900);
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

  useEffect(() => {
    if (!isActive) {
      if (watchIdRef.current != null) {
        Geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setFollowUserMode(false);
      return;
    }
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
  }, [isActive, startLocationWatchIfAuthorized]);

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
      gyms: (searchQuery.trim().length > 0 && mapRuntime
        ? mapRuntime.gyms
        : EMPTY_GYMS) as DanishGym[],
    });

  const searchMatchIds = useMemo(
    () => new Set(searchHits.map(h => h.gym.id)),
    [searchHits],
  );

  const mapCenterById = useMemo(() => {
    const byId = new Map<string, MapCenter>();
    for (const center of baseMapCenters) {
      byId.set(center.id, center);
    }
    return byId;
  }, [baseMapCenters]);

  /**
   * Discovery-map markers — geography from settled MapView region only.
   * `onRegionChange` must be registered or iOS Apple Maps never emits complete.
   */
  const {
    mapDisplayMarkers: viewportLogoMarkers,
    settledMapRegion,
    onRegionChange,
    onRegionChangeComplete,
    seedMapRegion,
  } = useMapViewportMarkers({
    index: mapCenterIndex,
    initialRegion,
    isActive,
    selectedId: selectedGym?.id,
    centerById: mapCenterById,
  });
  seedMapRegionRef.current = seedMapRegion;

  useEffect(() => {
    if (!mapRuntime || seededRuntimeRef.current) {
      return;
    }
    seededRuntimeRef.current = true;
    const loc = userLocationRef.current;
    seedMapRegionRef.current?.(
      {
        latitude: loc.latitude,
        longitude: loc.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      },
      {immediate: true},
    );
  }, [mapRuntime]);

  /**
   * Search overrides browse markers; carousel / GPS never do.
   * Keep the last marker list while the map tab is hidden. Clearing and
   * reinserting the pins makes AIRMap insert a child past the end of its
   * subview array and abort the app.
   */
  const heldMapMarkersRef = useRef<MapDisplayMarker[]>([]);
  const mapDisplayMarkers: MapDisplayMarker[] = useMemo(() => {
    if (!isActive) {
      return heldMapMarkersRef.current;
    }
    if (!isSearchActive) {
      heldMapMarkersRef.current = viewportLogoMarkers;
      return viewportLogoMarkers;
    }
    const matched: MapCenter[] = [];
    for (const id of searchMatchIds) {
      const c = mapCenterById.get(id);
      if (c) {
        matched.push(c);
      }
    }
    const selectedId = selectedGym?.id;
    if (selectedId && !matched.some(c => c.id === selectedId)) {
      const sel = mapCenterById.get(selectedId);
      if (sel) {
        matched.push(sel);
      }
    }
    const searchMarkers = matched.map(center => ({kind: 'single' as const, center}));
    heldMapMarkersRef.current = searchMarkers;
    return searchMarkers;
  }, [
    isActive,
    isSearchActive,
    viewportLogoMarkers,
    searchMatchIds,
    mapCenterById,
    selectedGym?.id,
  ]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const count = mapDisplayMarkers.reduce(
      (n, item) => n + (item.kind === 'single' ? 1 : 0),
      0,
    );
    perfPhase('map', 'markers_js', `count=${count}`);
    if (mapNativeReady) {
      perfPhase('map', 'markers_native', `count=${count}`);
    }
    if (perfHas('map_pan')) {
      perfPhase('map_pan', 'markers_js', `count=${count}`);
      perfPhase('map_pan', 'pan_settled', `count=${count}`);
      perfEnd('map_pan');
    }
    if (!mapNativeReady || count === 0) {
      return;
    }
    const rich = mapDisplayMarkers.reduce((n, item) => {
      if (item.kind !== 'single') {
        return n;
      }
      if (
        item.center.totalActiveCount > 0 ||
        item.center.friendsActiveCount > 0 ||
        item.center.id === selectedGym?.id
      ) {
        return n + 1;
      }
      return n;
    }, 0);
    if (rich === 0) {
      perfPhase('map', 'snapshots_done', `count=0 elapsedMs=0 pins=${count}`);
    }
  }, [isActive, mapDisplayMarkers, mapNativeReady, selectedGym?.id]);

  useEffect(() => {
    return subscribeMapSnapshotDrain((count, elapsedMs) => {
      perfPhase('map', 'snapshots_done', `count=${count} elapsedMs=${elapsedMs}`);
      if (perfHas('map_pan')) {
        perfPhase('map_pan', 'snapshots_done', `count=${count} elapsedMs=${elapsedMs}`);
      }
    });
  }, []);

  const mapCatalogWarnedRef = useRef(false);
  useEffect(() => {
    if (!__DEV__ || !mapRuntime || mapCatalogWarnedRef.current) {
      return;
    }
    mapCatalogWarnedRef.current = true;
    const total = mapRuntime.gyms.length;
    const explicit = mapRuntime.baseCenters.filter(c => c.hasExplicitGeocode).length;
    const approx = total - explicit;
    console.warn(
      `[Map] Aktive centre: ${total}. Eksplicit lat/lng i JSON: ${explicit}. Post/fallback: ${approx}. Markører: ${mapRuntime.baseCenters.length}.`,
    );
    if (approx > 0) {
      console.warn(
        '[Map] Kør: node scripts/geocode-centers.mjs for at skrive rigtige koordinater til centers.json',
      );
    }
  }, [mapRuntime]);

  const hasActiveGymsOnMap = useMemo(() => {
    for (const count of mapTotalByGymId.values()) {
      if (count > 0) {
        return true;
      }
    }
    return false;
  }, [mapTotalByGymId]);

  /** Carousel follows browsed viewport markers — not GPS nearby. */
  const nearestCentersForCarousel = useMemo(() => {
    if (!isActive) {
      return [];
    }
    const viewportGyms: DanishGym[] = [];
    for (const marker of mapDisplayMarkers) {
      if (marker.kind !== 'single') {
        continue;
      }
      const gym = mapGymById.get(marker.center.id);
      if (gym) {
        viewportGyms.push(gym);
      }
    }
    if (viewportGyms.length === 0) {
      return [];
    }
    const mapLat = settledMapRegion.latitude;
    const mapLng = settledMapRegion.longitude;
    const ranked = [...viewportGyms].sort((a, b) => {
      const da = calculateDistance(mapLat, mapLng, a.latitude, a.longitude);
      const db = calculateDistance(mapLat, mapLng, b.latitude, b.longitude);
      return da - db;
    });
    return ranked.slice(0, 40).map(gym => {
      const distanceKm = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        gym.latitude,
        gym.longitude,
      );
      return {
        gym,
        distanceText:
          distanceKm < 1
            ? `${Math.round(distanceKm * 1000)} m`
            : `${distanceKm.toFixed(1)} km`,
        totalActiveCount: Math.max(
          mapTotalByGymId.get(gym.id) ?? 0,
          mapFriendsByGymId.get(gym.id) ?? 0,
        ),
        friendsActiveCount: mapFriendsByGymId.get(gym.id) ?? 0,
      };
    });
  }, [
    isActive,
    mapDisplayMarkers,
    mapGymById,
    mapFriendsByGymId,
    mapTotalByGymId,
    settledMapRegion.latitude,
    settledMapRegion.longitude,
    userLocation.latitude,
    userLocation.longitude,
  ]);

  const categorizedGyms = useMemo(() => {
    if (!isActive || !showCentersSheet) {
      return {within5km: [] as DanishGym[], beyond5km: [] as DanishGym[]};
    }
    const pool = pickBrowseGyms({
      gyms: mapGyms as DanishGym[],
      userLocation,
      cap: 80,
    });
    const within5km: DanishGym[] = [];
    const beyond5km: DanishGym[] = [];
    for (const gym of pool) {
      const d = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        gym.latitude,
        gym.longitude,
      );
      if (d <= 5) {
        within5km.push(gym);
      } else {
        beyond5km.push(gym);
      }
    }
    return {
      within5km: within5km.slice(0, 30),
      beyond5km: beyond5km.slice(0, 40),
    };
  }, [isActive, showCentersSheet, userLocation, mapGyms]);

  const handleSelectGym = useCallback(
    (gym: DanishGym) => {
      if (Platform.OS === 'android') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setSelectedGym(gym);
      const mc = mapCenterById.get(gym.id);
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
    [mapCenterById],
  );

  const handleCloseSelection = useCallback(() => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectedGym(null);
    setShowCentersSheet(false);
    setTimeout(() => {
      mapRef.current?.animateToRegion(homeRegion, 500);
    }, 100);
  }, [homeRegion]);

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

  const renderMapDisplayMarker = useCallback(
    (item: MapDisplayMarker) => {
      if (item.kind !== 'single') {
        return null;
      }
      const center = overlayLiveCounts(item.center, mapFriendsByGymId, mapTotalByGymId);
      const gym = mapGymById.get(center.id);
      if (!gym) {
        return null;
      }
      const isSelected = selectedGym?.id === center.id;
      return (
        <MapGymLogoMarker
          key={center.id}
          center={center}
          gym={gym}
          selected={isSelected}
          onPress={handleSelectGym}
        />
      );
    },
    [handleSelectGym, mapFriendsByGymId, mapGymById, mapTotalByGymId, selectedGym?.id],
  );

  const selectedActivity = useMemo(() => {
    if (!selectedGym) {
      return null;
    }
    const friendsActiveCount = mapFriendsByGymId.get(selectedGym.id) ?? 0;
    const totalActiveCount = Math.max(
      mapTotalByGymId.get(selectedGym.id) ?? 0,
      friendsActiveCount,
    );
    return getMapCenterActivity(selectedGym.id, friendsActiveCount, totalActiveCount);
  }, [selectedGym, mapFriendsByGymId, mapTotalByGymId]);

  const getActivityForGymId = useCallback(
    (gymId: string) => {
      const friendsActiveCount = mapFriendsByGymId.get(gymId) ?? 0;
      const totalActiveCount = Math.max(
        mapTotalByGymId.get(gymId) ?? 0,
        friendsActiveCount,
      );
      return getMapCenterActivity(gymId, friendsActiveCount, totalActiveCount);
    },
    [mapFriendsByGymId, mapTotalByGymId],
  );

  const friendNamesAtSelected = selectedGym
    ? friends.filter(f => f.gymId === selectedGym.id).map(f => f.name)
    : [];

  const mapCenterKm = calculateDistance(
    settledMapRegion.latitude,
    settledMapRegion.longitude,
    userLocation.latitude,
    userLocation.longitude,
  );
  const halfLat = Math.abs(settledMapRegion.latitudeDelta) / 2;
  const halfLng = Math.abs(settledMapRegion.longitudeDelta) / 2;
  const userOutsideViewport =
    halfLat > 0 &&
    halfLng > 0 &&
    (Math.abs(settledMapRegion.latitude - userLocation.latitude) > halfLat ||
      Math.abs(settledMapRegion.longitude - userLocation.longitude) > halfLng);
  // A wide zoom can still contain the user after a pan into another neighbourhood.
  const viewportAwayFromUser = userOutsideViewport || mapCenterKm > 0.5;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        // Native compass sits top-right and cannot join the FAB stack reliably
        // (compassOffset is not applied on Apple Maps). Custom compass is below.
        showsCompass={false}
        mapType={mapType}
        scrollEnabled
        zoomEnabled
        pitchEnabled
        rotateEnabled
        onPanDrag={() => {
          userBrowsingRef.current = true;
          setBrowsingAway(true);
          if (!panGestureStartedRef.current) {
            panGestureStartedRef.current = true;
            perfStart('map_pan', 'pan_start');
          }
          if (followUserMode) {
            setFollowUserMode(false);
          }
        }}
        // iOS Apple Maps: onRegionChange MUST be set or complete events are never emitted.
        onRegionChange={region => {
          const normalized = normalizeMapRegion(region);
          if (!normalized) {
            return;
          }
          onRegionChange(normalized);
        }}
        onRegionChangeComplete={(region, gesture) => {
          const normalized = normalizeMapRegion(region);
          if (!normalized) {
            return;
          }
          const pending = pendingProgrammaticRegionRef.current;
          if (pending && regionsApproxEqual(normalized, pending)) {
            pendingProgrammaticRegionRef.current = null;
            // Stale initial GPS animate finished after the user already browsed away.
            if (userBrowsingRef.current && !followUserMode) {
              return;
            }
          }
          onRegionChangeComplete(normalized);
          if (panGestureStartedRef.current) {
            panGestureStartedRef.current = false;
            perfPhase('map_pan', 'pan_end');
          }
          if (followUserMode && gesture?.isGesture) {
            setFollowUserMode(false);
          }
        }}
        onMapReady={() => {
          setMapNativeReady(true);
          perfPhase('map', 'map_ready');
          if (!hasCenteredMapOnUserRef.current) {
            pendingProgrammaticRegionRef.current = initialRegion;
            mapRef.current?.animateToRegion(initialRegion, 1000);
          }
        }}>
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
        {mapNativeReady ? mapDisplayMarkers.map(renderMapDisplayMarker) : null}
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
        onSelect={nextType => {
          setMapType(nextType);
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
          activityKnown={badgesReady}
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
            hasActiveGyms={hasActiveGymsOnMap}
            browsingAway={browsingAway || viewportAwayFromUser}
            activityKnown={badgesReady}
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
          icon="compass-outline"
          accessibilityLabel={t('map.resetNorth')}
          onPress={() => {
            mapRef.current?.animateCamera({heading: 0, pitch: 0}, {duration: 350});
          }}
        />
        <View style={styles.mapControlSpacer} />
        <MapFloatingButton
          icon="layers-outline"
          accessibilityLabel={t('a11y.mapType')}
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
              userBrowsingRef.current = false;
              setBrowsingAway(false);
              setFollowUserMode(true);
              const region: Region = {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              };
              pendingProgrammaticRegionRef.current = region;
              seedMapRegion(region, {immediate: true});
              mapRef.current?.animateCamera(
                {
                  center: userLocation,
                  zoom: 16.2,
                  heading: 0,
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
          <Text style={styles.centersBarText}>
            {t(browsingAway || viewportAwayFromUser ? 'map.inThisArea' : 'map.nearby')}
          </Text>
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
                          {badgesReady ? (
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
                          ) : null}
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
                          {badgesReady ? (
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
                          ) : null}
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
