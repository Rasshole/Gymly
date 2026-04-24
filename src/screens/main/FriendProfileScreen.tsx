/**
 * Friend Profile – som egen profil: data, centre, feed/data, uden redigering
 */

import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useNavigation, useRoute, useFocusEffect} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useChatStore} from '@/store/chatStore';
import {useWorkoutStore} from '@/store/workoutStore';
import {useFeedStore} from '@/store/feedStore';
import {useGoalStore} from '@/store/goalStore';
import {useBadgeStore} from '@/store/badgeStore';
import {supabase} from '@/services/supabase/supabaseClient';
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
import danishGyms from '@/data/danishGyms';
import {
  ProfileHeader,
  ProfileCentersList,
  ProfileStatGrid,
  StreakHighlight,
  ProfileBadgeStrip,
} from '@/components/profile';
import {Card} from '@/components/ui/Card';
import type {FeedItem} from '@/store/feedStore';
import type {Workout} from '@/types/workout.types';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {
  filterWorkoutsByPeriod,
  sumWorkoutMinutes,
  type WorkoutPeriod,
} from '@/utils/workoutPeriodFilter';
import {useProfileStats, useWeeklyStats} from '@/hooks/useProfileData';
import {useJoinedGroups} from '@/hooks/useGroupData';
import colors from '@/theme/colors';
import {spacing, typography, radius} from '@/theme/designTokens';
import type {ProfileCenterRow} from '@/components/profile/ProfileCentersList';

type FriendProfileRouteParams = {
  friendId?: string;
  userId?: string;
  friendName?: string;
  mutualFriends?: number;
  gyms?: string[];
  friendAvatarUrl?: string;
};

type FriendProfileUser = {
  id: string;
  displayName: string;
  username: string;
  profileImageUrl: string | null;
  favoriteGymIds: string[];
};

type ProfileTab = 'feed' | 'data';

const DATA_PERIOD_OPTIONS: {key: WorkoutPeriod; label: string}[] = [
  {key: 'week', label: 'Uge'},
  {key: 'month', label: 'Måned'},
  {key: 'year', label: 'År'},
  {key: 'all', label: 'I alt'},
];

const formatTotalTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} timer` : `${h}t ${m}m`;
};

const formatWorkoutDate = (d: Date) =>
  d.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

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
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const params = (route.params as FriendProfileRouteParams) || {};
  const friendId = params.friendId ?? params.userId ?? '';
  const {user: currentUser} = useAppStore();
  const {getChatByParticipants, upsertChat} = useChatStore();
  const feedItems = useFeedStore(s => s.feedItems);
  const workouts = useWorkoutStore(s => s.workouts);
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
  const loadFriendStore = useFriendStore(s => s.load);
  const removeFriendFromStore = useFriendStore(s => s.removeFriend);

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

      if (error || !data) {
        setFriendUser({
          id: friendId,
          displayName: params.friendName?.trim() || 'Ven',
          username: 'bruger',
          profileImageUrl: params.friendAvatarUrl ?? null,
          favoriteGymIds: [],
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
        });
      }
    } catch {
      setFriendUser({
        id: friendId,
        displayName: params.friendName?.trim() || 'Ven',
        username: 'bruger',
        profileImageUrl: params.friendAvatarUrl ?? null,
        favoriteGymIds: [],
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

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
      void refreshFriendStats();
      void refreshFriendWeekly();
      void loadFriendStatus();
    }, [
      loadProfile,
      loadFriendStatus,
      refreshFriendStats,
      refreshFriendWeekly,
    ]),
  );

  const centerRows = useMemo((): ProfileCenterRow[] => {
    const fromIds = (friendUser?.favoriteGymIds ?? [])
      .slice(0, 3)
      .map(id => danishGyms.find(g => g.id === id))
      .filter(Boolean)
      .map(g => ({name: g!.name, city: g!.city, brand: g!.brand}));
    if (fromIds.length > 0) {
      return fromIds;
    }
    return centersFromGymNameStrings(params.gyms ?? []);
  }, [friendUser?.favoriteGymIds, params.gyms]);

  const handleRemoveFriend = useCallback(() => {
    if (!currentUser?.id || !friendUser) {
      return;
    }
    Alert.alert(
      'Fjern ven',
      'Er du sikker på, at du vil fjerne denne ven?',
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Fjern',
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
                'Kunne ikke fjerne ven',
                (e as Error).message || 'Prøv igen',
              );
            }
          },
        },
      ],
    );
  }, [currentUser?.id, friendUser, navigation, refreshMyProfileStats, removeFriendFromStore]);

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
      Alert.alert('Kunne ikke sende', (e as Error).message || 'Prøv igen.');
    } finally {
      setRequestActionLoading(false);
    }
  }, [currentUser?.id, friendUser]);

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
      Alert.alert('Kunne ikke acceptere', msg || 'Prøv igen.');
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
      Alert.alert('Kunne ikke afvise', (e as Error).message || 'Prøv igen.');
    } finally {
      setRequestActionLoading(false);
    }
  }, [currentUser?.id, pendingBetween?.incoming]);

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

  const userWorkouts = useMemo(
    () => workouts.filter(w => w.userId === friendId),
    [workouts, friendId],
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

  const dataTabWorkouts = useMemo(
    () => filterWorkoutsByPeriod(userWorkouts, dataWorkoutPeriod),
    [userWorkouts, dataWorkoutPeriod],
  );

  const dataTabWorkoutsSummary = useMemo(() => {
    const n = dataTabWorkouts.length;
    const min = sumWorkoutMinutes(dataTabWorkouts);
    return {count: n, minutes: min};
  }, [dataTabWorkouts]);

  const theirGoals = useMemo(
    () => goals.filter(g => g.userId === friendId && !g.isCompleted),
    [goals, friendId],
  );

  const stats = useMemo(
    () => [
      {
        key: 'checkins',
        icon: 'checkmark-circle',
        label: 'Check-ins',
        value: friendStats?.totalCheckIns ?? 0,
      },
      {
        key: 'time',
        icon: 'time',
        label: 'Træningstid',
        value: formatTotalTime(friendStats?.totalTrainingMinutes ?? 0),
      },
      {
        key: 'friends',
        icon: 'people',
        label: 'Venner',
        value: friendStats?.friendsCount ?? 0,
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
    ],
    [friendStats, friendJoinedGroups.length, badgeCount],
  );

  const renderWorkoutHistoryRow = (w: Workout, isLast?: boolean) => (
    <View
      key={w.id}
      style={[styles.workoutHistoryRow, isLast && styles.workoutHistoryRowLast]}>
      <View style={styles.workoutHistoryIcon}>
        <Icon name="barbell-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.workoutHistoryBody}>
        <Text style={styles.workoutHistoryTitle} numberOfLines={1}>
          {w.gymName || 'Træning'}
        </Text>
        <Text style={styles.workoutHistoryMeta} numberOfLines={1}>
          {formatWorkoutTypeDisplay(w.workoutType)} · {w.duration} min
        </Text>
        <Text style={styles.workoutHistoryTime}>
          {formatWorkoutDate(new Date(w.startTime))}
        </Text>
      </View>
    </View>
  );

  const renderFeedRow = (post: FeedItem, variant: 'workout' | 'pr') => (
    <View key={post.id} style={styles.feedPreviewRow}>
      {post.photoUri ? (
        <Image source={{uri: post.photoUri}} style={styles.feedPreviewThumb} />
      ) : (
        <View style={styles.feedPreviewThumbPlaceholder}>
          <Icon
            name={variant === 'pr' ? 'trophy-outline' : 'images-outline'}
            size={20}
            color={colors.primary}
          />
        </View>
      )}
      <View style={styles.feedPreviewBody}>
        <Text style={styles.feedPreviewMeta} numberOfLines={1}>
          {variant === 'pr'
            ? post.prInfo || post.workoutInfo || 'PR'
            : post.workoutInfo || 'Opslag'}
        </Text>
        {(post.description?.trim()?.length ?? 0) > 0 ? (
          <Text style={styles.feedPreviewCaption} numberOfLines={3}>
            {post.description}
          </Text>
        ) : null}
        <Text style={styles.feedPreviewTime}>{post.timestamp}</Text>
      </View>
    </View>
  );

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
          showBio={false}
          followersCount={friendStats?.followersCount ?? 0}
          followingCount={friendStats?.followingCount ?? 0}
          friendsCount={friendStats?.friendsCount ?? 0}
        />

        <ProfileBadgeStrip
          userId={friendUser.id}
          viewingOtherUser
          otherUserDisplayName={dName}
        />

        {centerRows.length > 0 ? (
          <ProfileCentersList
            sectionTitle="Lokale centre"
            centers={centerRows}
          />
        ) : (
          <View style={styles.noCentersBox}>
            <Text style={styles.noCentersTitle}>Lokale centre</Text>
            <Text style={styles.noCentersSub}>
              {dName} har ikke tilføjet centre endnu
            </Text>
          </View>
        )}

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
                      <Text style={styles.addFriendRowText}>Accepter</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineFriendBtn}
                  onPress={handleDecline}
                  disabled={requestActionLoading}
                  activeOpacity={0.85}>
                  <Text style={styles.declineFriendBtnText}>Afvis</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {Boolean(pendingBetween?.outgoing) &&
            !isFriend &&
            !pendingBetween?.incoming ? (
              <View style={styles.requestSentPill}>
                <Icon
                  name="time-outline"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.requestSentPillText}>Anmodning sendt</Text>
              </View>
            ) : null}
            {!isFriend &&
            !pendingBetween?.incoming &&
            !pendingBetween?.outgoing ? (
              <TouchableOpacity
                style={styles.addFriendRow}
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
                    <Text style={styles.addFriendRowText}>Tilføj ven</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {!isCurrentUser && isFriend && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.messageButton}
              onPress={openChatWithFriend}
              activeOpacity={0.8}>
              <Icon name="chatbubble-outline" size={20} color="#fff" />
              <Text style={styles.messageButtonText}>Skriv besked</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() =>
                navigation.navigate('InviteToWorkout', {
                  friendId: friendUser.id,
                  friendName: friendUser.displayName,
                })
              }
              activeOpacity={0.8}>
              <Icon name="fitness-outline" size={20} color="#fff" />
              <Text style={styles.messageButtonText}>Inviter til træning</Text>
            </TouchableOpacity>
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
              Feed
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
              Data
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'feed' ? (
          <View style={styles.section}>
            <Text style={styles.blockTitle}>Træninger</Text>
            <Text style={styles.blockSubtitle}>Historik fra sessioner</Text>
            <Card variant="outlined" padding="md">
              {userWorkouts.length > 0 ? (
                userWorkouts.map((w, i) =>
                  renderWorkoutHistoryRow(w, i === userWorkouts.length - 1),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="fitness-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen træninger endnu</Text>
                  <Text style={styles.emptySubtext}>
                    Synlige sessioner vises her, når de findes
                  </Text>
                </View>
              )}
            </Card>

            <Text style={[styles.blockTitle, styles.blockTitleSpaced]}>
              Opslag &amp; delte træninger
            </Text>
            <Text style={styles.blockSubtitle}>
              Billeder, PR&apos;s og feed fra {dName}
            </Text>
            <Card variant="outlined" padding="lg">
              {myFeedItems.length > 0 ? (
                myFeedItems.map(post =>
                  renderFeedRow(post, isPrItem(post) ? 'pr' : 'workout'),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="images-outline" size={36} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen opslag endnu</Text>
                  <Text style={styles.emptySubtext}>
                    {dName} har ikke delt noget endnu
                  </Text>
                </View>
              )}
            </Card>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistik</Text>
            <View style={styles.streakBlock}>
              <StreakHighlight
                currentStreak={friendStats?.currentStreak ?? 0}
                longestStreak={friendStats?.longestStreak ?? 0}
              />
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
            <Card variant="outlined" padding="md">
              {dataTabWorkouts.length > 0 ? (
                dataTabWorkouts.map((w, i) =>
                  renderWorkoutHistoryRow(w, i === dataTabWorkouts.length - 1),
                )
              ) : (
                <View style={styles.emptyInline}>
                  <Icon name="calendar-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>Ingen træninger her</Text>
                  <Text style={styles.emptySubtext}>
                    Vælg en anden periode, eller når data findes, vises det her
                  </Text>
                </View>
              )}
            </Card>

            <Text style={styles.goalsHeading}>Mål</Text>
            <Card variant="outlined" padding="md">
              {theirGoals.length === 0 ? (
                <Text style={styles.goalsEmpty}>
                  Ingen aktive mål for {dName}
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
  noCentersBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    gap: 12,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  inviteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryDark,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
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
    marginBottom: spacing.lg,
    gap: spacing.sm,
    padding: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    marginTop: 2,
  },
  workoutHistoryTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  feedPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  feedPreviewThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  feedPreviewThumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedPreviewBody: {flex: 1, minWidth: 0},
  feedPreviewMeta: {
    ...typography.small,
    fontWeight: '600',
    color: colors.text,
  },
  feedPreviewCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  feedPreviewTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
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
