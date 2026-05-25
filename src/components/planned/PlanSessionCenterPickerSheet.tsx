/**
 * Bottom sheet: vælg center til planlagt session (ingen keyboard på hovedfelt).
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import {useAppStore} from '@/store/appStore';
import {useGymStore} from '@/store/gymStore';
import GymLogoView from '@/components/ui/GymLogoView';
import {
  formatGymDisplayName,
  findGymById,
  findGymByIdRelaxed,
  normalizeGymBrand,
} from '@/utils/gymDisplay';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';
import {useActiveCentersRealtime} from '@/hooks/useActiveCentersRealtime';
import {useOptionalUserCoords} from '@/hooks/useOptionalUserCoords';
import type {ActiveCenter} from '@/types/activeCenter.types';
import {useTranslation, rt} from '@/i18n';

const ALL_ACTIVE = getActiveDanishGyms();

type LiveStats = {total: number; friends: number};

type GymSection = {
  title: string;
  data: DanishGym[];
};

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

const calculateDistanceM = (
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

function gymSearchHaystack(gym: DanishGym): string {
  const brandNorm = normalizeGymBrand(gym.brand);
  const rawBrand = (gym.brand ?? '').trim();
  return `${gym.name} ${rawBrand} ${brandNorm} ${gym.city ?? ''} ${gym.address ?? ''} ${gym.postalCode ?? ''} ${gym.region ?? ''}`
    .toLowerCase()
    .replace(/,/g, ' ');
}

function tokensMatch(haystack: string, tokens: string[]): boolean {
  return tokens.every(t => haystack.includes(t));
}

function OpenClosedChip({isOpen}: {isOpen: boolean}) {
  return (
    <View style={[styles.statusChip, isOpen ? styles.statusChipOpen : styles.statusChipClosed]}>
      <View style={[styles.statusDot, isOpen ? styles.statusDotOpen : styles.statusDotClosed]} />
      <Text
        style={[styles.statusChipText, isOpen ? styles.statusChipTextOpen : styles.statusChipTextClosed]}
        numberOfLines={1}>
        {isOpen ? rt('centerPicker.openNow') : rt('centerPicker.closedNow')}
      </Text>
    </View>
  );
}

function PlanCenterListSeparator() {
  return <View style={styles.listItemGap} />;
}

function LiveLine({live}: {live: LiveStats}) {
  if (live.total <= 0) {
    return (
      <Text style={styles.liveMuted} numberOfLines={1}>
        {rt('centerPicker.noActive')}
      </Text>
    );
  }
  const people = `${live.total} aktiv${live.total > 1 ? 'e' : ''}`;
  const friendsPart =
    live.friends > 0 ? ` · ${live.friends} ven${live.friends > 1 ? 'ner' : ''}` : '';
  return (
    <Text style={styles.liveLine} numberOfLines={1}>
      👥 {people}
      {friendsPart}
    </Text>
  );
}

export type PlanSessionCenterPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (gym: DanishGym) => void;
};

const PlanSessionCenterPickerSheet: React.FC<PlanSessionCenterPickerSheetProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const {height: windowHeight} = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * (Platform.OS === 'ios' ? 0.88 : 0.92));
  const {user} = useAppStore();
  const {getActiveUsersCount, getGymStatus} = useGymStore();
  const {activeCenters, refresh} = useActiveCentersRealtime();
  const userCoords = useOptionalUserCoords();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setQuery('');
      refresh().catch(() => {});
    }
  }, [visible, refresh]);

  const liveByGymId = useMemo(() => buildLiveByGymId(activeCenters), [activeCenters]);

  const favoriteGyms = useMemo(() => {
    const ids = user?.favoriteGyms ?? [];
    return ids
      .map(id => findGymByIdRelaxed(id) ?? findGymById(id))
      .filter((g): g is DanishGym => g != null && ALL_ACTIVE.some(a => a.id === g.id));
  }, [user?.favoriteGyms]);

  const distanceFor = useCallback(
    (gym: DanishGym): number | null => {
      if (!userCoords) {
        return null;
      }
      return calculateDistanceM(
        userCoords.latitude,
        userCoords.longitude,
        gym.latitude,
        gym.longitude,
      );
    },
    [userCoords],
  );

  const sections = useMemo((): GymSection[] => {
    const raw = query.trim().toLowerCase();
    const tokens = raw.split(/\s+/).filter(Boolean);

    const sortByDistanceOpenName = (gyms: DanishGym[]) =>
      gyms
        .map(gym => {
          const status = getGymStatus(gym.id);
          const d = distanceFor(gym);
          const liveTotal = liveByGymId.get(gym.id)?.total ?? getActiveUsersCount(gym.id);
          return {gym, isOpen: status.isOpen, distanceM: d, liveTotal};
        })
        .sort((a, b) => {
          if (userCoords) {
            const da = a.distanceM ?? Number.POSITIVE_INFINITY;
            const db = b.distanceM ?? Number.POSITIVE_INFINITY;
            if (da !== db) {
              return da - db;
            }
          }
          if (a.isOpen && !b.isOpen) {
            return -1;
          }
          if (!a.isOpen && b.isOpen) {
            return 1;
          }
          if (!userCoords && b.liveTotal !== a.liveTotal) {
            return b.liveTotal - a.liveTotal;
          }
          if (!userCoords) {
            const ra = a.gym.region === 'København' ? 0 : 1;
            const rb = b.gym.region === 'København' ? 0 : 1;
            if (ra !== rb) {
              return ra - rb;
            }
          }
          return formatGymDisplayName(a.gym).localeCompare(formatGymDisplayName(b.gym), 'da');
        })
        .map(x => x.gym);

    if (tokens.length > 0) {
      const filtered = ALL_ACTIVE.filter(gym => tokensMatch(gymSearchHaystack(gym), tokens));
      const sorted = filtered
        .map(gym => {
          const status = getGymStatus(gym.id);
          const d = distanceFor(gym);
          return {gym, isOpen: status.isOpen, distanceM: d};
        })
        .sort((a, b) => {
          if (a.isOpen && !b.isOpen) {
            return -1;
          }
          if (!a.isOpen && b.isOpen) {
            return 1;
          }
          const da = a.distanceM ?? Number.POSITIVE_INFINITY;
          const db = b.distanceM ?? Number.POSITIVE_INFINITY;
          if (da !== db) {
            return da - db;
          }
          return formatGymDisplayName(a.gym).localeCompare(formatGymDisplayName(b.gym), 'da');
        })
        .map(x => x.gym);
      if (sorted.length === 0) {
        return [{title: '', data: [] as DanishGym[]}];
      }
      return [{title: 'Resultater', data: sorted}];
    }

    const favorites = favoriteGyms;
    const favIdSet = new Set(favorites.map(f => f.id));
    const others = ALL_ACTIVE.filter(g => !favIdSet.has(g.id));
    const nearbySorted = sortByDistanceOpenName(others);

    const out: GymSection[] = [];
    if (favorites.length > 0) {
      out.push({title: 'Dine centre', data: favorites});
    }
    out.push({title: t('centerPicker.nearbySection'), data: nearbySorted});
    return out;
  }, [
    query,
    favoriteGyms,
    userCoords,
    getGymStatus,
    distanceFor,
    liveByGymId,
    getActiveUsersCount,
  ]);

  const renderRow = useCallback(
    ({item}: {item: DanishGym}) => {
      const status = getGymStatus(item.id);
      const d = distanceFor(item);
      const distanceText = d != null ? formatDistanceMeters(d) : '';
      const live = liveStatsForGym(item.id, liveByGymId, getActiveUsersCount);
      const fav = (user?.favoriteGyms ?? []).includes(item.id);

      return (
        <TouchableOpacity
          style={styles.rowCard}
          activeOpacity={0.75}
          onPress={() => onSelect(item)}>
          <View style={styles.rowInner}>
            <GymLogoView gymName={item.name} brand={item.brand} size={48} surface="lavender" />
            <View style={styles.rowBody}>
              <View style={styles.titleRow}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {formatGymDisplayName(item)}
                </Text>
                {fav ? (
                  <View style={styles.favChip}>
                    <Ionicons name="star" size={12} color={colors.primary} />
                    <Text style={styles.favChipText}>Gemt</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.subLine} numberOfLines={1}>
                {[item.city, item.region].filter(Boolean).join(' · ') || item.region}
                {distanceText ? ` · ${distanceText}` : ''}
              </Text>
              {item.address ? (
                <Text style={styles.addressLine} numberOfLines={1}>
                  {item.address}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <OpenClosedChip isOpen={status.isOpen} />
                <LiveLine live={live} />
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      );
    },
    [getGymStatus, distanceFor, liveByGymId, getActiveUsersCount, user?.favoriteGyms, onSelect],
  );

  const renderSectionHeader = useCallback(
    ({section}: {section: GymSection}) =>
      section.title ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
        </View>
      ) : null,
    [],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent={Platform.OS === 'android'}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Luk" />
        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              maxHeight: sheetHeight,
              paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
            },
          ]}>
          <View style={styles.sheetGrab} accessibilityElementsHidden />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('centerPicker.selectCenter')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Luk">
              <Ionicons name="close" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color={colors.textTertiary} style={styles.searchIcon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('centerPicker.searchPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoFocus={false}
            />
          </View>

          <View style={styles.listWrap}>
            <SectionList
              style={styles.sectionList}
              sections={sections}
              keyExtractor={item => item.id}
              renderItem={renderRow}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>{t('checkIn.noCentersFound')}</Text>
                  <Text style={styles.emptyHint}>Prøv et andet søgeord, kæde eller by</Text>
                </View>
              }
              ItemSeparatorComponent={PlanCenterListSeparator}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
  },
  sheet: {
    backgroundColor: colors.backgroundLight,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    width: '100%',
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  sectionList: {
    flex: 1,
  },
  listItemGap: {
    height: 10,
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHeader: {
    backgroundColor: colors.backgroundLight,
    paddingTop: spacing.sm,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: colors.text,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  rowCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  favChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F0FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  favChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  subLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  addressLine: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  statusChipOpen: {
    backgroundColor: '#ECFDF5',
  },
  statusChipClosed: {
    backgroundColor: colors.surfaceLight,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOpen: {
    backgroundColor: colors.success,
  },
  statusDotClosed: {
    backgroundColor: colors.textMuted,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusChipTextOpen: {
    color: colors.secondaryDark,
  },
  statusChipTextClosed: {
    color: colors.textTertiary,
  },
  liveLine: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  liveMuted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 6,
  },
});

export default PlanSessionCenterPickerSheet;
