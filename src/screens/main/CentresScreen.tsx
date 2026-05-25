/**
 * Centres Screen — “live fitness energy” frem for ren database.
 * Live-tællinger fra `useActiveCentersRealtime` (rollup + venner); søgning uændret.
 * Plads til senere: venne-avatars, center-vibes, events (kun struktur/kommentarer her).
 */

import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {
  getLocationPermissionStatus,
  isLocationAuthorized,
} from '@/services/location/locationPermission';
import Icon from 'react-native-vector-icons/Ionicons';
import danishGyms, {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';
import {useAppStore} from '@/store/appStore';
import {useGymStore} from '@/store/gymStore';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymDisplayName, normalizeGymBrand} from '@/utils/gymDisplay';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {useActiveCentersRealtime} from '@/hooks/useActiveCentersRealtime';
import type {ActiveCenter} from '@/types/activeCenter.types';
import {centerSocialRankScore} from '@/utils/centerSocialRank';
import {useTranslation} from '@/i18n';
import {useGymSearch} from '@/hooks/useGymSearch';
import {GymSearchResultsPanel} from '@/components/gym/GymSearchResultsPanel';

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

function LiveActivityLine({live}: {live: LiveStats}) {
  const {t} = useTranslation();
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
  gymStatus,
}: {
  gym: DanishGym;
  index: number;
  distanceText: string;
  live: LiveStats;
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
            <LiveActivityLine live={live} />
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

const CentresScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const {user} = useAppStore();
  const {getActiveUsersCount, getGymStatus} = useGymStore();
  const {activeCenters, refresh: refreshActiveCenters} = useActiveCentersRealtime();
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const liveByGymId = useMemo(() => buildLiveByGymId(activeCenters), [activeCenters]);

  useFocusEffect(
    useCallback(() => {
      void refreshActiveCenters();
    }, [refreshActiveCenters]),
  );

  useEffect(() => {
    void getLocationPermissionStatus().then(status => {
      if (!isLocationAuthorized(status)) {
        return;
      }
      Geolocation.getCurrentPosition(
        position => {
          const {latitude, longitude} = position.coords;
          setUserLocation({latitude, longitude});
        },
        () => {},
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    });
  }, []);

  const favoriteGymIds = user?.favoriteGyms || [];
  const favoriteGyms = useMemo(() => {
    return favoriteGymIds
      .map(id => danishGyms.find(gym => gym.id === id))
      .filter((gym): gym is DanishGym => gym !== undefined);
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
      gyms: allCentres,
    });

  const sortedGyms = useMemo(() => {
    if (isSearchActive) {
      return searchHits.map(h => h.gym);
    }

    const otherGyms = allCentres.filter(gym => !favoriteGymIds.includes(gym.id));
    const allGyms = [...favoriteGyms, ...otherGyms];

    return allGyms
      .map(gym => {
        const status = getGymStatus(gym.id);
        let distance = Infinity;
        if (userLocation) {
          distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            gym.latitude,
            gym.longitude,
          );
        }
        const live = liveStatsForGym(gym.id, liveByGymId, getActiveUsersCount);
        const score = centerSocialRankScore(live, distance);
        return {gym, isOpen: status.isOpen, distance, score};
      })
      .sort((a, b) => {
        if (a.isOpen && !b.isOpen) {
          return -1;
        }
        if (!a.isOpen && b.isOpen) {
          return 1;
        }
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.distance - b.distance;
      })
      .map(item => item.gym);
  }, [
    isSearchActive,
    searchHits,
    favoriteGyms,
    allCentres,
    favoriteGymIds,
    userLocation,
    getGymStatus,
    liveByGymId,
    getActiveUsersCount,
  ]);

  const isFavorite = (gymId: string) => favoriteGymIds.includes(gymId);

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

  const GymIcon = ({gym, favorite}: {gym: DanishGym; favorite: boolean}) => {
    if (favorite) {
      return (
        <View style={[styles.gymIcon, styles.gymIconFavorite]}>
          <Icon name="star" size={22} color={colors.primaryLight} />
        </View>
      );
    }
    return (
      <GymLogoView
        gymName={formatGymDisplayName(gym)}
        brand={gym.brand}
        size={44}
        style={styles.gymLogoSlot}
      />
    );
  };

  const renderGymItem = (item: DanishGym) => {
    const favorite = isFavorite(item.id);
    const gymStatus = getGymStatus(item.id);
    const distanceText = distanceForGym(item);
    const live = liveStatsForGym(item.id, liveByGymId, getActiveUsersCount);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.gymCard}
        activeOpacity={0.72}
        onPress={() => {
          navigation.navigate('GymDetail', {
            gymId: item.id,
            gym: item,
          });
        }}>
        <View style={styles.gymCardInner}>
          <GymIcon gym={item} favorite={favorite} />
          <View style={styles.gymCardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.primaryMetaRow}>
              <OpenClosedChip isOpen={gymStatus.isOpen} />
              <LiveActivityLine live={live} />
            </View>
            <Text style={styles.cityDistanceLine} numberOfLines={1}>
              {[
                item.brand ? normalizeGymBrand(item.brand) : null,
                item.city,
                distanceText,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {item.address ? (
              <Text style={styles.addressTertiary} numberOfLines={1}>
                {item.address}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron-forward" size={20} color={colors.textMuted} style={styles.rowChevron} />
        </View>
      </TouchableOpacity>
    );
  };

  const favoriteGymsSorted = sortedGyms.filter(gym => favoriteGymIds.includes(gym.id));
  const otherGymsSorted = sortedGyms.filter(gym => !favoriteGymIds.includes(gym.id));

  const showEmptyLocalOnboarding =
    Boolean(user?.id) && favoriteGymIds.length === 0 && searchQuery.length === 0;

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
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={event => {
          setShowScrollToTop(event.nativeEvent.contentOffset.y > 500);
        }}
        scrollEventThrottle={16}>
        {showEmptyLocalOnboarding && !isSearchActive ? (
          <View style={styles.emptyLocalWrap}>
            <Text style={styles.emptyLocalTitle}>Ingen gemte centre endnu</Text>
            <Text style={styles.emptyLocalBody}>
              Find centre og se hvem der træner lige nu 👀 Søg ovenfor eller tjek ind på et center — det
              gemmes som dit lokale spot.
            </Text>
          </View>
        ) : null}

        {favoriteGymsSorted.length > 0 && !isSearchActive && (
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
                  gymStatus={getGymStatus(gym.id)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.nearbyHeader}>
          <Text style={styles.nearbyHeaderText}>{t('centres.nearbyCentres')}</Text>
        </View>

        <View style={styles.list}>
          {otherGymsSorted.map(gym => (
            <View key={gym.id} style={styles.listRowGap}>
              {renderGymItem(gym)}
            </View>
          ))}
        </View>
      </ScrollView>
      ) : null}

      {showScrollToTop && !isSearchActive && (
        <TouchableOpacity
          style={styles.scrollToTopButton}
          onPress={() => scrollViewRef.current?.scrollTo({y: 0, animated: true})}
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
  list: {
    paddingHorizontal: spacing.lg,
  },
  listRowGap: {
    marginBottom: spacing.md,
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
