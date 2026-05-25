/**
 * Profil – faner Feed (træninger + opslag) og Data (statistik); titel/tandhjul i tab-header
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
  Modal,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useAppStore} from '@/store/appStore';
import {fetchFeaturedBadgeIdsForUser} from '@/services/supabase/profileFeaturedBadgesService';
import {useFeedStore} from '@/store/feedStore';
import {refreshWorkoutFeedFromServer} from '@/services/supabase/workoutPostService';
import {subscribeWorkoutFeedRealtime} from '@/services/supabase/workoutPostService';
import {SegmentedControl} from '@/components/ui/SegmentedControl';
import {SheetHandle} from '@/components/ui/SheetHandle';
import {
  ProfileHeader,
  ProfileCentersList,
  ProfileStatGrid,
  StreakHighlight,
  ProfileBadgeStrip,
} from '@/components/profile';
import {CompletedSessionRow} from '@/components/profile/CompletedSessionRow';
import {FriendsListModal} from '@/components/friends/FriendsListModal';
import {useFriendStore} from '@/store/friendStore';
import {Card} from '@/components/ui/Card';
import type {FeedItem} from '@/store/feedStore';
import {completedSessionsToWorkouts} from '@/services/supabase/profileCheckInHistory';
import * as streak from '@/utils/streakUtils';
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
import {
  persistUserHomeGyms,
  subscribeUserCenters,
} from '@/services/supabase/userCentersService';
import {emitProfileCentersChanged} from '@/realtime/profileCentersBridge';
import type {ProfileCenterRow} from '@/components/profile/ProfileCentersList';
import {EditProfileCentersSheet} from '@/components/profile/EditProfileCentersSheet';
import {GymlyToast} from '@/components/ui/GymlyToast';
import {useGymStore} from '@/store/gymStore';
import {useSessionStore} from '@/store/sessionStore';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import GymlyPostCard from '@/components/feed/GymlyPostCard';
import {PostActionBottomSheet} from '@/components/feed/PostActionBottomSheet';
import {feedItemToPostActionSheet} from '@/utils/postActionMappers';
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

const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const {t} = useTranslation();
  const isAuthenticated = useAppStore(s => s.isAuthenticated);
  const {user, setUser} = useAppStore();
  const {feedItems} = useFeedStore();
  const [tab, setTab] = useState<ProfileTab>('feed');
  const [dataWorkoutPeriod, setDataWorkoutPeriod] =
    useState<WorkoutPeriod>('week');
  const trainingStats = useUserTrainingStats(user?.id);
  const activeSession = useSessionStore(s => s.activeSession);
  const getActiveUsersCount = useGymStore(s => s.getActiveUsersCount);
  const [centerRows, setCenterRows] = useState<ProfileCenterRow[]>([]);
  const [centersSheetOpen, setCentersSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
  const [postActionItem, setPostActionItem] = useState<FeedItem | null>(null);

  const dataPeriodOptions = useMemo(
    (): {key: WorkoutPeriod; label: string}[] => [
      {key: 'all', label: t('profile.periodAll')},
      {key: 'week', label: t('profile.periodWeek')},
      {key: 'month', label: t('profile.periodMonth')},
      {key: 'year', label: t('profile.periodYear')},
    ],
    [t],
  );

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

  const displayName =
    user?.displayName?.trim() ||
    user?.email?.split('@')[0]?.trim() ||
    '';
  const username = user?.username?.trim() || '';
  const activeStatusText = useMemo(() => {
    if (activeSession?.gymName) {
      return t('profile.trainingNow', {gym: activeSession.gymName});
    }
    if (trainingStats.activeSessionMinutes > 0) {
      return t('friendsScreen.activeNow');
    }
    return t('profile.lastSeenRecent');
  }, [activeSession?.gymName, trainingStats.activeSessionMinutes, t]);

  const primaryCenterLabel = useMemo(() => {
    const first = centerRows[0];
    if (!first) {
      return undefined;
    }
    const nameLine = formatGymNameWithBrand(first.name, first.brand);
    const tail = first.city?.trim();
    return tail
      ? t('profile.trainsOftenCity', {gym: nameLine, city: tail})
      : t('profile.trainsOften', {gym: nameLine});
  }, [centerRows, t]);

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

  useEffect(() => {
    void refreshProfileCenters();
  }, [refreshProfileCenters]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    return subscribeUserCenters(user.id, () => {
      void refreshProfileCenters();
    });
  }, [user?.id, refreshProfileCenters]);

  const handleSaveCenters = useCallback(
    async (orderedIds: string[]) => {
      if (!user?.id) {
        throw new Error('no user');
      }
      try {
        const ids = await persistUserHomeGyms(user.id, orderedIds);
        setCentersSheetOpen(false);
        const cur = useAppStore.getState().user;
        if (cur && cur.id === user.id) {
          setUser({...cur, favoriteGyms: ids, updatedAt: new Date()}, {skipProfileSync: true});
        }
        emitProfileCentersChanged(user.id);
        await refreshProfileCenters();
      } catch {
        setToastMessage(t('profile.saveCentresFailed'));
        throw new Error('save centers failed');
      }
    },
    [user?.id, setUser, refreshProfileCenters, t],
  );

  const openCentersEditor = useCallback(() => {
    setCentersSheetOpen(true);
  }, []);

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

  const profilePreviewSessions = useMemo(
    () => trainingStats.recentSessions.slice(0, 5),
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
        emoji: streak.getStreakBadge(trainingStats.longestStreakDays) || '👑',
        label: 'Longest streak',
        value: `${trainingStats.longestStreakDays} dage`,
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
        label: t('profile.trainingTime'),
        value:
          dataWorkoutPeriod === 'all' &&
          trainingStats.activeSessionMinutes > 0
            ? `${formatTotalTime(dataTabWorkoutsSummary.minutes)} (+${trainingStats.activeSessionMinutes} min i gang)`
            : formatTotalTime(dataTabWorkoutsSummary.minutes),
      },
      {
        key: 'friends',
        icon: 'people',
        label: t('tabs.friends'),
        value: trainingStats.friendsCount || friendCountDisplay,
        onPress: () => setFriendsListOpen(true),
      },
      {
        key: 'badges',
        emoji: '🏅',
        label: 'Badges',
        value: badgeCount,
      },
    ];
    return rows;
  }, [
    dataTabWorkoutsSummary.count,
    dataTabWorkoutsSummary.minutes,
    dataWorkoutPeriod,
    trainingStats.activeSessionMinutes,
    trainingStats.currentStreakDays,
    trainingStats.longestStreakDays,
    trainingStats.friendsCount,
    trainingStats.groupsCount,
    friendCountDisplay,
    badgeCount,
    navigation,
    t,
  ]);

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

  const closePostActionSheet = useCallback(() => {
    setPostActionItem(null);
  }, []);

  const handlePostDeletedSideEffects = useCallback((postId: string) => {
    setFeedReactions(prev => {
      const next = {...prev};
      delete next[postId];
      return next;
    });
    setCommentsByFeedItem(prev => {
      const next = {...prev};
      delete next[postId];
      return next;
    });
  }, []);

  const openPostActionMenu = useCallback((post: FeedItem) => {
    setPostActionItem(post);
  }, []);

  const activeComments = activeCommentItem
    ? commentsByFeedItem[activeCommentItem] ?? []
    : [];

  if (!isAuthenticated || !user?.id) {
    return null;
  }

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
          friendsCount={friendCountDisplay}
          onFriendsPress={() => setFriendsListOpen(true)}
        />

        {user?.id ? <ProfileBadgeStrip userId={user.id} /> : null}

        {centerRows.length > 0 ? (
          <ProfileCentersList
            centers={centerRows}
            activeCountForId={id => getActiveUsersCount(id)}
            onEditPress={openCentersEditor}
          />
        ) : (
          <TouchableOpacity
            style={styles.noCentersHint}
            onPress={openCentersEditor}
            activeOpacity={0.85}>
            <Icon name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.noCentersHintText}>{t('profile.addHomeGyms')}</Text>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        <SegmentedControl<ProfileTab>
          segments={[
            {key: 'feed', label: t('profile.feedTab'), icon: 'newspaper-outline'},
            {key: 'data', label: t('profile.dataTab'), icon: 'stats-chart-outline'},
          ]}
          value={tab}
          onChange={setTab}
          style={styles.tabBar}
        />

        {tab === 'feed' ? (
          <View style={styles.section}>
            <View style={styles.blockHeaderRow}>
              <Text style={styles.blockTitle}>{t('profile.yourWorkouts')}</Text>
              {profilePreviewSessions.length > 0 ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('AllTrainings')}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                  activeOpacity={0.7}>
                  <Text style={styles.seeAll}>{t('profile.seeAll')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.blockSubtitle}>{t('profile.workoutHistorySub')}</Text>
            <Card variant="outlined" padding="md">
              {trainingStats.loading && trainingStats.recentSessions.length === 0 ? (
                <View style={styles.sessionsLoadingBox}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : profilePreviewSessions.length > 0 ? (
                profilePreviewSessions.map((s, i) => (
                  <CompletedSessionRow
                    key={s.id}
                    session={s}
                    isLast={i === profilePreviewSessions.length - 1}
                  />
                ))
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="fitness-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>{t('profile.noWorkoutsYet')}</Text>
                  <Text style={styles.emptySubtext}>{t('profile.noWorkoutsSub')}</Text>
                </View>
              )}
            </Card>

            <Text style={[styles.blockTitle, styles.blockTitleSpaced]}>
              {t('profile.postsAndShared')}
            </Text>
            <Text style={styles.blockSubtitle}>{t('profile.postsSub')}</Text>
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
                      onMenuPress={() => openPostActionMenu(post)}
                    />
                  );
                })
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="images-outline" size={36} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>{t('profile.noPosts')}</Text>
                  <Text style={styles.emptySubtext}>{t('profile.shareFirst')}</Text>
                  <TouchableOpacity
                    style={styles.emptyCta}
                    onPress={() => navigation.navigate('CheckIn')}
                    activeOpacity={0.85}>
                    <Text style={styles.emptyCtaText}>{t('profile.startTraining')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.statistics')}</Text>
            <Text style={styles.dataPeriodHint}>{t('profile.statsHint')}</Text>
            <SegmentedControl<WorkoutPeriod>
              variant="chips"
              segments={dataPeriodOptions.map(({key, label}) => ({key, label}))}
              value={dataWorkoutPeriod}
              onChange={setDataWorkoutPeriod}
              style={styles.periodChips}
            />
            <View style={styles.streakBlock}>
              <StreakHighlight
                currentStreak={trainingStats.currentStreakDays}
                longestStreak={trainingStats.longestStreakDays}
                onPress={() => navigation.navigate('CheckIn')}
              />
              <Text style={styles.streakMicro}>{t('profile.onYourWay')}</Text>
              <Text style={styles.streakMotivation}>
                {trainingStats.currentStreakDays > 3
                  ? t('profile.onFire')
                  : trainingStats.currentStreakDays === 0
                  ? t('profile.startStreakToday')
                  : t('profile.keepMomentum')}
              </Text>
            </View>
            <Card variant="outlined" padding="lg" style={styles.statsCard}>
              <ProfileStatGrid stats={stats} />
            </Card>

            <Text style={styles.recentWorkoutsHeading}>{t('profile.recentWorkouts')}</Text>
            <Text style={styles.recentWorkoutsSub}>
              {dataTabWorkoutsSummary.count === 0
                ? t('profile.noneInPeriod')
                : `${t(
                    dataTabWorkoutsSummary.count === 1
                      ? 'profile.workoutCount'
                      : 'profile.workoutCount_other',
                    {count: String(dataTabWorkoutsSummary.count)},
                  )} · ${formatTotalTime(dataTabWorkoutsSummary.minutes)}`}
            </Text>
            <Card variant="outlined" padding="md" style={styles.recentWorkoutsCard}>
              {trainingStats.loading && trainingStats.recentSessions.length === 0 ? (
                <View style={styles.sessionsLoadingBox}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : dataTabSessions.length > 0 ? (
                dataTabSessions.map((s, i) => (
                  <CompletedSessionRow
                    key={s.id}
                    session={s}
                    isLast={i === dataTabSessions.length - 1}
                  />
                ))
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="calendar-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>{t('profile.noWorkoutsHere')}</Text>
                  <Text style={styles.emptySubtext}>{t('profile.noWorkoutsSub')}</Text>
                </View>
              )}
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
                <SheetHandle />
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
                <SheetHandle />
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
      <EditProfileCentersSheet
        visible={centersSheetOpen}
        initialCenterIds={user?.favoriteGyms ?? centerRows.map(r => r.centerId).filter(Boolean) as string[]}
        onClose={() => setCentersSheetOpen(false)}
        onSave={handleSaveCenters}
        onLimitReached={() => setToastMessage(t('profile.maxCentres'))}
      />
      <GymlyToast message={toastMessage} onHidden={() => setToastMessage(null)} />
      <PostActionBottomSheet
        visible={!!postActionItem}
        onClose={closePostActionSheet}
        post={postActionItem ? feedItemToPostActionSheet(postActionItem) : null}
        currentUserId={user?.id}
        variant="workoutPost"
        onPostDeleted={handlePostDeletedSideEffects}
      />
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
    paddingBottom: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tabBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  blockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  blockTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  seeAll: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
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
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '30',
    ...shadows.sm,
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
  recentWorkoutsCard: {
    marginBottom: 0,
  },
  periodChips: {
    marginBottom: spacing.md,
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
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: '70%',
    paddingBottom: spacing.lg,
    ...shadows.sheet,
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
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
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
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary + '14',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary + '35',
    ...shadows.sm,
  },
  emptyCtaText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
});

export default ProfileScreen;
