/**
 * Centres Screen — “live fitness energy” frem for ren database.
 * Live-tællinger fra `useActiveCentersRealtime` (rollup + venner); søgning uændret.
 * Plads til senere: venne-avatars, center-vibes, events (kun struktur/kommentarer her).
 */

import React, {useState, useMemo, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {
  getLocationPermissionStatus,
  isLocationAuthorized,
  peekLastUserFix,
  rememberUserFix,
} from '@/services/location/locationPermission';
import Icon from 'react-native-vector-icons/Ionicons';
import danishGyms, {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';
import {useAppStore} from '@/store/appStore';
import {useGymStore} from '@/store/gymStore';
import {useNavigation} from '@react-navigation/native';
import GymLogoView from '@/components/ui/GymLogoView';
import {
  findGymByIdRelaxed,
  formatGymDisplayName,
  normalizeGymBrand,
} from '@/utils/gymDisplay';
import {useLocalCentersActivity} from '@/hooks/useLocalCentersActivity';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {useActiveCentersRealtime} from '@/hooks/useActiveCentersRealtime';
import type {ActiveCenter} from '@/types/activeCenter.types';
import {useTranslation} from '@/i18n';
import {useGymSearch} from '@/hooks/useGymSearch';
import {GymSearchResultsPanel} from '@/components/gym/GymSearchResultsPanel';
import {rankNearbyCentres, takeNearestGyms} from '@/utils/nearbyCentersRanking';
import {perfPhase} from '@/utils/perfMark';

type CentresScreenProps = {
  /** True when the Gyms sub-tab is selected (not merely Friends bottom tab). */
  isActive?: boolean;
};

type LiveStats = {total: number; friends: number};

function buildLiveByGymId(centers: ActiveCenter[]): Map<string, LiveStats> {
  const m = new Map<string, LiveStats>();
  for (const ac of centers) {
    m.set(ac.centerId, {
      total: ac.totalActiveCount,
      friends: ac.activeFriendsCount,
    });
  }
  return m;
}

function liveStatsForGym(
  gymId: string,
  liveMap: Map<string, LiveStats>,
  getActiveUsersCount: (id: string) => number,
): LiveStats {
  const hit = liveMap.get(gymId);
  if (hit) {
    return hit;
  }
  return {total: getActiveUsersCount(gymId), friends: 0};
}

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function formatDistanceMeters(distanceM: number): string {
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`;
  }
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function LiveActivityLine({live, pending}: {live: LiveStats; pending?: boolean}) {
  const {t} = useTranslation();
  if (pending && live.total <= 0 && live.friends <= 0) {
    return null;
  }
  if (live.total <= 0) {
    return (
      <Text style={styles.liveLineMuted} numberOfLines={1}>
        {t('centres.noOneActive')}
      </Text>
    );
  }
  if (live.friends > 0) {
    return (
      <Text style={styles.liveLine} numberOfLines={1}>
        {t('home.activeAndFriends', {
          active: String(live.total),
          friends: String(live.friends),
        })}
      </Text>
    );
  }
  return (
    <Text style={styles.liveLine} numberOfLines={1}>
      {t('centres.trainingNow', {count: String(live.total)})}
    </Text>
  );
}

function OpenClosedChip({isOpen}: {isOpen: boolean}) {
  const {t} = useTranslation();
  return (
    <View
      style={[
        styles.statusChip,
        isOpen ? styles.statusChipOpen : styles.statusChipClosed,
      ]}>
      <View
        style={[styles.statusDot, isOpen ? styles.statusDotOpen : styles.statusDotClosed]}
      />
      <Text
        style={[styles.statusChipText, isOpen ? styles.statusChipTextOpen : styles.statusChipTextClosed]}
        numberOfLines={1}>
        {isOpen ? t('centres.openNow') : t('centres.closedNow')}
      </Text>
    </View>
  );
}

/** “Mine lokale centre” — uden gul rang-badge; soft “Dit center” på første favorit. */
const FavoriteGymCard = ({
  gym,
  index,
  distanceText,
  live,
  livePending,
  gymStatus,
}: {
  gym: DanishGym;
  index: number;
  distanceText: string;
  live: LiveStats;
  livePending?: boolean;
  gymStatus: {isOpen: boolean};
}) => {
  const {t} = useTranslation();
  const navigation = useNavigation<StackNavigationProp<any>>();
  const showDitCenterChip = index === 0;

  return (
    <TouchableOpacity
      style={styles.favoriteCard}
      activeOpacity={0.72}
      onPress={() =>
        navigation.navigate('GymDetail', {
          gymId: gym.id,
          gym,
        })
      }>
      <View style={styles.favoriteCardInner}>
        <GymLogoView gymName={gym.name} brand={gym.brand} size={44} />
        <View style={styles.favoriteCardBody}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {formatGymDisplayName(gym)}
            </Text>
            {showDitCenterChip ? (
              <View style={styles.ditCenterChip}>
                <Text style={styles.ditCenterChipText}>{t('centres.yourGym')}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.primaryMetaRow}>
            <OpenClosedChip isOpen={gymStatus.isOpen} />
            <LiveActivityLine live={live} pending={livePending} />
          </View>
          <Text style={styles.cityDistanceLine} numberOfLines={1}>
            {[gym.city, distanceText].filter(Boolean).join(' · ')}
          </Text>
          {gym.address ? (
            <Text style={styles.addressTertiary} numberOfLines={1}>
              {gym.address}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={20} color={colors.textMuted} style={styles.rowChevron} />
      </View>
    </TouchableOpacity>
  );
};

type NearbyGymRowProps = {
  testID?: string;
  gym: DanishGym;
  isFavorite: boolean;
  isOpen: boolean;
  distanceText: string;
  live: LiveStats;
  livePending?: boolean;
  onPress: () => void;
};

const NearbyGymRow = React.memo(function NearbyGymRow({
  testID,
  gym,
  isFavorite,
  isOpen,
  distanceText,
  live,
  livePending,
  onPress,
}: NearbyGymRowProps) {
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.gymCard}
      activeOpacity={0.72}
      onPress={onPress}>
      <View style={styles.gymCardInner}>
        {isFavorite ? (
          <View style={[styles.gymIcon, styles.gymIconFavorite]}>
            <Icon name="star" size={22} color={colors.primaryLight} />
          </View>
        ) : (
          <GymLogoView
            gymName={formatGymDisplayName(gym)}
            brand={gym.brand}
            size={44}
            style={styles.gymLogoSlot}
          />
        )}
        <View style={styles.gymCardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {gym.name}
          </Text>
          <View style={styles.primaryMetaRow}>
            <OpenClosedChip isOpen={isOpen} />
            <LiveActivityLine live={live} pending={livePending} />
          </View>
          <Text style={styles.cityDistanceLine} numberOfLines={1}>
            {[gym.brand ? normalizeGymBrand(gym.brand) : null, gym.city, distanceText]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {gym.address ? (
            <Text style={styles.addressTertiary} numberOfLines={1}>
              {gym.address}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={20} color={colors.textMuted} style={styles.rowChevron} />
      </View>
    </TouchableOpacity>
  );
});

const CentresScreen = ({isActive = true}: CentresScreenProps) => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const user = useAppStore(s => s.user);
  const getActiveUsersCount = useGymStore(s => s.getActiveUsersCount);
  const getGymStatus = useGymStore(s => s.getGymStatus);
  const {activeCenters, settled: liveSettled} = useActiveCentersRealtime({
    enabled: isActive,
  });
  const {
    resolvedCenterIds,
    hasLocalCenters,
    loading: localCentersLoading,
  } = useLocalCentersActivity(user?.id, {enabled: isActive});
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(() => peekLastUserFix());
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [nearbyGyms, setNearbyGyms] = useState<DanishGym[]>([]);
  const [nearbyRanking, setNearbyRanking] = useState(false);
  const listRef = useRef<FlatList<DanishGym>>(null);

  const liveByGymId = useMemo(() => buildLiveByGymId(activeCenters), [activeCenters]);
  const liveByGymIdRef = useRef(liveByGymId);
  liveByGymIdRef.current = liveByGymId;
  const liveSettledRef = useRef(liveSettled);
  liveSettledRef.current = liveSettled;
  const rankedWithLiveRef = useRef(false);

  useEffect(() => {
    const applyFix = (latitude: number, longitude: number, cached: boolean) => {
      rememberUserFix(latitude, longitude);
      setUserLocation(prev => {
        if (
          prev &&
          Math.abs(prev.latitude - latitude) < 0.00001 &&
          Math.abs(prev.longitude - longitude) < 0.00001
        ) {
          return prev;
        }
        return {latitude, longitude};
      });
      if (!loggedGps) {
        loggedGps = true;
        perfPhase('centres', 'gps', cached ? 'cached=1' : 'cached=0');
      }
    };
    let loggedGps = false;
    const cached = peekLastUserFix();
    if (cached) {
      applyFix(cached.latitude, cached.longitude, true);
    }
    void getLocationPermissionStatus().then(status => {
      const afterProbe = peekLastUserFix();
      if (afterProbe) {
        applyFix(afterProbe.latitude, afterProbe.longitude, true);
        return;
      }
      if (!isLocationAuthorized(status)) {
        return;
      }
      Geolocation.getCurrentPosition(
        position => {
          const {latitude, longitude} = position.coords;
          applyFix(latitude, longitude, false);
        },
        () => {},
        {enableHighAccuracy: false, timeout: 8000, maximumAge: 120000},
      );
    });
  }, []);

  const favoriteGymIds = useMemo(() => {
    const fromDb = resolvedCenterIds.filter(Boolean);
    if (fromDb.length > 0) {
      return fromDb;
    }
    return (user?.favoriteGyms ?? []).filter(Boolean);
  }, [resolvedCenterIds, user?.favoriteGyms]);

  const favoriteGymIdSet = useMemo(
    () => new Set(favoriteGymIds),
    [favoriteGymIds],
  );

  const favoriteGyms = useMemo(() => {
    return favoriteGymIds
      .map(id => findGymByIdRelaxed(id))
      .filter((gym): gym is DanishGym => gym !== null);
  }, [favoriteGymIds]);

  const allCentres = useMemo(
    () => [...getActiveDanishGyms(), ...danishGyms.filter(g => g._center.is_coming_soon)],
    [],
  );

  const {hits: searchHits, isActive: isSearchActive, showLoading: searchLoading} =
    useGymSearch(searchQuery, {
      userLat: userLocation?.latitude,
      userLng: userLocation?.longitude,
      favoriteIds: favoriteGymIds,
      limit: 50,
      gyms: searchQuery.trim().length > 0 ? allCentres : [],
    });

  const searchListGyms = useMemo(
    () =>
      isSearchActive
        ? searchHits.map(h => h.gym).filter(gym => !favoriteGymIdSet.has(gym.id))
        : [],
    [isSearchActive, searchHits, favoriteGymIdSet],
  );

  useEffect(() => {
    if (!isActive || isSearchActive || !userLocation) {
      return;
    }
    let cancelled = false;
    rankedWithLiveRef.current = false;
    const nearestStarted = Date.now();
    const nearest = takeNearestGyms({
      gyms: allCentres,
      excludeIds: favoriteGymIdSet,
      userLocation,
      calculateDistanceMeters: calculateDistance,
    });
    if (!cancelled) {
      setNearbyGyms(nearest);
      perfPhase(
        'centres',
        'first_list',
        `count=${nearest.length} computeMs=${Date.now() - nearestStarted}`,
      );
    }
    setNearbyRanking(true);
    const timer = setTimeout(() => {
      if (cancelled) {
        return;
      }
      const rankStarted = Date.now();
      const ranked = rankNearbyCentres({
        gyms: allCentres,
        excludeIds: favoriteGymIdSet,
        userLocation,
        getGymStatus,
        liveByGymId: liveByGymIdRef.current,
        getActiveUsersCount,
        calculateDistanceMeters: calculateDistance,
      });
      if (cancelled) {
        return;
      }
      if (liveSettledRef.current) {
        rankedWithLiveRef.current = true;
      }
      setNearbyGyms(ranked);
      setNearbyRanking(false);
      perfPhase(
        'centres',
        'list',
        `count=${ranked.length} computeMs=${Date.now() - rankStarted}`,
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isActive,
    isSearchActive,
    allCentres,
    favoriteGymIdSet,
    userLocation,
    getGymStatus,
    getActiveUsersCount,
  ]);

  useEffect(() => {
    if (!isActive || isSearchActive || !userLocation || !liveSettled || rankedWithLiveRef.current) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || rankedWithLiveRef.current) {
        return;
      }
      const rankStarted = Date.now();
      const ranked = rankNearbyCentres({
        gyms: allCentres,
        excludeIds: favoriteGymIdSet,
        userLocation,
        getGymStatus,
        liveByGymId: liveByGymIdRef.current,
        getActiveUsersCount,
        calculateDistanceMeters: calculateDistance,
      });
      if (cancelled) {
        return;
      }
      rankedWithLiveRef.current = true;
      setNearbyGyms(ranked);
      perfPhase(
        'centres',
        'live_rank',
        `count=${ranked.length} computeMs=${Date.now() - rankStarted}`,
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isActive,
    isSearchActive,
    liveSettled,
    allCentres,
    favoriteGymIdSet,
    userLocation,
    getGymStatus,
    getActiveUsersCount,
  ]);

  const otherGymsSorted = isSearchActive ? searchListGyms : nearbyGyms;

  const distanceForGym = useCallback(
    (gym: DanishGym): string => {
      if (!userLocation) {
        return '';
      }
      const d = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        gym.latitude,
        gym.longitude,
      );
      return formatDistanceMeters(d);
    },
    [userLocation],
  );

  const favoriteGymsSorted = favoriteGyms;

  const hasSavedLocalCenters = hasLocalCenters || favoriteGymIds.length > 0;

  const showEmptyLocalOnboarding =
    Boolean(user?.id) &&
    !hasSavedLocalCenters &&
    !localCentersLoading &&
    searchQuery.length === 0;

  const listHeader = useMemo(
    () => (
      <>
        {showEmptyLocalOnboarding ? (
          <View style={styles.emptyLocalWrap}>
            <Text style={styles.emptyLocalTitle}>
              {t('phase2ui.noSavedCentersTitle')}
            </Text>
            <Text style={styles.emptyLocalBody}>
              {t('phase2ui.noSavedCentersBody')}
            </Text>
          </View>
        ) : null}

        {hasSavedLocalCenters && favoriteGymsSorted.length > 0 ? (
          <View style={styles.favoriteSection}>
            <Text style={styles.sectionTitle}>{t('centres.myLocalCentres')}</Text>
            <View style={styles.favoriteStack}>
              {favoriteGymsSorted.map((gym, index) => (
                <FavoriteGymCard
                  key={gym.id}
                  gym={gym}
                  index={index}
                  distanceText={distanceForGym(gym)}
                  live={liveStatsForGym(gym.id, liveByGymId, getActiveUsersCount)}
                  livePending={!liveSettled}
                  gymStatus={getGymStatus(gym.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.nearbyHeader}>
          <Text style={styles.nearbyHeaderText}>{t('centres.nearbyCentres')}</Text>
        </View>
      </>
    ),
    [
      showEmptyLocalOnboarding,
      hasSavedLocalCenters,
      favoriteGymsSorted,
      t,
      distanceForGym,
      liveByGymId,
      getActiveUsersCount,
      getGymStatus,
      liveSettled,
    ],
  );

  const renderNearbyItem = useCallback(
    ({item, index}: {item: DanishGym; index: number}) => (
      <NearbyGymRow
        testID={index === 0 ? 'centres-first-gym' : undefined}
        gym={item}
        isFavorite={favoriteGymIds.includes(item.id)}
        isOpen={getGymStatus(item.id).isOpen}
        distanceText={distanceForGym(item)}
        live={liveStatsForGym(item.id, liveByGymId, getActiveUsersCount)}
        livePending={!liveSettled}
        onPress={() =>
          navigation.navigate('GymDetail', {
            gymId: item.id,
            gym: item,
          })
        }
      />
    ),
    [
      favoriteGymIds,
      getGymStatus,
      distanceForGym,
      liveByGymId,
      getActiveUsersCount,
      liveSettled,
      navigation,
    ],
  );

  const keyExtractor = useCallback((item: DanishGym) => item.id, []);
  return (
    <View style={styles.container}>
      <SocialSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('centres.searchPlaceholder')}
        style={styles.searchOuter}
      />

      {isSearchActive ? (
        <GymSearchResultsPanel
          hits={searchHits}
          isActive={isSearchActive}
          showLoading={searchLoading}
          favoriteIds={favoriteGymIds}
          onSelectGym={gym =>
            navigation.navigate('GymDetail', {gymId: gym.id, gym})
          }
          formatDistance={gym => distanceForGym(gym)}
          style={[styles.searchResultsPanel, styles.searchResultsFlex]}
        />
      ) : null}

      {!isSearchActive ? (
      <FlatList
        ref={listRef}
        data={otherGymsSorted}
        keyExtractor={keyExtractor}
        renderItem={renderNearbyItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          nearbyRanking && !isSearchActive ? (
            <View style={styles.nearbyLoadingFooter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !userLocation || nearbyRanking ? (
            <View style={styles.nearbyLoadingFooter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !isSearchActive ? (
            <View style={styles.nearbyEmptyWrap}>
              <Text style={styles.nearbyEmptyText}>{t('centres.searchPlaceholder')}</Text>
            </View>
          ) : null
        }
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        onScroll={event => {
          setShowScrollToTop(event.nativeEvent.contentOffset.y > 500);
        }}
        scrollEventThrottle={16}
      />
      ) : null}

      {showScrollToTop && !isSearchActive && (
        <TouchableOpacity
          style={styles.scrollToTopButton}
          onPress={() => listRef.current?.scrollToOffset({offset: 0, animated: true})}
          activeOpacity={0.9}>
          <Icon name="arrow-up" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {flex: 1},
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  searchResultsPanel: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchResultsFlex: {
    flex: 1,
    marginBottom: 0,
  },
  searchOuter: {
    marginHorizontal: spacing.lg,
    marginTop: 10,
    marginBottom: 10,
  },
  nearbyLoadingFooter: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  nearbyEmptyWrap: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  nearbyEmptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  rowChevron: {alignSelf: 'center', marginLeft: spacing.sm},
  emptyLocalWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyLocalTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyLocalBody: {
    ...typography.body,
    color: colors.textTertiary,
    lineHeight: 22,
  },
  favoriteSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  favoriteStack: {
    gap: spacing.md,
  },
  favoriteCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  favoriteCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  favoriteCardBody: {
    flex: 1,
    minWidth: 0,
  },
  gymCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  gymCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  gymCardBody: {
    flex: 1,
    minWidth: 0,
  },
  nearbyHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  nearbyHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  ditCenterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary + '14',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '35',
  },
  ditCenterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: 0.2,
  },
  primaryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 6,
  },
  statusChipOpen: {
    backgroundColor: colors.success + '18',
  },
  statusChipClosed: {
    backgroundColor: colors.errorLight + '22',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotOpen: {backgroundColor: colors.success},
  statusDotClosed: {backgroundColor: colors.error},
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusChipTextOpen: {color: colors.secondaryDark},
  statusChipTextClosed: {color: colors.error},
  liveLine: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  liveLineMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  cityDistanceLine: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 2,
  },
  addressTertiary: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  gymIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymIconFavorite: {
    backgroundColor: colors.primary + '14',
  },
  gymLogoSlot: {},
  scrollToTopButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
});

export default CentresScreen;
