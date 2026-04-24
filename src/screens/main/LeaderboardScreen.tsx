/**
 * Ranglister — data fra Firestore (leaderboardStats / gym underlister)
 */

import React, {useState, useMemo, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {Card} from '@/components/ui/Card';
import {EmptyState} from '@/components/ui/EmptyState';
import Chip from '@/components/ui/Chip';
import {LeaderboardRow} from '@/components/ui/LeaderboardRow';
import {getActiveDanishGyms} from '@/data/danishGyms';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useAppStore} from '@/store/appStore';
import {
  fetchGlobalLeaderboard,
  fetchFriendsLeaderboard,
  fetchGymLeaderboard,
} from '@/services/leaderboard/leaderboardService';
import {getHomeLeaderboardCenterIdForUser, resolveGymNameForLeaderboard} from '@/utils/leaderboardCenterFromGym';
import {findGymById} from '@/utils/gymDisplay';
import type {
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardPeriod,
} from '@/types/leaderboard.types';

type Period = 'week' | 'month' | 'all';
type LeaderboardMetric = 'checkins' | 'minutes' | 'streak';
type CategoryTab = 'gymly' | 'friends' | 'center';

const METRIC_OPTIONS: {key: LeaderboardMetric; label: string}[] = [
  {key: 'checkins', label: 'Check-ins'},
  {key: 'minutes', label: 'Tid trænet'},
  {key: 'streak', label: 'Streak'},
];

const CATEGORY_TABS: {key: CategoryTab; label: string}[] = [
  {key: 'gymly', label: 'Gymly'},
  {key: 'friends', label: 'Venner'},
  {key: 'center', label: 'Center'},
];

const PERIOD_OPTIONS: {key: Period; label: string}[] = [
  {key: 'week', label: 'Denne uge'},
  {key: 'month', label: 'Denne måned'},
  {key: 'all', label: 'Altid'},
];

const TOP_PREVIEW_COUNT = 10;

function metricToCategory(m: LeaderboardMetric): LeaderboardCategory {
  switch (m) {
    case 'checkins':
      return 'checkIns';
    case 'minutes':
      return 'trainingTime';
    case 'streak':
      return 'streak';
    default:
      return 'checkIns';
  }
}

function getMotivationText(
  current: LeaderboardEntry | undefined,
  rank: number,
): string {
  if (!current) {
    return 'Check ind og kom på ranglisten.';
  }
  if (rank === 1) {
    return 'Du er #1 – hold momentumet!';
  }
  if (rank <= 4) {
    return `${rank - 1} plads(er) til top 3 – du er tæt på!`;
  }
  return 'Hold momentum – du kæmper med om pladserne.';
}

function YourPlacementCard({
  entry,
  rank,
  motivation,
}: {
  entry: LeaderboardEntry;
  rank: number;
  motivation: string;
}) {
  return (
    <Card variant="elevated" padding="lg">
      <View style={styles.yourCardHeader}>
        <Text style={styles.yourCardTitle}>Din placering</Text>
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>#{rank}</Text>
        </View>
      </View>
      <Text style={styles.yourStatValue}>{entry.valueLabel}</Text>
      <Text style={styles.motivationText}>{motivation}</Text>
    </Card>
  );
}

function TopThreePodium({
  users,
  onUserPress,
}: {
  users: LeaderboardEntry[];
  onUserPress: (id: string, name: string) => void;
}) {
  const order = [1, 0, 2];
  return (
    <View style={styles.podium}>
      {order.map(idx => {
        const u = users[idx];
        if (!u) {
          return null;
        }
        const rank = idx + 1;
        const podiumPad =
          rank === 1 ? styles.podium1 : rank === 2 ? styles.podium2 : styles.podium3;
        return (
          <TouchableOpacity
            key={u.userId}
            style={[styles.podiumItem, podiumPad]}
            onPress={() => !u.isCurrentUser && onUserPress(u.userId, u.displayName)}
            activeOpacity={0.8}>
            <View style={[styles.podiumRank, rank === 1 && styles.podiumRank1]}>
              <Text style={styles.podiumRankText}>{rank}</Text>
            </View>
            <View style={styles.podiumAvatar}>
              <Text style={styles.podiumAvatarText}>
                {u.displayName
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || '?'}
              </Text>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>
              {u.isCurrentUser ? 'Dig' : u.displayName}
            </Text>
            <Text style={styles.podiumGym} numberOfLines={1}>
              {u.gymName ?? '—'}
            </Text>
            <Text style={styles.podiumScore}>{u.valueLabel}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LeaderboardSearchBar({
  value,
  onChangeText,
  variant = 'page',
}: {
  value: string;
  onChangeText: (text: string) => void;
  variant?: 'page' | 'inSection';
}) {
  return (
    <View
      style={[
        styles.searchContainer,
        variant === 'inSection' && styles.searchInSection,
      ]}>
      <Icon name="search" size={20} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        placeholder="Søg efter navn eller brugernavn..."
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Icon name="close-circle" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const LeaderboardScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const user = useAppStore(s => s.user);
  const homeCenterId = useMemo(
    () => getHomeLeaderboardCenterIdForUser(user?.favoriteGyms),
    [user?.favoriteGyms],
  );

  const [category, setCategory] = useState<CategoryTab>('gymly');
  const [metric, setMetric] = useState<LeaderboardMetric>('checkins');
  const [period, setPeriod] = useState<Period>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullList, setShowFullList] = useState(false);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(homeCenterId);
  const [centerSearchQuery, setCenterSearchQuery] = useState('');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelectedCenterId(homeCenterId);
  }, [homeCenterId]);

  const filteredCenters = useMemo(() => {
    const q = centerSearchQuery.trim().toLowerCase();
    let list = getActiveDanishGyms();
    if (q) {
      list = getActiveDanishGyms().filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          (c.city?.toLowerCase().includes(q) ?? false),
      );
    }
    return list.slice(0, 200);
  }, [centerSearchQuery]);

  const selectedCenter = useMemo(() => {
    if (!selectedCenterId) {
      return null;
    }
    return findGymById(selectedCenterId);
  }, [selectedCenterId]);

  useEffect(() => {
    setShowFullList(false);
    setSearchQuery('');
  }, [category, selectedCenterId, metric, period]);

  useEffect(() => {
    if (category !== 'center') {
      setCenterSearchQuery('');
    }
  }, [category]);

  useEffect(() => {
    if (!user?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const cat = metricToCategory(metric);
    const periodLb = period as LeaderboardPeriod;

    (async () => {
      try {
        let result;
        if (category === 'gymly') {
          result = await fetchGlobalLeaderboard(cat, periodLb, user.id);
        } else if (category === 'friends') {
          result = await fetchFriendsLeaderboard(cat, periodLb, user.id);
        } else {
          if (!selectedCenterId) {
            if (!cancelled) {
              setEntries([]);
              setLoading(false);
            }
            return;
          }
          const g = findGymById(selectedCenterId);
          result = await fetchGymLeaderboard(
            selectedCenterId,
            g?.name ?? resolveGymNameForLeaderboard(selectedCenterId),
            periodLb,
            user.id,
          );
        }
        if (!cancelled) {
          setEntries(result.entries);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, category, metric, period, selectedCenterId]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return entries;
    }
    return entries.filter(e => e.displayName.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  const hasMoreThanPreview = filtered.length > TOP_PREVIEW_COUNT;

  const currentUserEntry = useMemo(
    () => filtered.find(e => e.isCurrentUser),
    [filtered],
  );

  const currentRank = useMemo(() => {
    const idx = filtered.findIndex(e => e.isCurrentUser);
    return idx >= 0 ? idx + 1 : 0;
  }, [filtered]);

  const topThree = useMemo(() => filtered.slice(0, 3), [filtered]);

  const listAfterPodium = useMemo(() => {
    const afterThree = filtered.slice(3);
    if (!showFullList && hasMoreThanPreview) {
      return afterThree.slice(0, TOP_PREVIEW_COUNT - 3);
    }
    return afterThree;
  }, [filtered, showFullList, hasMoreThanPreview]);

  const motivation = useMemo(
    () => getMotivationText(currentUserEntry, currentRank),
    [currentUserEntry, currentRank],
  );

  const handleUserPress = (userId: string, name: string) => {
    navigation.navigate('FriendProfile', {
      friendId: userId,
      friendName: name,
      mutualFriends: 0,
      gyms: [],
    });
  };

  const isEmpty = !loading && filtered.length === 0;
  const listSectionTitle =
    hasMoreThanPreview && !showFullList ? 'Top 10' : 'Rangliste';

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ranglister" onBack={() => navigation.goBack()} showBack />

      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: insets.bottom + spacing.xl},
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.categoryRow}>
          {CATEGORY_TABS.map(({key, label}) => {
            const selected = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.categoryTab, selected && styles.categoryTabSelected]}
                onPress={() => setCategory(key)}
                activeOpacity={0.85}>
                <Text
                  style={[styles.categoryTabText, selected && styles.categoryTabTextSelected]}
                  numberOfLines={1}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.categoryHint}>
          {category === 'gymly' && 'Rangliste for alle brugere på Gymly.'}
          {category === 'friends' && 'Rangliste mellem dig og dine venner.'}
          {category === 'center' &&
            'Rangliste for det valgte center (baseret på backend-data for centeret).'}
        </Text>

        {category === 'center' && (
          <Text style={[styles.categoryHint, {marginTop: -spacing.md}]}>
            Måling gælder globalt for Gymly og Venner; center-visning følger centerets rangliste.
          </Text>
        )}

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Måling</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {METRIC_OPTIONS.map(({key, label}) => (
              <Chip
                key={key}
                label={label}
                selected={metric === key}
                onPress={() => setMetric(key)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Periode</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {PERIOD_OPTIONS.map(({key, label}) => (
              <Chip
                key={key}
                label={label}
                selected={period === key}
                onPress={() => setPeriod(key)}
              />
            ))}
          </ScrollView>
        </View>

        {category === 'center' && (
          <View style={styles.centerSection}>
            <Text style={styles.filterLabel}>Vælg center</Text>
            {selectedCenter && (
              <View style={styles.selectedCenterBanner}>
                <View style={styles.selectedCenterTextWrap}>
                  <Text style={styles.selectedCenterName}>{selectedCenter.name}</Text>
                  <Text style={styles.selectedCenterCity}>{selectedCenter.city ?? ''}</Text>
                </View>
                {selectedCenterId === homeCenterId && (
                  <View style={styles.homeBadge}>
                    <Text style={styles.homeBadgeText}>Dit center</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.centerSearchWrap}>
              <Icon name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.centerSearchInput}
                placeholder="Søg efter center (navn eller by)..."
                placeholderTextColor={colors.textMuted}
                value={centerSearchQuery}
                onChangeText={setCenterSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {centerSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setCenterSearchQuery('')}>
                  <Icon name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.centerListLabel}>Centre</Text>
            <ScrollView
              style={styles.centerList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {filteredCenters.map(c => {
                const id = c.id;
                const selected = selectedCenterId === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.centerRow, selected && styles.centerRowSelected]}
                    onPress={() => {
                      setSelectedCenterId(id);
                      setCenterSearchQuery('');
                    }}
                    activeOpacity={0.85}>
                    <View style={styles.centerRowText}>
                      <Text style={styles.centerRowName}>{c.name}</Text>
                      <Text style={styles.centerRowCity}>{c.city ?? ''}</Text>
                    </View>
                    {selected ? (
                      <Icon name="checkmark-circle" size={22} color={colors.primary} />
                    ) : (
                      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {currentUserEntry && currentRank > 0 && (
          <View style={styles.section}>
            <YourPlacementCard
              entry={currentUserEntry}
              rank={currentRank}
              motivation={motivation}
            />
          </View>
        )}

        {!hasMoreThanPreview && !loading && (
          <LeaderboardSearchBar value={searchQuery} onChangeText={setSearchQuery} />
        )}

        {!isEmpty && topThree.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 3</Text>
            <TopThreePodium users={topThree} onUserPress={handleUserPress} />
          </View>
        )}

        {hasMoreThanPreview && showFullList && (
          <View style={styles.section}>
            <Text style={styles.searchSectionLabel}>Søg på profiler</Text>
            <LeaderboardSearchBar
              variant="inSection"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {!isEmpty && listAfterPodium.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{listSectionTitle}</Text>
            <Card variant="default" padding="md">
              {listAfterPodium.map((item, idx) => (
                <LeaderboardRow
                  key={item.userId}
                  rank={item.rank ?? idx + 4}
                  name={item.isCurrentUser ? 'Dig' : item.displayName}
                  value={item.valueLabel}
                  valueLabel={item.gymName ?? ''}
                  imageUrl={item.profileImageUrl}
                  isCurrentUser={item.isCurrentUser}
                  isFriend={item.isFriend}
                  onPress={
                    item.isCurrentUser
                      ? undefined
                      : () => handleUserPress(item.userId, item.displayName)
                  }
                />
              ))}
            </Card>
            {hasMoreThanPreview && (
              <TouchableOpacity
                style={styles.fullListButton}
                onPress={() => {
                  if (showFullList) {
                    setSearchQuery('');
                  }
                  setShowFullList(!showFullList);
                }}
                activeOpacity={0.85}>
                <Text style={styles.fullListButtonText}>
                  {showFullList ? 'Vis kun top 10' : 'Se hele listen og søg profiler'}
                </Text>
                <Icon
                  name={showFullList ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}
          </View>
        )}

        {isEmpty && !loading && (
          <EmptyState
            icon="trophy-outline"
            title={
              category === 'center' && !selectedCenterId
                ? 'Vælg et center'
                : category === 'center'
                  ? 'Ingen på ranglisten for dette center endnu'
                  : category === 'friends'
                    ? 'Ingen venner på ranglisten endnu'
                    : 'Ingen rangliste endnu'
            }
            message={
              category === 'center' && !selectedCenterId
                ? 'Vælg et center på listen for at se ranglisten.'
                : category === 'center'
                  ? 'Kom tilbage når der er data, eller prøv et andet center.'
                  : category === 'friends'
                    ? 'Tilføj venner for at se jeres fælles rangliste.'
                    : 'Når brugere træner og registrerer aktivitet, vises de her.'
            }
            actionLabel={category === 'friends' ? 'Inviter venner' : undefined}
            onAction={
              category === 'friends'
                ? () => navigation.navigate('Friends', {screen: 'Grupper'} as never)
                : undefined
            }
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingBar: {
    paddingVertical: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryTab: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  categoryTabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  categoryTabText: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  categoryTabTextSelected: {
    color: colors.white,
  },
  categoryHint: {
    ...typography.small,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  centerSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  selectedCenterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  selectedCenterTextWrap: {
    flex: 1,
  },
  selectedCenterName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  selectedCenterCity: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  homeBadge: {
    backgroundColor: colors.primary + '22',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginLeft: spacing.sm,
  },
  homeBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  centerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  centerSearchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  centerListLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  centerList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  centerRowSelected: {
    backgroundColor: colors.primary + '12',
  },
  centerRowText: {
    flex: 1,
  },
  centerRowName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  centerRowCity: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  fullListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
  },
  fullListButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
    flexShrink: 1,
  },
  filterSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInSection: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  searchSectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  yourCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  yourCardTitle: {
    ...typography.h4,
    color: colors.text,
  },
  rankBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  rankBadgeText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  yourStatValue: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  motivationText: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  podium: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    ...shadows.card,
  },
  podium1: {
    paddingTop: spacing.xl,
  },
  podium2: {
    paddingTop: spacing.xxl,
  },
  podium3: {
    paddingTop: spacing.xxl,
  },
  podiumRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  podiumRank1: {
    backgroundColor: colors.primary,
  },
  podiumRankText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  podiumAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  podiumAvatarText: {
    ...typography.h4,
    color: '#fff',
    fontWeight: '600',
  },
  podiumName: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  podiumGym: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  podiumScore: {
    ...typography.h4,
    color: colors.primary,
    marginTop: spacing.sm,
  },
});

export default LeaderboardScreen;
