/**
 * Ranglister — data fra Firestore (leaderboardStats / gym underlister)
 *
 * Reserved for future competitive/social systems: screen + services stay in-repo;
 * primary navigation is gated via `src/config/launchSurfaceConfig.ts`.
 */

import React, {useState, useMemo, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {Card} from '@/components/ui/Card';
import {EmptyState} from '@/components/ui/EmptyState';
import {LeaderboardRow} from '@/components/ui/LeaderboardRow';
import {getActiveDanishGyms} from '@/data/danishGyms';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useAppStore} from '@/store/appStore';
import {supabase} from '@/services/supabase/supabaseClient';
import {getStreakBadge} from '@/utils/streakUtils';
import {fetchGymLiveSessionTotals} from '@/services/supabase/liveWorkoutSessionService';
import {fetchGymlyLeaderboard} from '@/services/supabase/gymlyLeaderboardService';
import {getHomeLeaderboardCenterIdForUser} from '@/utils/leaderboardCenterFromGym';
import {findGymById} from '@/utils/gymDisplay';
import type {LeaderboardEntry} from '@/types/leaderboard.types';
import {UserAvatar} from '@/components/ui/UserAvatar';

type Period = 'week' | 'month' | 'all';
type LeaderboardMetric = 'checkins' | 'minutes' | 'streak';
type CategoryTab = 'gymly' | 'friends' | 'center';

const METRIC_OPTIONS: {key: LeaderboardMetric; label: string}[] = [
  {key: 'checkins', label: 'Check-ins'},
  {key: 'minutes', label: 'Tid'},
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
const EMPTY_CENTER_TITLE = 'Ingen centerdata endnu';
const EMPTY_CENTER_MESSAGE = 'Tjek ind i dit center for at komme på ranglisten.';

/** Supabase/PostgREST fejl er ofte plain objects — ikke `instanceof Error`. */
function stringifyLeaderboardError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) {
    return e.message.trim();
  }
  if (typeof e === 'string' && e.trim()) {
    return e.trim();
  }
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === 'string' && o.message.trim()) {
      parts.push(o.message.trim());
    }
    if (typeof o.details === 'string' && o.details.trim()) {
      parts.push(o.details.trim());
    }
    if (typeof o.hint === 'string' && o.hint.trim()) {
      parts.push(o.hint.trim());
    }
    if (typeof o.code === 'string' && o.code.trim()) {
      parts.push(`(${o.code.trim()})`);
    }
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return 'Ukendt fejl';
}

function normalizeLeaderboardEntries(input: unknown): LeaderboardEntry[] {
  const rows = Array.isArray(input) ? input : [];
  const normalized = rows
    .map((raw, idx): LeaderboardEntry | null => {
      if (!raw || typeof raw !== 'object') {
        return null;
      }
      const entry = raw as Partial<LeaderboardEntry> & {
        userId?: unknown;
        displayName?: unknown;
        value?: unknown;
        rank?: unknown;
        isCurrentUser?: unknown;
      };
      const userId = typeof entry.userId === 'string' ? entry.userId.trim() : '';
      if (!userId) {
        return null;
      }
      const displayName =
        typeof entry.displayName === 'string' && entry.displayName.trim().length > 0
          ? entry.displayName.trim()
          : 'Bruger';
      const value = Number(entry.value ?? 0);
      const rank = Number(entry.rank ?? idx + 1);
      return {
        ...entry,
        userId,
        displayName,
        value: Number.isFinite(value) ? value : 0,
        rank: Number.isFinite(rank) && rank > 0 ? rank : idx + 1,
        isCurrentUser: Boolean(entry.isCurrentUser),
        isFriend: Boolean(entry.isFriend),
        valueLabel:
          typeof entry.valueLabel === 'string' ? entry.valueLabel : `${Number.isFinite(value) ? value : 0}`,
        username: typeof entry.username === 'string' ? entry.username : undefined,
        aliveSubtitle: typeof entry.aliveSubtitle === 'string' ? entry.aliveSubtitle : undefined,
        leaderboardCheckIns:
          typeof entry.leaderboardCheckIns === 'number' ? entry.leaderboardCheckIns : undefined,
        leaderboardMinutes:
          typeof entry.leaderboardMinutes === 'number' ? entry.leaderboardMinutes : undefined,
        leaderboardStreak:
          typeof entry.leaderboardStreak === 'number' ? entry.leaderboardStreak : undefined,
      } as LeaderboardEntry;
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null);

  const deduped = Array.from(
    new Map(normalized.map(entry => [entry.userId, entry])).values(),
  );

  return deduped.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

function formatMetricValue(value: number, metric: LeaderboardMetric): string {
  if (metric === 'checkins') return `${value} check-ins`;
  if (metric === 'minutes') return `${value} min`;
  return `${value} dages streak`;
}

function AnimatedMetricValue({
  value,
  metric,
  style,
}: {
  value: number;
  metric: LeaderboardMetric;
  style?: any;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    opacity.setValue(0.84);
    translateY.setValue(5);
    Animated.parallel([
      Animated.timing(opacity, {toValue: 1, duration: 260, useNativeDriver: true}),
      Animated.timing(translateY, {toValue: 0, duration: 260, useNativeDriver: true}),
    ]).start();

    const frames = 24;
    const stepMs = 18;
    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      const t = Math.min(1, frame / frames);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t >= 1) clearInterval(timer);
    }, stepMs);

    prevRef.current = to;
    return () => clearInterval(timer);
  }, [value, opacity, translateY]);

  return (
    <Animated.Text style={[style, {opacity, transform: [{translateY}]}]}>
      {formatMetricValue(display, metric)}
    </Animated.Text>
  );
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
  streakText,
  checkInText,
  timeText,
  movementText,
  metric,
  periodLabel,
}: {
  entry: LeaderboardEntry;
  rank: number;
  motivation: string;
  streakText: string;
  checkInText: string;
  timeText: string;
  movementText: string;
  metric: LeaderboardMetric;
  periodLabel: string;
}) {
  return (
    <View style={styles.yourCard}>
      <View style={styles.yourCardHeader}>
        <Text style={styles.yourCardTitle}>Din placering</Text>
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>#{rank}</Text>
        </View>
      </View>
      <Text style={styles.yourStatValue}>
        #{rank} · {periodLabel}
      </Text>
      <View style={styles.yourStatsRow}>
        <Text style={styles.yourStatPill}>{streakText}</Text>
        <Text style={styles.yourStatPill}>{checkInText}</Text>
        <Text style={styles.yourStatPill}>{timeText}</Text>
      </View>
      <Text style={styles.yourMovement}>{movementText}</Text>
      <Text style={styles.motivationText}>{motivation}</Text>
      <View style={styles.yourHintWrap}>
        <Text style={styles.yourHintPrefix}>Nuværende måling:</Text>
        <AnimatedMetricValue value={entry.value} metric={metric} style={styles.yourHint} />
      </View>
    </View>
  );
}

function TopThreePodium({
  users,
  onUserPress,
  metric,
}: {
  users: LeaderboardEntry[];
  onUserPress: (id: string, name: string) => void;
  metric: LeaderboardMetric;
}) {
  const order = [1, 0, 2];
  const crownPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(crownPulse, {
          toValue: 1.06,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(crownPulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [crownPulse]);

  return (
    <View style={styles.podium}>
      {order.map(idx => {
        const u = users[idx];
        if (!u) {
          return null;
        }
        const rank = idx + 1;
        const podiumPad = rank === 1 ? styles.podium1 : styles.podium23;
        const streakValue = Number(u.leaderboardStreak ?? 0);
        const streakBadge = getStreakBadge(streakValue);
        return (
          <TouchableOpacity
            key={u.userId}
            style={[
              styles.podiumItem,
              podiumPad,
              rank === 1 ? styles.podiumWinner : rank === 2 ? styles.podiumSecond : styles.podiumThird,
            ]}
            onPress={() => !u.isCurrentUser && onUserPress(u.userId, u.displayName)}
            activeOpacity={0.8}>
            <View
              style={[
                styles.podiumRank,
                rank === 1 && styles.podiumRank1,
                rank === 2 && styles.podiumRank2,
                rank === 3 && styles.podiumRank3,
              ]}>
              {rank === 1 ? (
                <Animated.View style={{transform: [{scale: crownPulse}]}}>
                  <Text
                    style={[styles.podiumRankText, styles.podiumRankTextCrown]}
                    allowFontScaling={false}>
                    👑
                  </Text>
                </Animated.View>
              ) : (
                <Text style={styles.podiumRankText}>#{rank}</Text>
              )}
            </View>
            <View style={styles.podiumAvatarWrap}>
              <UserAvatar
                name={u.isCurrentUser ? 'Dig' : u.displayName}
                imageUrl={u.profileImageUrl}
                size="lg"
              />
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>
              {u.isCurrentUser ? 'Dig' : u.displayName}
            </Text>
            <Text style={styles.podiumGym} numberOfLines={1}>
              {u.aliveSubtitle ?? (u.username ? `@${u.username}` : '—')}
            </Text>
            <AnimatedMetricValue value={u.value} metric={metric} style={styles.podiumScore} />
            {streakBadge ? (
              <Text style={styles.podiumStreak}>
                {streakBadge} {streakValue}
              </Text>
            ) : null}
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
        placeholder="Søg navn, @brugernavn …"
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
  const [centerError, setCenterError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [liveCountByGymId, setLiveCountByGymId] = useState<Record<string, number>>({});
  const previousRankByUserRef = useRef<Record<string, number>>({});
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLeaderboardRefresh = useCallback(() => {
    if (realtimeDebounceRef.current) {
      clearTimeout(realtimeDebounceRef.current);
    }
    realtimeDebounceRef.current = setTimeout(() => {
      realtimeDebounceRef.current = null;
      setRealtimeRevision(v => v + 1);
    }, 650);
  }, []);

  useEffect(() => {
    setSelectedCenterId(homeCenterId);
  }, [homeCenterId]);

  const filteredCenters = useMemo(() => {
    const q = centerSearchQuery.trim().toLowerCase();
    let list = getActiveDanishGyms();
    if (q) {
      list = getActiveDanishGyms().filter(c => {
        const name = c.name.toLowerCase();
        const city = (c.city ?? '').toLowerCase();
        const brand = (c.brand ?? '').toLowerCase();
        return name.includes(q) || city.includes(q) || brand.includes(q);
      });
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
    setFetchError(null);
    if (category === 'center') {
      setCenterError(null);
    }

    (async () => {
      try {
        if (category === 'center' && !selectedCenterId) {
          if (!cancelled) {
            setEntries([]);
            setLoading(false);
          }
          return;
        }
        const scope =
          category === 'gymly'
            ? 'global'
            : category === 'friends'
              ? 'friends'
              : 'center';
        if (__DEV__) {
          console.warn('[Leaderboard] fetch', {
            category,
            metric,
            period,
            scope,
            selectedCenterId: category === 'center' ? selectedCenterId : null,
            viewerId: user.id,
          });
        }
        const list = await fetchGymlyLeaderboard({
          metric,
          period,
          scope,
          centerGymId: category === 'center' ? selectedCenterId : null,
          viewerId: user.id,
        });
        if (__DEV__) {
          console.warn('[Leaderboard] rows', list?.length ?? 0);
        }
        if (!cancelled) {
          const safeEntries = normalizeLeaderboardEntries(list);
          setEntries(safeEntries);
          const rankMap: Record<string, number> = {};
          safeEntries.forEach((e, idx) => {
            rankMap[e.userId] = e.rank ?? idx + 1;
          });
          previousRankByUserRef.current = {
            ...previousRankByUserRef.current,
            ...rankMap,
          };
        }
      } catch (e) {
        const msg = stringifyLeaderboardError(e);
        if (__DEV__) {
          console.warn('[Leaderboard] fetch error', JSON.stringify(e, null, 2), e);
        }
        if (!cancelled) {
          setEntries([]);
          setFetchError(msg);
          if (category === 'center') {
            setCenterError('Kunne ikke hente centerdata lige nu.');
          }
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
  }, [user?.id, category, metric, period, selectedCenterId, realtimeRevision]);

  useEffect(() => {
    if (category !== 'center') return;
    let cancelled = false;
    (async () => {
      try {
        const totals = await fetchGymLiveSessionTotals();
        if (cancelled) return;
        const next: Record<string, number> = {};
        totals.forEach((count, gymId) => {
          next[gymId] = count;
        });
        setLiveCountByGymId(next);
      } catch {
        if (!cancelled) setLiveCountByGymId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, selectedCenterId]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return undefined;
      }
      const channel = supabase
        .channel(`leaderboard-live-${user.id}`)
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'profiles'},
          () => scheduleLeaderboardRefresh(),
        )
        .on(
          'postgres_changes',
          {event: '*', schema: 'public', table: 'check_ins'},
          () => scheduleLeaderboardRefresh(),
        )
        .subscribe();

      return () => {
        if (realtimeDebounceRef.current) {
          clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = null;
        }
        void supabase.removeChannel(channel);
      };
    }, [user?.id, scheduleLeaderboardRefresh]),
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return entries;
    }
    return entries.filter(e => {
      const name = (e.displayName ?? '').toLowerCase();
      const un = (e.username ?? '').toLowerCase();
      return name.includes(q) || un.includes(q);
    });
  }, [entries, searchQuery]);

  const hasMoreThanPreview = filtered.length > TOP_PREVIEW_COUNT;

  const placementEntry = useMemo(
    () => entries.find(e => e.isCurrentUser),
    [entries],
  );
  const placementRank = placementEntry?.rank ?? 0;

  const movementText = useMemo(() => {
    if (!placementEntry || placementRank <= 0) {
      return 'Ranglisten opdateres live når folk træner.';
    }
    const prev = previousRankByUserRef.current[placementEntry.userId];
    if (prev == null || prev === placementRank) {
      return 'Ranglisten opdateres live når folk træner.';
    }
    const delta = prev - placementRank;
    if (delta > 0) {
      return `⬆️ +${delta} placering${delta === 1 ? '' : 'er'} siden sidst`;
    }
    return `⬇️ ${Math.abs(delta)} placering${Math.abs(delta) === 1 ? '' : 'er'} siden sidst`;
  }, [placementEntry, placementRank]);

  const topThree = useMemo(
    () => normalizeLeaderboardEntries(filtered).slice(0, 3),
    [filtered],
  );

  const listAfterPodium = useMemo(() => {
    const afterThree = normalizeLeaderboardEntries(filtered).slice(3);
    if (!showFullList && hasMoreThanPreview) {
      return afterThree.slice(0, TOP_PREVIEW_COUNT - 3);
    }
    return afterThree;
  }, [filtered, showFullList, hasMoreThanPreview]);

  const motivation = useMemo(
    () => getMotivationText(placementEntry, placementRank),
    [placementEntry, placementRank],
  );

  const periodLabelDa = useMemo(
    () =>
      period === 'week'
        ? 'denne uge'
        : period === 'month'
          ? 'denne måned'
          : 'alt tid',
    [period],
  );

  const handleUserPress = (userId: string, name: string) => {
    navigation.navigate('FriendProfile', {
      friendId: userId,
      friendName: name,
      mutualFriends: 0,
      gyms: [],
    });
  };

  const handleCategoryPress = (key: CategoryTab) => {
    setFetchError(null);
    setCategory(key);
  };

  const isEmpty = !loading && !fetchError && filtered.length === 0;
  const isCenterCategory = category === 'center';
  const showCenterEmpty =
    isCenterCategory && !loading && !fetchError && !centerError && filtered.length === 0;
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

      {fetchError && !loading ? (
        <View style={styles.fetchErrorBanner}>
          <Icon name="warning-outline" size={20} color={colors.error} />
          <Text style={styles.fetchErrorText} numberOfLines={4}>
            Kunne ikke hente ranglisten: {fetchError}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setFetchError(null);
              setRealtimeRevision(v => v + 1);
            }}
            hitSlop={12}
            accessibilityLabel="Prøv igen">
            <Text style={styles.fetchErrorRetry}>Prøv igen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFetchError(null)} hitSlop={12}>
            <Icon name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

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
                onPress={() => handleCategoryPress(key)}
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

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Måling</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {METRIC_OPTIONS.map(({key, label}) => {
              const selected = metric === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setFetchError(null);
                    setMetric(key);
                  }}
                  activeOpacity={0.86}
                  style={[styles.premiumChip, selected && styles.premiumChipSelected]}>
                  <Text style={[styles.premiumChipText, selected && styles.premiumChipTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Periode</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {PERIOD_OPTIONS.map(({key, label}) => {
              const selected = period === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setFetchError(null);
                    setPeriod(key);
                  }}
                  activeOpacity={0.86}
                  style={[styles.premiumChip, selected && styles.premiumChipSelected]}>
                  <Text style={[styles.premiumChipText, selected && styles.premiumChipTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
                  <Text style={styles.selectedCenterLive}>
                    {liveCountByGymId[selectedCenter.id] ?? 0} aktive nu
                  </Text>
                  <Text style={styles.selectedCenterMomentum}>🔥 Mest aktive center denne uge</Text>
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

        {!hasMoreThanPreview && !loading && (
          <LeaderboardSearchBar value={searchQuery} onChangeText={setSearchQuery} />
        )}

        {!isEmpty && topThree.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 3</Text>
            <TopThreePodium users={topThree} onUserPress={handleUserPress} metric={metric} />
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
                  valueLabel={
                    item.aliveSubtitle ||
                    (item.username ? `@${item.username}` : undefined)
                  }
                  streak={
                    (item.leaderboardStreak ?? 0) >= 3
                      ? `${getStreakBadge(item.leaderboardStreak ?? 0)} ${
                          item.leaderboardStreak ?? 0
                        }`
                      : undefined
                  }
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

        {placementEntry && placementRank > 0 && (
          <View style={styles.section}>
            <YourPlacementCard
              entry={placementEntry}
              rank={placementRank}
              motivation={motivation}
              streakText={`${
                getStreakBadge(placementEntry.leaderboardStreak ?? 0) || '🔥'
              } ${placementEntry.leaderboardStreak ?? 0} dages streak`}
              checkInText={`${placementEntry.leaderboardCheckIns ?? 0} check-ins`}
              timeText={`${placementEntry.leaderboardMinutes ?? 0} min træning`}
              movementText={movementText}
              metric={metric}
              periodLabel={periodLabelDa}
            />
          </View>
        )}

        {loading && (
          <View style={styles.section}>
            {[0, 1, 2].map(i => (
              <Animated.View key={`skeleton-${i}`} style={styles.skeletonCard}>
                <ActivityIndicator color={colors.primary} />
              </Animated.View>
            ))}
          </View>
        )}

        {isCenterCategory && centerError && !loading && (
          <EmptyState
            icon="alert-circle-outline"
            title="Center utilgængelig"
            message={centerError}
          />
        )}

        {showCenterEmpty && (
          <EmptyState
            icon="barbell-outline"
            title={EMPTY_CENTER_TITLE}
            message={EMPTY_CENTER_MESSAGE}
          />
        )}

        {isEmpty && !loading && !fetchError && !showCenterEmpty && !centerError && (
          <EmptyState
            icon="trophy-outline"
            title={
              category === 'center' && !selectedCenterId
                ? 'Vælg et center'
                : category === 'center'
                  ? 'Ingen placeringer endnu 👀'
                  : category === 'friends'
                    ? 'Ingen placeringer endnu 👀'
                    : 'Ingen placeringer endnu 👀'
            }
            message={
              category === 'center' && !selectedCenterId
                ? 'Vælg et center på listen for at se ranglisten.'
                : category === 'center'
                  ? 'Bliv den første til at sætte standarden i denne uge.'
                  : category === 'friends'
                    ? 'Inviter venner og byg jeres egen liga.'
                    : 'Bliv den første til at sætte standarden denne uge.'
            }
            actionLabel={category === 'friends' ? 'Inviter venner' : undefined}
            onAction={
              category === 'friends'
                ? () => navigation.navigate('AddFriend')
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
  fetchErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.error + '12',
    borderWidth: 1,
    borderColor: colors.error + '35',
  },
  fetchErrorText: {
    flex: 1,
    ...typography.small,
    color: colors.text,
  },
  fetchErrorRetry: {
    ...typography.small,
    fontWeight: '700',
    color: colors.primary,
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
    marginBottom: spacing.md,
  },
  categoryTab: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E6E8F0',
    backgroundColor: '#FFFFFFDD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  categoryTabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDark,
    ...shadows.glow,
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
    backgroundColor: '#F8F5FF',
    borderRadius: radius.lg,
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
  selectedCenterLive: {
    ...typography.caption,
    color: colors.primaryDark,
    marginTop: spacing.xs,
    fontWeight: '700',
  },
  selectedCenterMomentum: {
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
  premiumChip: {
    minHeight: 38,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFFD8',
    borderWidth: 1,
    borderColor: '#E4E8F2',
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    ...shadows.sm,
  },
  premiumChipSelected: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
    ...shadows.glow,
  },
  premiumChipText: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  premiumChipTextSelected: {
    color: colors.white,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#E8EAF3',
    ...shadows.sm,
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
  yourCard: {
    borderRadius: radius.xl,
    backgroundColor: '#F7F3FF',
    borderWidth: 1,
    borderColor: '#E9DCFF',
    padding: spacing.lg,
    ...shadows.card,
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
    ...typography.h4,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  yourStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  yourStatPill: {
    ...typography.caption,
    color: colors.primaryDark,
    backgroundColor: '#EFE5FF',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    fontWeight: '700',
  },
  yourMovement: {
    ...typography.small,
    color: colors.success,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  motivationText: {
    ...typography.small,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  yourHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  yourHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  yourHintPrefix: {
    ...typography.caption,
    color: colors.textMuted,
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
    borderRadius: radius.xl,
    backgroundColor: '#FFFFFF',
    ...shadows.card,
    borderWidth: 1,
    borderColor: '#ECE9F7',
  },
  podium1: {
    paddingTop: spacing.lg,
  },
  podium23: {
    paddingTop: spacing.xxl,
  },
  podiumWinner: {
    backgroundColor: '#FFFBF5',
    borderColor: colors.rankGold + 'AA',
    shadowColor: colors.rankGold,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  podiumSecond: {
    backgroundColor: '#F8FAFC',
    borderColor: '#C8CED9',
  },
  podiumThird: {
    backgroundColor: '#FFFCFA',
    borderColor: '#D4A574',
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
  podiumRank2: {
    borderWidth: 2,
    borderColor: '#C0C0C8',
    backgroundColor: '#FFFFFF',
  },
  podiumRank3: {
    borderWidth: 2,
    borderColor: '#CD7F32',
    backgroundColor: '#FFFFFF',
  },
  podiumRankText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  podiumRankTextCrown: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  podiumAvatarWrap: {
    marginTop: spacing.sm,
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
  podiumStreak: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '700',
  },
  skeletonCard: {
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: '#F0F2F7',
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LeaderboardScreen;
