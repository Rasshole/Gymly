/**
 * Profil – faner Feed (træninger + opslag) og Data (statistik, mål); titel/tandhjul i tab-header
 */

import React, {useMemo, useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Animated,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {fetchFeaturedBadgeIdsForUser} from '@/services/supabase/profileFeaturedBadgesService';
import {useFeedStore} from '@/store/feedStore';
import {useGoalStore} from '@/store/goalStore';
import {refreshWorkoutFeedFromServer} from '@/services/supabase/workoutPostService';
import {subscribeWorkoutFeedRealtime} from '@/services/supabase/workoutPostService';
import {
  ProfileHeader,
  ProfileCentersList,
  ProfileStatGrid,
  StreakHighlight,
  ProfileBadgeStrip,
} from '@/components/profile';
import {FriendsListModal} from '@/components/friends/FriendsListModal';
import {useFriendStore} from '@/store/friendStore';
import {Card} from '@/components/ui/Card';
import type {FeedItem} from '@/store/feedStore';
import {
  completedSessionsToWorkouts,
  formatSessionDateAndDurationDa,
  type ProfileCompletedSession,
} from '@/services/supabase/profileCheckInHistory';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import * as streak from '@/utils/streakUtils';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';
import {
  filterWorkoutsByPeriod,
  sumWorkoutMinutes,
  type WorkoutPeriod,
} from '@/utils/workoutPeriodFilter';
import {useProfileStats} from '@/hooks/useProfileData';
import {useFriends} from '@/hooks/useFriends';
import {useBadgeStore} from '@/store/badgeStore';
import {useUserTrainingStats} from '@/hooks/useUserTrainingStats';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {loadProfileCentersForUser} from '@/services/supabase/profileCentersPublicService';
import type {ProfileCenterRow} from '@/components/profile/ProfileCentersList';
import {useGymStore} from '@/store/gymStore';
import {useSessionStore} from '@/store/sessionStore';
import colors from '@/theme/colors';
import {spacing, typography, radius} from '@/theme/designTokens';
import GymlyPostCard from '@/components/feed/GymlyPostCard';
import {
  fetchPostBicepsStates,
  fetchPostBicepsUsers,
  subscribePostBicepsRealtime,
  togglePostBicepsReaction,
  type PostBicepsUser,
} from '@/services/supabase/workoutReactionService';

const formatTotalTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} timer` : `${h}t ${m}m`;
};

const isPrItem = (i: FeedItem): boolean =>
  i.type === 'pr' || ((i.prInfo?.trim()?.length ?? 0) > 0);

type ProfileTab = 'feed' | 'data';

const DATA_PERIOD_OPTIONS: {key: WorkoutPeriod; label: string}[] = [
  {key: 'all', label: 'I alt'},
  {key: 'week', label: 'Uge'},
  {key: 'month', label: 'Måned'},
  {key: 'year', label: 'År'},
];

const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const {user, setUser} = useAppStore();
  const {feedItems, deleteFeedItem} = useFeedStore();
  const goals = useGoalStore(s => s.goals);
  const [tab, setTab] = useState<ProfileTab>('feed');
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [dataWorkoutPeriod, setDataWorkoutPeriod] =
    useState<WorkoutPeriod>('week');
  const trainingStats = useUserTrainingStats(user?.id);
  const activeSession = useSessionStore(s => s.activeSession);
  const getActiveUsersCount = useGymStore(s => s.getActiveUsersCount);
  const tabAnim = React.useRef(new Animated.Value(tab === 'feed' ? 0 : 1)).current;
  const [centerRows, setCenterRows] = useState<ProfileCenterRow[]>([]);

  useEffect(() => {
    Animated.timing(tabAnim, {
      toValue: tab === 'feed' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [tab, tabAnim]);

  const {stats: profileStats, refresh: refreshProfileStats} = useProfileStats(user?.id);
  const {friendCount: friendsListCount, hasSyncedFriendList} = useFriends();
  const loadFriendStore = useFriendStore(s => s.load);
  const friendCountDisplay = hasSyncedFriendList
    ? (friendsListCount ?? 0)
    : (profileStats?.friendsCount ?? 0);
  const [friendsListOpen, setFriendsListOpen] = useState(false);
  const [feedReactions, setFeedReactions] = useState<
    Record<string, {liked: boolean; likes: number}>
  >({});
  const [bicepsBusyByPost, setBicepsBusyByPost] = useState<Record<string, boolean>>(
    {},
  );
  const [bicepsListVisible, setBicepsListVisible] = useState(false);
  const [bicepsListLoading, setBicepsListLoading] = useState(false);
  const [bicepsListUsers, setBicepsListUsers] = useState<PostBicepsUser[]>([]);
  const [bicepsListPostId, setBicepsListPostId] = useState<string | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activeCommentItem, setActiveCommentItem] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentsByFeedItem, setCommentsByFeedItem] = useState<
    Record<string, Array<{author: string; text: string; id: string}>>
  >({});

  useFocusEffect(
    useCallback(() => {
      refreshWorkoutFeedFromServer().catch(() => {});
      refreshProfileStats();
      void trainingStats.refresh();
      if (user?.id) {
        void loadFriendStore(user.id);
        void refreshProfileCenters();
        void fetchFeaturedBadgeIdsForUser(user.id).then(ids => {
          const cur = useAppStore.getState().user;
          if (!cur || cur.id !== user.id) {
            return;
          }
          const a = (cur.featuredBadgeIds ?? []).join(',');
          const b = ids.join(',');
          if (a !== b) {
            setUser({...cur, featuredBadgeIds: ids});
          }
        });
      }
    }, [
      refreshProfileStats,
      user?.id,
      loadFriendStore,
      trainingStats.refresh,
      setUser,
      refreshProfileCenters,
    ]),
  );

  const displayName = user?.displayName || 'Bruger';
  const username = user?.username || 'bruger';
  const activeStatusText = useMemo(() => {
    if (activeSession?.gymName) {
      return `🏋️ Træner nu i ${activeSession.gymName}`;
    }
    if (trainingStats.activeSessionMinutes > 0) {
      return 'Aktiv nu';
    }
    return 'Sidst set for nylig';
  }, [activeSession?.gymName, trainingStats.activeSessionMinutes]);

  const primaryCenterLabel = useMemo(() => {
    const first = centerRows[0];
    if (!first) {
      return undefined;
    }
    const nameLine = formatGymNameWithBrand(first.name, first.brand);
    const tail = first.city?.trim();
    return tail ? `Træner ofte i ${nameLine} — ${tail}` : `Træner ofte i ${nameLine}`;
  }, [centerRows]);

  const refreshProfileCenters = useCallback(async () => {
    if (!user?.id) {
      setCenterRows([]);
      return;
    }
    try {
      const rows = await loadProfileCentersForUser(user.id);
      setCenterRows(rows);
    } catch {
      setCenterRows([]);
    }
  }, [user?.id]);

  const badgeUnlocks = useBadgeStore(s => s.unlockedByUser[user?.id ?? '']);
  const badgeCount =
    trainingStats.unlockedBadgesCount ||
    (badgeUnlocks ? Object.keys(badgeUnlocks).length : 0);

  const myFeedItems = useMemo(() => {
    return feedItems.filter(
      i =>
        (user?.id && i.userId === user?.id) ||
        (!i.userId && i.user === displayName),
    );
  }, [feedItems, user?.id, displayName]);

  useEffect(() => {
    return subscribeWorkoutFeedRealtime();
  }, []);

  useEffect(() => {
    const uid = user?.id;
    const postIds = myFeedItems.map(item => item.id);
    if (!uid || postIds.length === 0) {
      setFeedReactions({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const states = await fetchPostBicepsStates(postIds, uid);
        if (cancelled) {
          return;
        }
        setFeedReactions(prev => {
          const next: Record<string, {liked: boolean; likes: number}> = {};
          for (const id of postIds) {
            const state = states[id];
            next[id] = {
              liked: state?.reactedByMe ?? false,
              likes: state?.count ?? 0,
            };
          }
          for (const [id, value] of Object.entries(prev)) {
            if (!next[id]) {
              next[id] = value;
            }
          }
          return next;
        });
      } catch {
        // ignore temporary reaction fetch errors
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [myFeedItems, user?.id]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) {
      return;
    }
    return subscribePostBicepsRealtime(postId => {
      if (!myFeedItems.some(item => item.id === postId)) {
        return;
      }
      void (async () => {
        try {
          const states = await fetchPostBicepsStates([postId], uid);
          const state = states[postId];
          if (state) {
            setFeedReactions(prev => ({
              ...prev,
              [postId]: {liked: state.reactedByMe, likes: state.count},
            }));
          }
          if (bicepsListVisible && bicepsListPostId === postId) {
            const users = await fetchPostBicepsUsers(postId);
            setBicepsListUsers(users);
          }
        } catch {
          // ignore transient realtime update errors
        }
      })();
    });
  }, [user?.id, myFeedItems, bicepsListVisible, bicepsListPostId]);

  const uid = user?.id ?? '';
  const workoutsFromCheckIns = useMemo(
    () => completedSessionsToWorkouts(trainingStats.recentSessions, uid),
    [trainingStats.recentSessions, uid],
  );

  const feedSessions = useMemo(
    () => trainingStats.recentSessions.slice(0, 10),
    [trainingStats.recentSessions],
  );

  const dataTabWorkouts = useMemo(
    () => filterWorkoutsByPeriod(workoutsFromCheckIns, dataWorkoutPeriod),
    [workoutsFromCheckIns, dataWorkoutPeriod],
  );

  const dataTabSessions = useMemo(() => {
    const ids = new Set(dataTabWorkouts.map(w => w.id));
    return trainingStats.recentSessions.filter(s => ids.has(s.id));
  }, [dataTabWorkouts, trainingStats.recentSessions]);

  const dataTabWorkoutsSummary = useMemo(() => {
    const n = dataTabWorkouts.length;
    const min = sumWorkoutMinutes(dataTabWorkouts);
    return {count: n, minutes: min};
  }, [dataTabWorkouts]);

  const stats = useMemo(() => {
    const rows = [
      {
        key: 'current-streak',
        emoji: streak.getStreakBadge(trainingStats.currentStreakDays) || '🔥',
        label: 'Current streak',
        value: `${trainingStats.currentStreakDays} dage`,
      },
      {
        key: 'longest-streak',
        emoji: streak.getStreakBadge(profileStats?.longestStreak ?? 0) || '👑',
        label: 'Longest streak',
        value: `${profileStats?.longestStreak ?? 0} dage`,
      },
      {
        key: 'checkins',
        emoji: '💪',
        label: 'Check-ins',
        value: dataTabWorkoutsSummary.count,
        onPress: () => navigation.navigate('CheckIn'),
      },
      {
        key: 'time',
        emoji: '⏱',
        label: 'Træningstid',
        value:
          dataWorkoutPeriod === 'all' &&
          trainingStats.activeSessionMinutes > 0
            ? `${formatTotalTime(dataTabWorkoutsSummary.minutes)} (+${trainingStats.activeSessionMinutes} min i gang)`
            : formatTotalTime(dataTabWorkoutsSummary.minutes),
      },
      {
        key: 'friends',
        icon: 'people',
        label: 'Venner',
        value: trainingStats.friendsCount || friendCountDisplay,
        onPress: () => setFriendsListOpen(true),
      },
      {
        key: 'groups',
        icon: 'people-circle',
        label: 'Grupper',
        value: trainingStats.groupsCount,
        onPress: () => navigation.navigate('Friends', {screen: 'Grupper'} as never),
      },
      {
        key: 'badges',
        emoji: '🏅',
        label: 'Badges',
        value: badgeCount,
      },
    ];
    return SURFACE_GROUPS_IN_APP ? rows : rows.filter(r => r.key !== 'groups');
  }, [
    dataTabWorkoutsSummary.count,
    dataTabWorkoutsSummary.minutes,
    dataWorkoutPeriod,
    trainingStats.activeSessionMinutes,
    trainingStats.currentStreakDays,
    trainingStats.friendsCount,
    trainingStats.groupsCount,
    friendCountDisplay,
    badgeCount,
    profileStats?.longestStreak,
    navigation,
  ]);

  const myActiveGoals = useMemo(() => {
    const goalUserId = user?.id;
    return goals.filter(g => {
      if (g.isCompleted) {
        return false;
      }
      if (goalUserId && g.userId === goalUserId) {
        return true;
      }
      if (g.userId === 'current_user') {
        return true;
      }
      return false;
    });
  }, [goals, user?.id]);

  const renderCompletedSessionRow = (
    s: ProfileCompletedSession,
    isLast?: boolean,
  ) => (
    <View
      key={s.id}
      style={[styles.workoutHistoryRow, isLast && styles.workoutHistoryRowLast]}>
      <View style={styles.workoutHistoryIcon}>
        <Icon name="barbell-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.workoutHistoryBody}>
        <Text style={styles.workoutHistoryTitle} numberOfLines={2}>
          {s.gymName}
        </Text>
        <Text style={styles.workoutHistoryMeta} numberOfLines={1}>
          {formatSessionDateAndDurationDa(s.startedAt, s.durationMinutes)}
        </Text>
        <Text style={styles.workoutHistoryTypeLine} numberOfLines={2}>
          {formatWorkoutTypeDisplay(s.workoutType)}
        </Text>
        {s.partnerDisplayName ? (
          <Text style={styles.workoutHistoryWith} numberOfLines={1}>
            Med: {s.partnerDisplayName}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const toggleLike = useCallback(
    async (itemId: string) => {
      if (bicepsBusyByPost[itemId]) {
        return;
      }
      const previous = feedReactions[itemId] ?? {liked: false, likes: 0};
      const optimisticLiked = !previous.liked;
      const optimisticLikes = Math.max(
        0,
        previous.likes + (optimisticLiked ? 1 : -1),
      );
      setFeedReactions(prev => ({
        ...prev,
        [itemId]: {liked: optimisticLiked, likes: optimisticLikes},
      }));
      setBicepsBusyByPost(prev => ({...prev, [itemId]: true}));
      try {
        const result = await togglePostBicepsReaction(itemId);
        setFeedReactions(prev => ({
          ...prev,
          [itemId]: {liked: result.reacted, likes: result.count},
        }));
      } catch {
        setFeedReactions(prev => ({
          ...prev,
          [itemId]: previous,
        }));
      } finally {
        setBicepsBusyByPost(prev => ({...prev, [itemId]: false}));
      }
    },
    [bicepsBusyByPost, feedReactions],
  );

  const openBicepsList = useCallback(async (itemId: string) => {
    setBicepsListPostId(itemId);
    setBicepsListVisible(true);
    setBicepsListLoading(true);
    try {
      const users = await fetchPostBicepsUsers(itemId);
      setBicepsListUsers(users);
    } catch {
      setBicepsListUsers([]);
    } finally {
      setBicepsListLoading(false);
    }
  }, []);

  const closeBicepsList = useCallback(() => {
    setBicepsListVisible(false);
    setBicepsListPostId(null);
    setBicepsListUsers([]);
    setBicepsListLoading(false);
  }, []);

  const openComments = useCallback((itemId: string) => {
    setActiveCommentItem(itemId);
    setCommentModalVisible(true);
  }, []);

  const closeComments = useCallback(() => {
    setCommentModalVisible(false);
    setActiveCommentItem(null);
    setCommentInput('');
  }, []);

  const addComment = useCallback(() => {
    if (!activeCommentItem) {
      return;
    }
    const text = commentInput.trim();
    if (!text) {
      return;
    }
    const author = displayName || 'Bruger';
    const nextComment = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      author,
      text,
    };
    setCommentsByFeedItem(prev => ({
      ...prev,
      [activeCommentItem]: [...(prev[activeCommentItem] ?? []), nextComment],
    }));
    setCommentInput('');
  }, [activeCommentItem, commentInput, displayName]);

  const parseWorkoutInfo = useCallback((info?: string) => {
    const fallback = {
      gymName: 'Center',
      duration: '0 min',
      workoutType: 'fri',
    };
    if (!info) {
      return fallback;
    }
    const parts = info
      .split('·')
      .map(p => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      return {
        gymName: parts[0],
        duration: parts[1],
        workoutType: parts.slice(2).join(' · '),
      };
    }
    return {
      gymName: parts[0] ?? fallback.gymName,
      duration: parts[1] ?? fallback.duration,
      workoutType: parts[2] ?? fallback.workoutType,
    };
  }, []);

  const handleFeedItemMenu = useCallback(
    (item: FeedItem) => {
      Alert.alert('Opslag', 'Vælg handling', [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Slet opslag',
          style: 'destructive',
          onPress: () => {
            deleteFeedItem(item.id);
          },
        },
      ]);
    },
    [deleteFeedItem],
  );

  const activeComments = activeCommentItem
    ? commentsByFeedItem[activeCommentItem] ?? []
    : [];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <ProfileHeader
          displayName={displayName}
          username={username}
          profileImageUrl={user?.profileImageUrl}
          showBio={false}
          onEditPress={() => navigation.navigate('EditProfile')}
          activeStatus={activeStatusText}
          primaryCenterLabel={primaryCenterLabel}
          followersCount={profileStats?.followersCount ?? 0}
          followingCount={profileStats?.followingCount ?? 0}
          friendsCount={friendCountDisplay}
          onFriendsPress={() => setFriendsListOpen(true)}
        />

        {user?.id ? (
          <ProfileBadgeStrip
            userId={user.id}
            featuredBadgeIds={user.featuredBadgeIds ?? null}
          />
        ) : null}

        {centerRows.length > 0 ? (
          <ProfileCentersList
            centers={centerRows}
            activeCountForId={id => getActiveUsersCount(id)}
          />
        ) : (
          <TouchableOpacity
            style={styles.noCentersHint}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.85}>
            <Icon name="location-outline" size={18} color={colors.primary} />
            <Text style={styles.noCentersHintText}>
              Har ikke valgt primært center endnu — tryk for at vælge under Rediger profil
            </Text>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Faner */}
        <View style={styles.tabBar}>
          <View
            pointerEvents="none"
            style={styles.tabBarMeasure}
            onLayout={e => setTabBarWidth(e.nativeEvent.layout.width)}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabSlider,
              {
                width: Math.max((tabBarWidth - 10) / 2, 0),
                transform: [
                  {
                    translateX: tabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max((tabBarWidth - 10) / 2, 0)],
                    }),
                  },
                ],
              },
            ]}
          />
          <Pressable
            style={styles.tabBtn}
            onPress={() => setTab('feed')}
            android_ripple={{color: '#00000010'}}>
            <Icon
              name="newspaper-outline"
              size={18}
              color={tab === 'feed' ? colors.white : colors.textSecondary}
            />
            <Text
              style={[styles.tabBtnText, tab === 'feed' && styles.tabBtnTextActive]}>
              Feed
            </Text>
          </Pressable>
          <Pressable
            style={styles.tabBtn}
            onPress={() => setTab('data')}
            android_ripple={{color: '#00000010'}}>
            <Icon
              name="stats-chart-outline"
              size={18}
              color={tab === 'data' ? colors.white : colors.textSecondary}
            />
            <Text
              style={[styles.tabBtnText, tab === 'data' && styles.tabBtnTextActive]}>
              Data
            </Text>
          </Pressable>
        </View>

        {tab === 'feed' ? (
          <View style={styles.section}>
            <Text style={styles.blockTitle}>Dine træninger</Text>
            <Text style={styles.blockSubtitle}>
              Historik fra dine sessioner
            </Text>
            <Card variant="outlined" padding="md">
              {trainingStats.loading && trainingStats.recentSessions.length === 0 ? (
                <View style={styles.sessionsLoadingBox}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : feedSessions.length > 0 ? (
                feedSessions.map((s, i) =>
                  renderCompletedSessionRow(
                    s,
                    i === feedSessions.length - 1,
                  ),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="fitness-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen træninger endnu</Text>
                  <Text style={styles.emptySubtext}>
                    Afslut din session (tjek ud) for at se den her
                  </Text>
                </View>
              )}
            </Card>

            <Text style={[styles.blockTitle, styles.blockTitleSpaced]}>
              Opslag & delte træninger
            </Text>
            <Text style={styles.blockSubtitle}>
              Billeder, PR&apos;s og hvad du har delt til feed
            </Text>
            <View style={styles.profileFeedList}>
              {myFeedItems.length > 0 ? (
                myFeedItems.map(post => {
                  const parsedInfo = parseWorkoutInfo(post.workoutInfo);
                  const reaction = feedReactions[post.id] ?? {liked: false, likes: 0};
                  const commentCount = commentsByFeedItem[post.id]?.length ?? 0;
                  return (
                    <GymlyPostCard
                      key={post.id}
                      userId={post.userId ?? ''}
                      userName={post.user}
                      userAvatar={post.userAvatarUrl}
                      gymName={parsedInfo.gymName}
                      workoutType={parsedInfo.workoutType}
                      duration={parsedInfo.duration}
                      mediaUri={post.photoUri ?? post.videoThumbnailUri ?? post.videoUri}
                      caption={post.description}
                      timestamp={post.timestamp}
                      reactions={{bicep: reaction.likes, fire: 0, eyes: 0}}
                      bicepActive={reaction.liked}
                      hasPR={isPrItem(post)}
                      onReaction={type => {
                        if (type === 'bicep') {
                          void toggleLike(post.id);
                        }
                      }}
                      onCommentPress={() => openComments(post.id)}
                      commentCount={commentCount}
                      onBicepsCountPress={() => void openBicepsList(post.id)}
                      onMenuPress={
                        user?.id && post.userId === user.id
                          ? () => handleFeedItemMenu(post)
                          : undefined
                      }
                    />
                  );
                })
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="images-outline" size={36} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen opslag endnu</Text>
                  <Text style={styles.emptySubtext}>
                    Del din første træning 🔥
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyCta}
                    onPress={() => navigation.navigate('CheckIn')}
                    activeOpacity={0.85}>
                    <Text style={styles.emptyCtaText}>Start træning</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistik</Text>
            <Text style={styles.dataPeriodHint}>
              Check-ins og træningstid følger perioden nedenfor. Streak er altid
              samlet.
            </Text>
            <View style={styles.periodChips}>
              {DATA_PERIOD_OPTIONS.map(({key, label}) => {
                const active = dataWorkoutPeriod === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.periodChip, active && styles.periodChipActive]}
                    onPress={() => setDataWorkoutPeriod(key)}
                    activeOpacity={0.85}>
                    <Text
                      style={[
                        styles.periodChipText,
                        active && styles.periodChipTextActive,
                      ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.streakBlock}>
              <StreakHighlight
                currentStreak={trainingStats.currentStreakDays}
                longestStreak={Math.max(
                  profileStats?.longestStreak ?? 0,
                  trainingStats.currentStreakDays,
                )}
                onPress={() => navigation.navigate('CheckIn')}
              />
              <Text style={styles.streakMicro}>Du er på vej 💪</Text>
              <Text style={styles.streakMotivation}>
                {trainingStats.currentStreakDays > 3
                  ? 'Du er on fire 🔥'
                  : trainingStats.currentStreakDays === 0
                  ? 'Start din streak i dag'
                  : 'Hold momentumet kørende'}
              </Text>
            </View>
            <Card variant="outlined" padding="lg" style={styles.statsCard}>
              <ProfileStatGrid stats={stats} />
            </Card>

            <Text style={styles.recentWorkoutsHeading}>Seneste træninger</Text>
            <Text style={styles.recentWorkoutsSub}>
              {dataTabWorkoutsSummary.count === 0
                ? 'Ingen i valgt periode'
                : `${dataTabWorkoutsSummary.count} træning${
                    dataTabWorkoutsSummary.count === 1 ? '' : 'er'
                  } · ${formatTotalTime(dataTabWorkoutsSummary.minutes)}`}
            </Text>
            <Card variant="outlined" padding="md">
              {trainingStats.loading && trainingStats.recentSessions.length === 0 ? (
                <View style={styles.sessionsLoadingBox}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : dataTabSessions.length > 0 ? (
                dataTabSessions.map((s, i) =>
                  renderCompletedSessionRow(
                    s,
                    i === dataTabSessions.length - 1,
                  ),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="calendar-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen træninger her</Text>
                  <Text style={styles.emptySubtext}>
                    Vælg en anden periode eller afslut sessioner for at se historik
                  </Text>
                </View>
              )}
            </Card>

            <Text style={styles.goalsHeading}>Mål</Text>
            <Card variant="outlined" padding="md">
              {myActiveGoals.length === 0 ? (
                <Text style={styles.goalsEmpty}>
                  Du har ingen aktive mål. Tilføj et for at holde fokus.
                </Text>
              ) : (
                myActiveGoals.map(goal => (
                  <View key={goal.id} style={styles.goalRow}>
                    <Icon name="flag" size={18} color={colors.primary} />
                    <View style={styles.goalBody}>
                      <Text style={styles.goalTitle} numberOfLines={2}>
                        {goal.title}
                      </Text>
                      <Text style={styles.goalMeta}>
                        {goal.progress}% · {goal.description}
                      </Text>
                    </View>
                  </View>
                ))
              )}
              <TouchableOpacity
                style={styles.addGoalBtn}
                onPress={() => navigation.navigate('AddGoal')}
                activeOpacity={0.85}>
                <Icon name="add-circle-outline" size={22} color={colors.primary} />
                <Text style={styles.addGoalBtnText}>Tilføj mål</Text>
              </TouchableOpacity>
            </Card>
          </View>
        )}
      </ScrollView>
      <FriendsListModal
        visible={friendsListOpen}
        onClose={() => setFriendsListOpen(false)}
      />
      <Modal visible={bicepsListVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={closeBicepsList}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomSheet}>
                <View style={styles.commentHandle} />
                <View style={styles.bottomSheetHeader}>
                  <Text style={styles.modalTitle}>Biceps</Text>
                  <TouchableOpacity
                    onPress={closeBicepsList}
                    style={styles.commentCloseButton}>
                    <Icon name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.commentList}
                  contentContainerStyle={styles.commentListContent}>
                  {bicepsListLoading ? (
                    <Text style={styles.commentEmpty}>Henter biceps...</Text>
                  ) : bicepsListUsers.length === 0 ? (
                    <Text style={styles.commentEmpty}>Ingen biceps endnu</Text>
                  ) : (
                    bicepsListUsers.map(row => (
                      <TouchableOpacity
                        key={`${row.userId}_${row.createdAt}`}
                        style={styles.commentRow}
                        onPress={() =>
                          navigation.navigate('FriendProfile', {
                            friendId: row.userId,
                            friendName: row.name,
                          })
                        }
                        activeOpacity={0.8}>
                        <Text style={styles.commentAuthor}>{row.name}</Text>
                        <Text style={styles.commentBody}>@{row.username}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal visible={commentModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={closeComments}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomSheet}>
                <View style={styles.commentHandle} />
                <View style={styles.bottomSheetHeader}>
                  <Text style={styles.modalTitle}>Kommentarer</Text>
                  <TouchableOpacity
                    onPress={closeComments}
                    style={styles.commentCloseButton}>
                    <Icon name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.commentList}
                  contentContainerStyle={styles.commentListContent}>
                  {activeComments.length === 0 ? (
                    <Text style={styles.commentEmpty}>Ingen kommentarer endnu</Text>
                  ) : (
                    activeComments.map(comment => (
                      <View key={comment.id} style={styles.commentRow}>
                        <Text style={styles.commentAuthor}>{comment.author}</Text>
                        <Text style={styles.commentBody}>{comment.text}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
                <View style={styles.commentComposer}>
                  <TextInput
                    value={commentInput}
                    onChangeText={setCommentInput}
                    placeholder="Skriv en kommentar..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.commentInput}
                  />
                  <TouchableOpacity
                    style={styles.commentSend}
                    onPress={addComment}
                    activeOpacity={0.85}>
                    <Text style={styles.commentSendText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {flex: 1},
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tabBar: {
    flexDirection: 'row',
    position: 'relative',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: 3,
    backgroundColor: '#F2F2F7',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabSlider: {
    position: 'absolute',
    top: 3,
    left: 3,
    height: '86%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  tabBarMeasure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  tabBtnText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 15,
  },
  tabBtnTextActive: {
    color: colors.white,
  },
  blockTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 2,
  },
  blockTitleSpaced: {
    marginTop: spacing.xl,
  },
  blockSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  noCentersHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary + '25',
  },
  noCentersHintText: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  dataPeriodHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  streakBlock: {
    marginTop: 0,
    marginBottom: spacing.md,
  },
  streakMicro: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  streakMotivation: {
    ...typography.bodyBold,
    color: colors.primaryDark,
    marginTop: 4,
    marginLeft: spacing.xs,
  },
  statsCard: {
    marginTop: 0,
    marginBottom: spacing.sm,
  },
  profileFeedList: {
    gap: spacing.md,
  },
  recentWorkoutsHeading: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: 4,
  },
  recentWorkoutsSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  periodChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  periodChipText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: colors.primary,
  },
  workoutHistoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  workoutHistoryRowLast: {
    borderBottomWidth: 0,
  },
  workoutHistoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutHistoryBody: {flex: 1, minWidth: 0},
  workoutHistoryTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  workoutHistoryMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  workoutHistoryTypeLine: {
    ...typography.small,
    color: colors.text,
    marginTop: 4,
    fontWeight: '600',
  },
  workoutHistoryWith: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sessionsLoadingBox: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: spacing.lg,
  },
  commentHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  commentCloseButton: {
    padding: spacing.xs,
  },
  commentList: {
    maxHeight: 320,
  },
  commentListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  commentEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  commentRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  commentAuthor: {
    ...typography.small,
    color: colors.text,
    fontWeight: '700',
  },
  commentBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  commentComposer: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  commentSend: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  commentSendText: {
    ...typography.small,
    color: colors.white,
    fontWeight: '700',
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary + '15',
    borderRadius: 10,
  },
  emptyCtaText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  goalsHeading: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  goalsEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  goalBody: {flex: 1},
  goalTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  goalMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  addGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '08',
  },
  addGoalBtnText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
});

export default ProfileScreen;
