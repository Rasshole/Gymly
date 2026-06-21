/**
 * Friend Profile – som egen profil: data, centre, feed/data, uden redigering
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  Pressable,
} from 'react-native';
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';
import {useFeedStore} from '@/store/feedStore';
import {useGoalStore} from '@/store/goalStore';
import {useBadgeStore} from '@/store/badgeStore';
import {supabase} from '@/services/supabase/supabaseClient';
import {subscribeWorkoutFeedRealtime} from '@/services/supabase/workoutPostService';
import {fetchPostBicepsUsers, type PostBicepsUser} from '@/services/supabase/workoutReactionService';
import {usePostEngagement} from '@/hooks/usePostEngagement';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import {
  isFriendWith,
  getPendingRequestBetween,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  type PendingBetween,
} from '@/services/supabase/friendService';
import {
  getSupabaseRpcErrorMessage,
  isFriendRequestStaleError,
} from '@/utils/friendRequestRpcErrors';
import {useFriendStore} from '@/store/friendStore';
import {useTranslation} from '@/i18n';
import {
  ProfileHeader,
  ProfileCentersList,
  ProfileStatGrid,
  StreakHighlight,
  ProfileBadgeStrip,
} from '@/components/profile';
import {Card} from '@/components/ui/Card';
import type {FeedItem} from '@/store/feedStore';
import {
  fetchCompletedCheckInSessionsForUser,
  completedSessionsToWorkouts,
  formatSessionDateAndDurationDa,
  type ProfileCompletedSession,
} from '@/services/supabase/profileCheckInHistory';
import {getActiveCheckInForUser} from '@/services/supabase/checkInService';
import {
  getUserStats as fetchUserStatsFromSupabase,
  type UserStats as SupabaseUserStats,
} from '@/services/supabase/userStatsService';
import {
  fetchSentWorkoutVibeEmojis,
  sendWorkoutVibeRpc,
} from '@/services/supabase/workoutVibeService';
import {getProfileDisplay} from '@/services/data/ProfileService';
import type {SupabaseCheckInRow} from '@/types/checkIn.types';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {loadProfileCentersForUser} from '@/services/supabase/profileCentersPublicService';
import {useGymStore} from '@/store/gymStore';
import {
  filterWorkoutsByPeriod,
  sumWorkoutMinutes,
  type WorkoutPeriod,
} from '@/utils/workoutPeriodFilter';
import {useProfileStats, useWeeklyStats} from '@/hooks/useProfileData';
import {useJoinedGroups} from '@/hooks/useGroupData';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import {PurpleGradientButton} from '@/components/ui/PurpleGradientButton';
import type {ProfileCenterRow} from '@/components/profile/ProfileCentersList';
import GymlyPostCard from '@/components/feed/GymlyPostCard';
import {PostActionBottomSheet} from '@/components/feed/PostActionBottomSheet';
import {feedItemToPostActionSheet} from '@/utils/postActionMappers';

type FriendProfileRouteParams = {
  friendId?: string;
  userId?: string;
  friendName?: string;
  mutualFriends?: number;
  gyms?: string[];
  friendAvatarUrl?: string;
  /** Gym-kontekst fra navigation (fx Live / Aktive nu) */
  activeCenterName?: string;
};

type FriendProfileUser = {
  id: string;
  displayName: string;
  username: string;
  profileImageUrl: string | null;
  favoriteGymIds: string[];
  featuredBadgeIds: string[];
};

type ProfileTab = 'feed' | 'data';


const NON_FRIEND_VIBE_OPTIONS = [
  {emoji: '💪', label: 'Respekt'},
  {emoji: '🔥', label: 'On fire'},
  {emoji: '👋', label: 'Hey'},
] as const;

function computeSessionInsights(sessions: ProfileCompletedSession[]) {
  const typeCounts = new Map<string, number>();
  const gymCounts = new Map<string, number>();
  for (const s of sessions) {
    const wt = s.workoutType?.trim();
    if (wt) {
      typeCounts.set(wt, (typeCounts.get(wt) ?? 0) + 1);
    }
    const g = s.gymName?.trim();
    if (g) {
      gymCounts.set(g, (gymCounts.get(g) ?? 0) + 1);
    }
  }
  let topWorkoutType: string | null = null;
  let topWorkoutScore = 0;
  for (const [k, v] of typeCounts) {
    if (v > topWorkoutScore) {
      topWorkoutScore = v;
      topWorkoutType = k;
    }
  }
  let topGymName: string | null = null;
  let topGymScore = 0;
  for (const [k, v] of gymCounts) {
    if (v > topGymScore) {
      topGymScore = v;
      topGymName = k;
    }
  }
  const last = sessions[0];
  const lastEnded = last?.endedAt ?? null;
  const recentlyActive =
    lastEnded != null && Date.now() - lastEnded.getTime() < 7 * 86400000;
  return {
    topWorkoutType,
    topGymName,
    lastEndedAt: lastEnded,
    recentlyActive,
  };
}

const formatTotalTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} timer` : `${h}t ${m}m`;
};

const isPrItem = (i: FeedItem): boolean =>
  i.type === 'pr' || ((i.prInfo?.trim()?.length ?? 0) > 0);

function centersFromGymNameStrings(gyms: string[]): ProfileCenterRow[] {
  return gyms.map(g => {
    const t = g.trim();
    if (!t) {
      return {name: '—'};
    }
    const idx = t.indexOf(' - ');
    if (idx > 0) {
      return {name: t.slice(0, idx).trim(), city: t.slice(idx + 3).trim()};
    }
    return {name: t};
  });
}

const FriendProfileScreen = () => {
  const {t} = useTranslation();
  const dataPeriodOptions = useMemo(
    () => [
      {key: 'week' as const, label: t('profile.periodWeek')},
      {key: 'month' as const, label: t('friendProfile.periodMonth')},
      {key: 'year' as const, label: t('friendProfile.periodYear')},
      {key: 'all' as const, label: t('profile.periodAll')},
    ],
    [t],
  );
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const params = (route.params as FriendProfileRouteParams) || {};
  const friendId = params.friendId ?? params.userId ?? '';
  const {user: currentUser} = useAppStore();
  const {getChatByParticipants, upsertChat} = useChatStore();
  const feedItems = useFeedStore(s => s.feedItems);
  const goals = useGoalStore(s => s.goals);
  const badgeUnlocks = useBadgeStore(
    s => s.unlockedByUser[friendId ?? ''] ?? undefined,
  );
  const badgeCount = useMemo(
    () => (badgeUnlocks ? Object.keys(badgeUnlocks).length : 0),
    [badgeUnlocks],
  );

  const {stats: friendStats, refresh: refreshFriendStats} = useProfileStats(
    friendId || undefined,
  );
  const {refresh: refreshMyProfileStats} = useProfileStats(currentUser?.id);
  const {refresh: refreshFriendWeekly} = useWeeklyStats(friendId || undefined);
  const {groups: friendJoinedGroups} = useJoinedGroups(friendId || undefined);

  const [friendUser, setFriendUser] = useState<FriendProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTab>('feed');
  const [dataWorkoutPeriod, setDataWorkoutPeriod] =
    useState<WorkoutPeriod>('week');
  const [isFriend, setIsFriend] = useState(false);
  const [friendStatusLoading, setFriendStatusLoading] = useState(true);
  const [pendingBetween, setPendingBetween] = useState<PendingBetween | null>(
    null,
  );
  const [requestActionLoading, setRequestActionLoading] = useState(false);
  const [completedSessions, setCompletedSessions] = useState<
    ProfileCompletedSession[]
  >([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [bicepsListVisible, setBicepsListVisible] = useState(false);
  const [bicepsListLoading, setBicepsListLoading] = useState(false);
  const [bicepsListUsers, setBicepsListUsers] = useState<PostBicepsUser[]>([]);
  const [bicepsListPostId, setBicepsListPostId] = useState<string | null>(null);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activeCommentItem, setActiveCommentItem] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [postActionItem, setPostActionItem] = useState<FeedItem | null>(null);
  const [supabaseFriendStats, setSupabaseFriendStats] =
    useState<SupabaseUserStats | null>(null);
  const [friendLiveCheckIn, setFriendLiveCheckIn] =
    useState<SupabaseCheckInRow | null>(null);
  const [profileBio, setProfileBio] = useState<string | null>(null);
  const [vibeSheetVisible, setVibeSheetVisible] = useState(false);
  const [vibeBusy, setVibeBusy] = useState(false);
  const [vibeDelivered, setVibeDelivered] = useState<Set<string>>(
    () => new Set(),
  );
  const [vibeHint, setVibeHint] = useState<string | null>(null);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const loadFriendStore = useFriendStore(s => s.load);
  const removeFriendFromStore = useFriendStore(s => s.removeFriend);
  const getActiveUsersCount = useGymStore(s => s.getActiveUsersCount);

  const [profileCenterRows, setProfileCenterRows] = useState<ProfileCenterRow[]>(
    [],
  );

  const loadProfile = useCallback(async () => {
    if (!friendId) {
      setFriendUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {data, error} = await supabase
        .from('profiles')
        .select('*')
        .eq('id', friendId)
        .maybeSingle();

      const gymIds: string[] = (() => {
        if (error || !data) {
          return [];
        }
        const raw = (data as Record<string, unknown>).favorite_gym_ids;
        if (!Array.isArray(raw)) {
          return [];
        }
        return raw
          .map(x => (x == null ? '' : String(x)))
          .filter((s): s is string => s.length > 0);
      })();

      const featuredRaw = !error && data
        ? (data as Record<string, unknown>).featured_badge_ids
        : null;
      const featuredBadgeIds = Array.isArray(featuredRaw)
        ? featuredRaw.map(x => String(x)).filter(Boolean).slice(0, 3)
        : [];

      if (error || !data) {
        setFriendUser({
          id: friendId,
          displayName: params.friendName?.trim() || 'Ven',
          username: 'bruger',
          profileImageUrl: params.friendAvatarUrl ?? null,
          favoriteGymIds: [],
          featuredBadgeIds: [],
        });
      } else {
        setFriendUser({
          id: data.id as string,
          displayName:
            (data.display_name as string)?.trim() ||
            params.friendName?.trim() ||
            'Ven',
          username: (data.username as string) || 'bruger',
          profileImageUrl:
            (data.avatar_url as string | null) ?? params.friendAvatarUrl ?? null,
          favoriteGymIds: gymIds,
          featuredBadgeIds,
        });
      }
    } catch {
      setFriendUser({
        id: friendId,
        displayName: params.friendName?.trim() || 'Ven',
        username: 'bruger',
        profileImageUrl: params.friendAvatarUrl ?? null,
        favoriteGymIds: [],
        featuredBadgeIds: [],
      });
    } finally {
      setLoading(false);
    }
  }, [friendId, params.friendName, params.friendAvatarUrl]);

  const loadFriendStatus = useCallback(async () => {
    if (!friendId || !currentUser?.id || currentUser.id === friendId) {
      setIsFriend(false);
      setPendingBetween({incoming: null, outgoing: null});
      setFriendStatusLoading(false);
      return;
    }
    setFriendStatusLoading(true);
    try {
      const [f, pend] = await Promise.all([
        isFriendWith(currentUser.id, friendId),
        getPendingRequestBetween(currentUser.id, friendId),
      ]);
      setIsFriend(f);
      setPendingBetween(pend);
    } catch {
      setIsFriend(false);
      setPendingBetween({incoming: null, outgoing: null});
    } finally {
      setFriendStatusLoading(false);
    }
  }, [friendId, currentUser?.id]);

  const loadCompletedSessions = useCallback(async () => {
    if (!friendId) {
      setCompletedSessions([]);
      setSessionsLoading(false);
      return;
    }
    setSessionsLoading(true);
    try {
      const rows = await fetchCompletedCheckInSessionsForUser(friendId);
      setCompletedSessions(rows);
    } catch {
      setCompletedSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [friendId]);

  const refreshProfileCenters = useCallback(async () => {
    if (!friendId) {
      setProfileCenterRows([]);
      return;
    }
    try {
      let rows = await loadProfileCentersForUser(friendId);
      if (rows.length === 0 && (params.gyms ?? []).length > 0) {
        rows = centersFromGymNameStrings(params.gyms ?? []);
      }
      setProfileCenterRows(rows);
      if (__DEV__) {
        console.log('[homeGyms] PublicProfile.load', {
          friendId,
          ids: rows.map(r => r.centerId),
        });
      }
    } catch {
      setProfileCenterRows([]);
    }
  }, [friendId, params.gyms]);

  const loadFriendPublicContext = useCallback(async () => {
    if (!friendId) {
      setSupabaseFriendStats(null);
      setFriendLiveCheckIn(null);
      setProfileBio(null);
      return;
    }
    try {
      const [s, display, activeRow] = await Promise.all([
        fetchUserStatsFromSupabase(friendId),
        getProfileDisplay(friendId),
        (async (): Promise<SupabaseCheckInRow | null> => {
          try {
            return await getActiveCheckInForUser(friendId);
          } catch {
            return null;
          }
        })(),
      ]);
      setSupabaseFriendStats(s);
      setProfileBio(display.bio?.trim() ? display.bio.trim() : null);
      setFriendLiveCheckIn(activeRow);
    } catch {
      setSupabaseFriendStats(null);
      setFriendLiveCheckIn(null);
      setProfileBio(null);
    }
  }, [friendId]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
      void refreshFriendStats();
      void refreshFriendWeekly();
      void loadFriendStatus();
      void loadCompletedSessions();
      void loadFriendPublicContext();
      void refreshProfileCenters();
    }, [
      loadProfile,
      loadFriendStatus,
      loadCompletedSessions,
      loadFriendPublicContext,
      refreshFriendStats,
      refreshFriendWeekly,
      refreshProfileCenters,
    ]),
  );

  useEffect(() => {
    if (!friendId) {
      return;
    }
    const channel = supabase
      .channel(`friend-profile-centers-${friendId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${friendId}`,
        },
        () => {
          void refreshProfileCenters();
          void loadProfile();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_centers',
          filter: `user_id=eq.${friendId}`,
        },
        () => {
          void refreshProfileCenters();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [friendId, refreshProfileCenters, loadProfile]);

  const sessionInsights = useMemo(
    () => computeSessionInsights(completedSessions),
    [completedSessions],
  );

  const mergedDisplayStats = useMemo(() => {
    const f = friendStats;
    const s = supabaseFriendStats;
    if (!f && !s) {
      return null;
    }
    return {
      totalCheckIns: s?.totalCheckIns ?? f?.totalCheckIns ?? 0,
      currentStreak: s?.currentStreak ?? f?.currentStreak ?? 0,
      longestStreak: Math.max(
        s?.longestStreak ?? 0,
        f?.longestStreak ?? 0,
      ),
      totalTrainingMinutes: s?.totalTrainingMinutes ?? f?.totalTrainingMinutes ?? 0,
      badgesCount: f?.badgesCount ?? 0,
      friendsCount: f?.friendsCount ?? 0,
      followersCount: f?.followersCount ?? 0,
      followingCount: f?.followingCount ?? 0,
    };
  }, [friendStats, supabaseFriendStats]);

  const favoriteTypeLabel = useMemo(() => {
    if (!sessionInsights.topWorkoutType) {
      return '—';
    }
    return formatWorkoutTypeDisplay(sessionInsights.topWorkoutType);
  }, [sessionInsights.topWorkoutType]);

  const headerActiveStatus = useMemo(() => {
    if (friendLiveCheckIn?.gym_name?.trim()) {
      return t('profile.trainingNow', {gym: friendLiveCheckIn.gym_name.trim()});
    }
    if (sessionInsights.recentlyActive && sessionInsights.lastEndedAt) {
      return t('friendProfile.activeRecently');
    }
    return undefined;
  }, [
    friendLiveCheckIn,
    sessionInsights.lastEndedAt,
    sessionInsights.recentlyActive,
    t,
  ]);

  const headerPrimaryCenterLabel = useMemo(() => {
    if (friendLiveCheckIn) {
      return undefined;
    }
    const hint = params.activeCenterName?.trim();
    if (hint) {
      return hint;
    }
    const first = profileCenterRows[0];
    if (first) {
      const nameLine = formatGymNameWithBrand(first.name, first.brand);
      const tail = first.city?.trim();
      return tail
        ? t('profile.trainsOftenCity', {gym: nameLine, city: tail})
        : t('profile.trainsOften', {gym: nameLine});
    }
    if (sessionInsights.topGymName) {
      return t('profile.trainsOften', {gym: sessionInsights.topGymName});
    }
    return undefined;
  }, [
    friendLiveCheckIn,
    params.activeCenterName,
    profileCenterRows,
    sessionInsights.topGymName,
    t,
  ]);

  const handleRemoveFriend = useCallback(() => {
    if (!currentUser?.id || !friendUser) {
      return;
    }
    Alert.alert(
      t('friendProfile.removeFriendTitle'),
      t('friendProfile.removeFriendBody'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriendFromStore(currentUser.id, friendUser.id);
              setIsFriend(false);
              setPendingBetween({incoming: null, outgoing: null});
              void refreshMyProfileStats();
              navigation.goBack();
            } catch (e) {
              Alert.alert(
                t('userProfile.couldNotRemove'),
                (e as Error).message || t('common.retry'),
              );
            }
          },
        },
      ],
    );
  }, [currentUser?.id, friendUser, navigation, refreshMyProfileStats, removeFriendFromStore, t]);

  const handleAddFriend = useCallback(async () => {
    if (!currentUser?.id || !friendUser) {
      return;
    }
    setRequestActionLoading(true);
    try {
      await sendFriendRequest(currentUser.id, friendUser.id);
      const pend = await getPendingRequestBetween(
        currentUser.id,
        friendUser.id,
      );
      setPendingBetween(pend);
    } catch (e) {
      Alert.alert(t('friendProfile.couldNotSend'), (e as Error).message || t('common.retry'));
    } finally {
      setRequestActionLoading(false);
    }
  }, [currentUser?.id, friendUser, t]);

  const handleAccept = useCallback(async () => {
    if (!currentUser?.id || !pendingBetween?.incoming) {
      return;
    }
    setRequestActionLoading(true);
    try {
      await acceptFriendRequest(pendingBetween.incoming.id);
      setIsFriend(true);
      setPendingBetween({incoming: null, outgoing: null});
      void loadFriendStore(currentUser.id);
      void refreshFriendStats();
      void refreshMyProfileStats();
    } catch (e) {
      const msg = getSupabaseRpcErrorMessage(e);
      if (isFriendRequestStaleError(msg) && friendUser) {
        void (async () => {
          const [pend, friends] = await Promise.all([
            getPendingRequestBetween(currentUser.id, friendUser.id),
            isFriendWith(currentUser.id, friendUser.id),
          ]);
          setPendingBetween(pend);
          if (friends) {
            setIsFriend(true);
          }
          void loadFriendStore(currentUser.id);
          void refreshFriendStats();
          void refreshMyProfileStats();
        })();
        return;
      }
      Alert.alert(t('friendProfile.couldNotAccept'), msg || t('common.retry'));
    } finally {
      setRequestActionLoading(false);
    }
  }, [
    currentUser?.id,
    friendUser,
    pendingBetween?.incoming,
    loadFriendStore,
    refreshFriendStats,
    refreshMyProfileStats,
  ]);

  const handleDecline = useCallback(async () => {
    if (!currentUser?.id || !pendingBetween?.incoming) {
      return;
    }
    setRequestActionLoading(true);
    try {
      await declineFriendRequest(pendingBetween.incoming.id);
      setPendingBetween({incoming: null, outgoing: null});
    } catch (e) {
      Alert.alert(t('friendProfile.couldNotDecline'), (e as Error).message || t('common.retry'));
    } finally {
      setRequestActionLoading(false);
    }
  }, [currentUser?.id, pendingBetween?.incoming]);

  const openVibeSheet = useCallback(async () => {
    if (!friendId || !friendUser) {
      return;
    }
    if (!friendLiveCheckIn) {
      Alert.alert(
        t('userProfile.couldNotSendVibe'),
        t('friendProfile.vibeRequiresActive'),
      );
      return;
    }
    setVibeHint(null);
    setVibeError(null);
    setVibeSheetVisible(true);
    try {
      const emojis = await fetchSentWorkoutVibeEmojis(
        friendId,
        friendLiveCheckIn.id,
      );
      setVibeDelivered(new Set(emojis));
    } catch {
      setVibeDelivered(new Set());
    }
  }, [friendId, friendUser, friendLiveCheckIn]);

  const closeVibeSheet = useCallback(() => {
    setVibeSheetVisible(false);
    setVibeBusy(false);
    setVibeHint(null);
    setVibeError(null);
  }, []);

  const sendVibeFromProfile = useCallback(
    async (emoji: string) => {
      if (
        !currentUser?.id ||
        !friendUser ||
        !friendLiveCheckIn ||
        vibeBusy
      ) {
        return;
      }
      if (vibeDelivered.has(emoji)) {
        setVibeHint('Du har allerede sendt den vibe');
        return;
      }
      const center =
        friendLiveCheckIn.gym_name?.trim() ||
        params.activeCenterName?.trim() ||
        'centeret';
      const workoutType = formatWorkoutTypeDisplay(
        friendLiveCheckIn.workout_type ?? 'cardio',
      );
      setVibeBusy(true);
      setVibeHint(null);
      setVibeError(null);
      try {
        const rpc = await sendWorkoutVibeRpc({
          recipientId: friendUser.id,
          emoji,
          recipientCheckInId: friendLiveCheckIn.id,
          centerName: center,
          workoutType,
          threadId: null,
          routeChat: false,
        });
        if (rpc.duplicate) {
          setVibeDelivered(prev => new Set(prev).add(emoji));
          setVibeHint('Du har allerede sendt den vibe');
          return;
        }
        if (!rpc.ok) {
          throw new Error(rpc.error || 'send_workout_vibe failed');
        }
        setVibeDelivered(prev => new Set(prev).add(emoji));
        setVibeHint('Vibe sendt');
        setTimeout(() => {
          closeVibeSheet();
        }, 700);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setVibeError(msg.length > 160 ? `${msg.slice(0, 157)}…` : msg);
      } finally {
        setVibeBusy(false);
      }
    },
    [
      currentUser?.id,
      friendUser,
      friendLiveCheckIn,
      params.activeCenterName,
      vibeBusy,
      vibeDelivered,
      closeVibeSheet,
    ],
  );

  const openChatWithFriend = useCallback(async () => {
    if (!friendUser || !currentUser?.id) {
      return;
    }
    const participantIds = [currentUser.id, friendUser.id].sort();
    const nameById: Record<string, string> = {
      [currentUser.id]: currentUser.displayName || 'Dig',
      [friendUser.id]: friendUser.displayName,
    };
    const participantNames = participantIds.map(id => nameById[id] ?? 'Ven');
    const existingChat = getChatByParticipants(participantIds);
    try {
      const threadId = await getOrCreateDmThread(friendUser.id);
      upsertChat({
        id: threadId,
        participantIds,
        participantNames,
        lastActivity: existingChat?.lastActivity ?? new Date(),
        unreadCount: existingChat?.unreadCount ?? 0,
        avatar: existingChat?.avatar,
        avatarInitials: existingChat?.avatarInitials,
      });
      navigation.navigate('Chat', {
        chatId: threadId,
        friendId: friendUser.id,
        friendName: friendUser.displayName,
        participants: [{id: friendUser.id, name: friendUser.displayName}],
      });
    } catch (e) {
      Alert.alert('Besked', (e as Error).message);
    }
  }, [
    currentUser?.displayName,
    currentUser?.id,
    friendUser,
    getChatByParticipants,
    navigation,
    upsertChat,
  ]);

  const workoutsFromCheckIns = useMemo(
    () => completedSessionsToWorkouts(completedSessions, friendId),
    [completedSessions, friendId],
  );

  const feedSessions = useMemo(
    () => completedSessions.slice(0, 10),
    [completedSessions],
  );

  const myFeedItems = useMemo(
    () =>
      feedItems.filter(
        i =>
          (friendId && i.userId === friendId) ||
          (!!friendUser && !i.userId && i.user === friendUser.displayName),
      ),
    [feedItems, friendId, friendUser],
  );

  const myFeedPostIds = useMemo(() => myFeedItems.map(item => item.id), [myFeedItems]);
  const engagement = usePostEngagement(myFeedPostIds, currentUser?.id);
  const feedReactions = engagement.reactions;
  const commentsByFeedItem = useMemo(() => {
    const out: Record<string, Array<{author: string; text: string; id: string}>> = {};
    for (const [postId, list] of Object.entries(engagement.commentsByPost)) {
      out[postId] = list.map(c => ({author: c.author, text: c.text, id: c.id}));
    }
    return out;
  }, [engagement.commentsByPost]);

  useEffect(() => {
    return subscribeWorkoutFeedRealtime();
  }, []);

  useEffect(() => {
    if (!bicepsListVisible || !bicepsListPostId) {
      return;
    }
    void (async () => {
      try {
        const users = await fetchPostBicepsUsers(bicepsListPostId);
        setBicepsListUsers(users);
      } catch {
        // ignore
      }
    })();
  }, [bicepsListVisible, bicepsListPostId, feedReactions]);

  const dataTabWorkouts = useMemo(
    () => filterWorkoutsByPeriod(workoutsFromCheckIns, dataWorkoutPeriod),
    [workoutsFromCheckIns, dataWorkoutPeriod],
  );

  const dataTabSessions = useMemo(() => {
    const ids = new Set(dataTabWorkouts.map(w => w.id));
    return completedSessions.filter(s => ids.has(s.id));
  }, [dataTabWorkouts, completedSessions]);

  const dataTabWorkoutsSummary = useMemo(() => {
    const n = dataTabWorkouts.length;
    const min = sumWorkoutMinutes(dataTabWorkouts);
    return {count: n, minutes: min};
  }, [dataTabWorkouts]);

  const theirGoals = useMemo(
    () => goals.filter(g => g.userId === friendId && !g.isCompleted),
    [goals, friendId],
  );

  const stats = useMemo(() => {
    const rows = [
      {
        key: 'checkins',
        icon: 'checkmark-circle',
        label: 'Check-ins',
        value: mergedDisplayStats?.totalCheckIns ?? 0,
      },
      {
        key: 'time',
        icon: 'time',
        label: t('friendProfile.trainingTime'),
        value: formatTotalTime(mergedDisplayStats?.totalTrainingMinutes ?? 0),
      },
      {
        key: 'friends',
        icon: 'people',
        label: 'Venner',
        value: mergedDisplayStats?.friendsCount ?? 0,
      },
      {
        key: 'groups',
        icon: 'people-circle',
        label: 'Grupper',
        value: friendJoinedGroups.length,
      },
      {
        key: 'badges',
        emoji: '🏅',
        label: 'Badges',
        value: badgeCount,
      },
    ];
    return SURFACE_GROUPS_IN_APP ? rows : rows.filter(r => r.key !== 'groups');
  }, [mergedDisplayStats, friendJoinedGroups.length, badgeCount]);

  const statsPreviewItems = useMemo(
    () => [
      {
        key: 'checkins',
        icon: 'checkmark-circle',
        label: 'Check-ins',
        value: mergedDisplayStats?.totalCheckIns ?? 0,
      },
      {
        key: 'time',
        icon: 'time',
        label: t('friendProfile.trainingTime'),
        value: formatTotalTime(mergedDisplayStats?.totalTrainingMinutes ?? 0),
      },
      {
        key: 'favtype',
        icon: 'barbell-outline',
        label: 'Foretrukken type',
        value: favoriteTypeLabel,
      },
      {
        key: 'badges',
        emoji: '🏅',
        label: 'Badges',
        value: badgeCount,
      },
    ],
    [mergedDisplayStats, favoriteTypeLabel, badgeCount],
  );

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
      await engagement.togglePostLike(itemId);
    },
    [engagement.togglePostLike],
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

  const closePostActionSheet = useCallback(() => {
    setPostActionItem(null);
  }, []);

  const handlePostDeletedSideEffects = useCallback((_postId: string) => {
    // Engagement hook reloads when post ids change
  }, []);

  const openPostActionMenu = useCallback((post: FeedItem) => {
    setPostActionItem(post);
  }, []);

  const addComment = useCallback(() => {
    if (!activeCommentItem || engagement.submittingComment) {
      return;
    }
    const text = commentInput.trim();
    if (!text) {
      return;
    }
    const author = currentUser?.displayName || t('common.you');
    void (async () => {
      const ok = await engagement.submitComment(activeCommentItem, text, author);
      if (ok) {
        setCommentInput('');
      }
    })();
  }, [activeCommentItem, commentInput, currentUser?.displayName, engagement, t]);

  const parseWorkoutInfo = useCallback((info?: string) => {
    const fallback = {gymName: 'Center', duration: '0 min', workoutType: 'fri'};
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

  const activeComments = activeCommentItem
    ? commentsByFeedItem[activeCommentItem] ?? []
    : [];

  if (!friendId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profil</Text>
          <View style={styles.topBarRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Bruger ikke fundet</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !friendUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}>
            <Icon name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profil</Text>
          <View style={styles.topBarRight} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isCurrentUser = currentUser?.id === friendUser.id;
  const dName = friendUser.displayName;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profil</Text>
        <View style={styles.topBarRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <ProfileHeader
          displayName={dName}
          username={friendUser.username}
          profileImageUrl={friendUser.profileImageUrl}
          bio={profileBio ?? undefined}
          showBio={Boolean(profileBio?.trim())}
          activeStatus={headerActiveStatus}
          primaryCenterLabel={headerPrimaryCenterLabel}
          friendsCount={mergedDisplayStats?.friendsCount ?? 0}
        />

        <View style={styles.statsPreviewWrap}>
          <Text style={styles.statsPreviewTitle}>Aktivitet</Text>
          <Card variant="outlined" padding="lg" style={styles.statsPreviewCard}>
            <View style={styles.streakBlockCompact}>
              <StreakHighlight
                currentStreak={mergedDisplayStats?.currentStreak ?? 0}
                longestStreak={mergedDisplayStats?.longestStreak ?? 0}
              />
            </View>
            <ProfileStatGrid stats={statsPreviewItems} />
          </Card>
        </View>

        <View style={styles.midProfileStack}>
          <ProfileBadgeStrip
            userId={friendUser.id}
            featuredBadgeIds={friendUser.featuredBadgeIds}
            viewingOtherUser
            otherUserDisplayName={dName}
          />

          {profileCenterRows.length > 0 ? (
            <ProfileCentersList
              sectionTitle={t('editProfile.localCentres')}
              centers={profileCenterRows}
              activeCountForId={id => getActiveUsersCount(id)}
            />
          ) : (
            <View style={styles.noCentersBox}>
              <Text style={styles.noCentersTitle}>{t('editProfile.localCentres')}</Text>
              <Text style={styles.noCentersSub}>{t('friendProfile.noPrimaryCenter')}</Text>
            </View>
          )}
        </View>

        {!isCurrentUser && !friendStatusLoading && (
          <View style={styles.friendRequestSection}>
            {pendingBetween?.incoming && !isFriend ? (
              <View style={styles.incomingRequestRow}>
                <TouchableOpacity
                  style={styles.acceptFriendBtn}
                  onPress={handleAccept}
                  disabled={requestActionLoading}
                  activeOpacity={0.85}>
                  {requestActionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Icon name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.addFriendRowText}>{t('friendProfile.accept')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineFriendBtn}
                  onPress={handleDecline}
                  disabled={requestActionLoading}
                  activeOpacity={0.85}>
                  <Text style={styles.declineFriendBtnText}>{t('friendProfile.decline')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {Boolean(pendingBetween?.outgoing) &&
            !isFriend &&
            !pendingBetween?.incoming ? (
              <>
                <View style={styles.requestSentPill}>
                  <Icon
                    name="time-outline"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.requestSentPillText}>{t('friendProfile.requestSent')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.sendVibeOutlineFull}
                  onPress={() => void openVibeSheet()}
                  activeOpacity={0.85}>
                  <Text style={styles.emojiInline}>✨</Text>
                  <Text style={styles.sendVibeOutlineText}>{t('friendProfile.sendVibe')}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {!isFriend &&
            !pendingBetween?.incoming &&
            !pendingBetween?.outgoing ? (
              <View style={styles.socialRow}>
                <TouchableOpacity
                  style={[styles.addFriendRow, styles.socialRowBtn]}
                  onPress={handleAddFriend}
                  disabled={requestActionLoading}
                  activeOpacity={0.85}>
                  {requestActionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Icon
                        name="person-add-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.addFriendRowText}>{t('userProfile.addFriend')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendVibeOutline, styles.socialRowBtn]}
                  onPress={() => void openVibeSheet()}
                  activeOpacity={0.85}>
                  <Text style={styles.emojiInline}>✨</Text>
                  <Text style={styles.sendVibeOutlineText}>{t('friendProfile.sendVibe')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {!isCurrentUser && isFriend && (
          <View style={styles.actionButtons}>
            <PurpleGradientButton
              style={styles.ctaButtonWrap}
              onPress={openChatWithFriend}>
              <Icon name="chatbubble-outline" size={20} color="#fff" />
              <Text style={styles.messageButtonText}>{t('friendProfile.writeMessage')}</Text>
            </PurpleGradientButton>
            <PurpleGradientButton
              style={styles.ctaButtonWrap}
              onPress={() =>
                navigation.navigate('InviteToWorkout', {
                  friendId: friendUser.id,
                  friendName: friendUser.displayName,
                })
              }>
              <Icon name="calendar-outline" size={20} color="#fff" />
              <Text style={styles.messageButtonText}>{t('friendProfile.inviteToWorkout')}</Text>
            </PurpleGradientButton>
          </View>
        )}

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'feed' && styles.tabBtnActive]}
            onPress={() => setTab('feed')}
            activeOpacity={0.85}>
            <Icon
              name="newspaper-outline"
              size={18}
              color={tab === 'feed' ? colors.white : colors.textSecondary}
            />
            <Text
              style={[styles.tabBtnText, tab === 'feed' && styles.tabBtnTextActive]}>
              {t('profile.feedTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'data' && styles.tabBtnActive]}
            onPress={() => setTab('data')}
            activeOpacity={0.85}>
            <Icon
              name="stats-chart-outline"
              size={18}
              color={tab === 'data' ? colors.white : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                tab === 'data' && styles.tabBtnTextActive,
              ]}>
              {t('profile.dataTab')}
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'feed' ? (
          <View style={styles.section}>
            <Text style={styles.blockTitle}>{t('friendProfile.workouts')}</Text>
            <Text style={styles.blockSubtitle}>{t('friendProfile.workoutHistorySub')}</Text>
            <Card variant="outlined" padding="md">
              {sessionsLoading && completedSessions.length === 0 ? (
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
                  <Text style={styles.emptyTitle}>{t('profile.noWorkoutsYet')}</Text>
                  <Text style={styles.emptySubtext}>{t('friendProfile.completedCheckInsHint')}</Text>
                </View>
              )}
            </Card>

            <Text style={[styles.blockTitle, styles.blockTitleSpaced]}>
              {t('profile.postsAndShared')}
            </Text>
            <Text style={styles.blockSubtitle}>
              {t('friendProfile.feedPostsSub', {name: dName})}
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
                      onMenuPress={() => openPostActionMenu(post)}
                    />
                  );
                })
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="images-outline" size={36} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>{t('profile.noPosts')}</Text>
                  <Text style={styles.emptySubtext}>{t('friendProfile.shareAfterSession')}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.statistics')}</Text>
            <View style={styles.streakBlock}>
              <StreakHighlight
                currentStreak={mergedDisplayStats?.currentStreak ?? 0}
                longestStreak={mergedDisplayStats?.longestStreak ?? 0}
              />
            </View>
            <Card variant="outlined" padding="lg" style={styles.statsCard}>
              <ProfileStatGrid stats={stats} />
            </Card>

            <Text style={styles.recentWorkoutsHeading}>{t('profile.recentWorkouts')}</Text>
            <Text style={styles.recentWorkoutsSub}>
              {dataTabWorkoutsSummary.count === 0
                ? t('profile.noneInPeriod')
                : `${t('profile.workoutCount', {count: dataTabWorkoutsSummary.count})} · ${formatTotalTime(dataTabWorkoutsSummary.minutes)}`}
            </Text>
            <View style={styles.periodChips}>
              {dataPeriodOptions.map(({key, label}) => {
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
            <Card variant="outlined" padding="md">
              {sessionsLoading && completedSessions.length === 0 ? (
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
                  <Text style={styles.emptyTitle}>{t('profile.noWorkoutsHere')}</Text>
                  <Text style={styles.emptySubtext}>{t('profile.noWorkoutsSub')}</Text>
                </View>
              )}
            </Card>

            <Text style={styles.goalsHeading}>{t('profile.goals')}</Text>
            <Card variant="outlined" padding="md">
              {theirGoals.length === 0 ? (
                <Text style={styles.goalsEmpty}>
                  {t('friendProfile.noGoalsFor', {name: dName})}
                </Text>
              ) : (
                theirGoals.map(goal => (
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
            </Card>
          </View>
        )}

        {!isCurrentUser && !friendStatusLoading && isFriend && (
          <View style={styles.removeFriendFooter}>
            <TouchableOpacity
              style={styles.removeFriendButton}
              onPress={handleRemoveFriend}
              activeOpacity={0.8}>
              <Icon name="person-remove-outline" size={20} color={colors.error} />
              <Text style={styles.removeFriendButtonText}>Fjern ven</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <Modal
        visible={vibeSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeVibeSheet}>
        <TouchableWithoutFeedback onPress={closeVibeSheet}>
          <View style={styles.bottomSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.vibeSheet}>
                <View style={styles.commentHandle} />
                <View style={styles.bottomSheetHeader}>
                  <Text style={styles.modalTitle}>Send vibe til {dName}</Text>
                  <TouchableOpacity
                    onPress={closeVibeSheet}
                    style={styles.commentCloseButton}>
                    <Icon name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
                {friendLiveCheckIn?.gym_name ? (
                  <Text style={styles.vibeSheetSub} numberOfLines={2}>
                    {friendLiveCheckIn.gym_name.trim()} ·{' '}
                    {formatWorkoutTypeDisplay(
                      friendLiveCheckIn.workout_type ?? 'cardio',
                    )}
                  </Text>
                ) : null}
                <View style={styles.vibeEmojiRow}>
                  {NON_FRIEND_VIBE_OPTIONS.map(({emoji, label}) => {
                    const sent = vibeDelivered.has(emoji);
                    return (
                      <Pressable
                        key={emoji}
                        style={({pressed}) => [
                          styles.vibeEmojiChip,
                          sent && styles.vibeEmojiChipSent,
                          pressed && styles.vibeEmojiChipPressed,
                        ]}
                        onPress={() => void sendVibeFromProfile(emoji)}
                        disabled={vibeBusy || sent}>
                        <Text style={styles.vibeEmojiLarge}>{emoji}</Text>
                        <Text style={styles.vibeEmojiLabel}>{label}</Text>
                        {sent ? (
                          <View style={styles.vibeSentDot}>
                            <Icon name="checkmark" size={10} color="#fff" />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                {vibeBusy ? (
                  <ActivityIndicator
                    style={styles.vibeBusy}
                    color={colors.primary}
                  />
                ) : null}
                {vibeHint ? (
                  <Text style={styles.vibeHint}>{vibeHint}</Text>
                ) : null}
                {vibeError ? (
                  <Text style={styles.vibeErrorText}>{vibeError}</Text>
                ) : null}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
      <PostActionBottomSheet
        visible={!!postActionItem}
        onClose={closePostActionSheet}
        post={postActionItem ? feedItemToPostActionSheet(postActionItem) : null}
        currentUserId={currentUser?.id}
        variant="workoutPost"
        onPostDeleted={handlePostDeletedSideEffects}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  topBarRight: {
    width: 32,
  },
  scroll: {flex: 1},
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  midProfileStack: {
    gap: spacing.xl,
    marginBottom: spacing.xxl,
  },
  noCentersBox: {
    marginHorizontal: spacing.lg,
    marginBottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  noCentersTitle: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  noCentersSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statsPreviewWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  statsPreviewTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  statsPreviewCard: {
    marginBottom: 0,
  },
  streakBlockCompact: {
    marginBottom: spacing.md,
  },
  socialRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  socialRowBtn: {
    flex: 1,
    minWidth: 0,
  },
  sendVibeOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
  },
  sendVibeOutlineFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  sendVibeOutlineText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  emojiInline: {
    fontSize: 18,
  },
  vibeSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl,
  },
  vibeSheetSub: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  vibeEmojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  vibeEmojiChip: {
    position: 'relative',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 92,
  },
  vibeEmojiChipSent: {
    opacity: 0.55,
  },
  vibeEmojiChipPressed: {
    opacity: 0.85,
  },
  vibeEmojiLarge: {
    fontSize: 36,
    lineHeight: 42,
  },
  vibeEmojiLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  vibeSentDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeBusy: {
    marginVertical: spacing.sm,
  },
  vibeHint: {
    ...typography.caption,
    color: colors.primary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  vibeErrorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  friendRequestSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  incomingRequestRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  addFriendRowText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  acceptFriendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  declineFriendBtn: {
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  declineFriendBtnText: {
    fontWeight: '600',
    color: colors.text,
  },
  requestSentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestSentPillText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  ctaButtonWrap: {
    flex: 1,
  },
  removeFriendFooter: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    marginTop: spacing.md,
  },
  removeFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
    gap: 8,
  },
  removeFriendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  messageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
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
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    padding: 5,
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 92, 246, 0.08)',
    ...shadows.sm,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
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
  streakBlock: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  statsCard: {
    marginTop: 0,
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
});

export default FriendProfileScreen;
