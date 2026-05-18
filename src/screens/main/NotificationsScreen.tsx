/**
 * Notifikationer – Supabase public.notifications + lokale (workout, besked)
 */

import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {CommonActions, useNavigation} from '@react-navigation/native';
import {useInAppNotifications} from '@/hooks/useInAppNotifications';
import {useNotificationStore} from '@/store/notificationStore';
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import NotificationService from '@/services/notifications/NotificationService';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';
import {
  getPublicProfilesByIds,
  acceptFriendRequest,
  declineFriendRequest,
} from '@/services/supabase/friendService';
import {deleteInAppNotificationById} from '@/services/notifications/inAppNotificationService';
import {
  fetchPlannedWorkoutById,
  loadWorkoutPlanEntriesForUser,
  respondPlannedWorkoutInvite,
  type PlannedParticipantRow,
  type PlannedWorkoutRow,
} from '@/services/supabase/plannedWorkoutService';
import {findGymById} from '@/utils/gymDisplay';
import PlannedSessionInviteDetailModal, {
  type PlannedInviteParticipantLine,
} from '@/components/notifications/PlannedSessionInviteDetailModal';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';
import type {Notification} from '@/types/notification.types';
import Avatar from '@/components/ui/Avatar';
import type {PublicProfile} from '@/services/supabase/friendService';
import {
  getSupabaseRpcErrorMessage,
  isFriendRequestNotRecipientError,
  isFriendRequestStaleError,
} from '@/utils/friendRequestRpcErrors';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useFriendStore} from '@/store/friendStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import {sendWorkoutBicepsReaction} from '@/services/supabase/workoutReactionService';
import {
  MUSCLE_GROUP_LABELS_DK,
  normalizeLegacyMuscleKey,
} from '@/utils/muscleGroupLabels';
import type {MuscleGroup} from '@/types/workout.types';
import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import type {BadgeDefinition} from '@/types/badge.types';

const BICEPS_SENT_STORAGE = (userId: string) => `@gymly/biceps_sent_v1_${userId}`;
const FRIEND_CHECKIN_GROUP_THRESHOLD = 4;
const FRIEND_CHECKIN_GROUP_WINDOW_MS = 5 * 60 * 1000;

function bicepsReactionKey(checkInId: string, friendUserId: string): string {
  return `${checkInId}:${friendUserId}`;
}

function labelForMuscleToken(raw: string): string {
  const k = normalizeLegacyMuscleKey(raw.trim());
  if (k && k in MUSCLE_GROUP_LABELS_DK) {
    return MUSCLE_GROUP_LABELS_DK[k as MuscleGroup];
  }
  const u = raw.trim();
  return u || 'Træning';
}

function friendCheckinTrainingLabel(item: Notification): string {
  const fromRow = item.muscles?.filter(m => m && String(m).trim().length > 0) ?? [];
  if (fromRow.length > 0) {
    return fromRow.map(m => labelForMuscleToken(String(m))).join(' · ');
  }
  const bodyLine = item.message || '';
  const trainerIdx = bodyLine.search(/Træner:\s*/i);
  if (trainerIdx >= 0) {
    const part = bodyLine.slice(trainerIdx).replace(/Træner:\s*/i, '').trim();
    if (part) {
      return part
        .split(',')
        .map(s => labelForMuscleToken(s))
        .join(' · ');
    }
  }
  return 'Træning';
}

function friendCheckinLocationTrainingLine(item: Notification): string {
  const center = (item.gymName || (item.dataPayload?.centerName as string) || '').trim();
  const train = friendCheckinTrainingLabel(item);
  if (center && train) {
    return `${center} · ${train}`;
  }
  return center || train || '';
}

function friendCheckinCardTitle(item: Notification): string {
  const name = (item.friendName || item.title || 'En ven').trim();
  const center = (item.gymName || (item.dataPayload?.centerName as string) || '').trim();
  if (center) {
    return `${name} tjekkede ind i ${center}`;
  }
  return `${name} er aktiv nu`;
}

function resolveBadgeDefinition(item: Notification): BadgeDefinition | undefined {
  const id = item.badgeId || (item.dataPayload?.badgeId as string | undefined);
  if (!id) {
    return undefined;
  }
  return BADGE_BY_ID[id];
}

function badgeUnlockDisplayName(item: Notification, def?: BadgeDefinition): string {
  return def?.name || item.badgeName || (item.dataPayload?.badgeName as string) || 'Badge';
}

function friendCheckinMetaLine(item: Notification): string {
  const startedRaw = item.dataPayload?.startedAt as string | undefined;
  if (startedRaw) {
    const start = new Date(startedRaw);
    if (!Number.isNaN(start.getTime())) {
      const mins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
      return `${mins} min i gang`;
    }
  }
  return formatRelativeTime(item.timestamp);
}

function friendRequestRowIcon(item: Notification): string {
  if (item.type === 'friend_request' && item.friendRequestUiState === 'accepted') {
    return 'checkmark-circle';
  }
  if (item.type === 'friend_request' && item.friendRequestUiState === 'declined') {
    return 'close-circle-outline';
  }
  return 'person-add';
}

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'friend_checkin':
      return 'location';
    case 'friend_request':
    case 'friend_request_accepted':
      return 'person-add';
    case 'workout_invite':
      return 'fitness';
    case 'invite_response':
      return 'checkmark-done';
    case 'message':
      return 'chatbubble';
    case 'streak_milestone':
      return 'flame';
    case 'group_invite':
      return 'people';
    case 'leaderboard_movement':
      return 'trophy';
    case 'badge_unlocked':
    case 'badge_progress':
      return 'medal';
    case 'planned_workout_invite':
    case 'planned_workout_accepted':
    case 'planned_workout_declined':
    case 'planned_workout_reminder':
      return 'calendar';
    case 'workout_reaction':
    case 'biceps_reaction':
      return 'fitness-outline';
    default:
      return 'notifications';
  }
};

const getNotificationIconColor = (type: Notification['type'], read: boolean) => {
  if (read) {
    return colors.textMuted;
  }
  switch (type) {
    case 'friend_checkin':
      return colors.success;
    case 'streak_milestone':
      return colors.warning;
    case 'badge_unlocked':
    case 'badge_progress':
      return colors.rankGold;
    case 'leaderboard_movement':
      return colors.primary;
    default:
      return colors.primary;
  }
};

const logNotif = (msg: string, extra?: unknown) => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[Notifications] ${msg}`, extra ?? '');
  }
};

type BoundaryState = {hasError: boolean; message?: string};

class NotificationsErrorBoundary extends React.Component<
  React.PropsWithChildren<object>,
  BoundaryState
> {
  state: BoundaryState = {hasError: false};

  static getDerivedStateFromError(err: Error): BoundaryState {
    return {hasError: true, message: err?.message};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[Notifications] render error', error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Notifikationer</Text>
            <Text style={styles.headerSubtitle}>
              Noget gik galt ved indlæsning. Prøv at åbne skærmen igen.
            </Text>
          </View>
          <EmptyState
            icon="alert-circle-outline"
            title="Kunne ikke vise notifikationer"
            message={this.state.message || 'Ukendt fejl'}
            actionLabel="Prøv igen"
            onAction={() => this.setState({hasError: false, message: undefined})}
          />
        </View>
      );
    }
    return this.props.children;
  }
}

function resolvePlannedWorkoutIdFromNotification(item: Notification): string | undefined {
  const d = item.dataPayload;
  const raw =
    item.plannedWorkoutId ||
    item.planId ||
    (d?.plannedWorkoutId as string | undefined) ||
    (d?.planned_workout_id as string | undefined);
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.length > 0 ? s : undefined;
}

const NotificationsScreenInner = () => {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();
  const {listForUi, refetch, markRead, markAllRead: markAllInApp} =
    useInAppNotifications();
  const {
    markAsRead: markLocalRead,
    markAllAsRead: markAllLocal,
    removeNotification,
    markInviteJoined,
  } = useNotificationStore();
  const {getPendingInvitations} = useWorkoutInvitationStore();
  const {acceptPlanInvite} = useWorkoutPlanStore();
  const mergePlannedFromServer = useWorkoutPlanStore(s => s.mergePlannedFromServer);
  const setFriendRequestOutcome = useInAppNotificationStore(
    s => s.setFriendRequestOutcome,
  );
  const clearFriendRequestOutcome = useInAppNotificationStore(
    s => s.clearFriendRequestOutcome,
  );
  const frOutcomeKeys = useInAppNotificationStore(s =>
    Object.keys(s.friendRequestOutcomes).join(),
  );
  const removeInAppRowById = useInAppNotificationStore(s => s.removeInAppRowById);
  const loadFriendStore = useFriendStore(s => s.load);

  const pendingInvitations = user ? getPendingInvitations(user.id) : [];
  const [friendReqBusyId, setFriendReqBusyId] = useState<string | null>(null);
  const [bicepsBusyKey, setBicepsBusyKey] = useState<string | null>(null);
  const [bicepsSentKeys, setBicepsSentKeys] = useState<Record<string, true>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [profileById, setProfileById] = useState<Record<string, PublicProfile>>(
    {},
  );

  const [plannedInviteModalNotif, setPlannedInviteModalNotif] =
    useState<Notification | null>(null);
  const [plannedInviteDetail, setPlannedInviteDetail] = useState<{
    workout: PlannedWorkoutRow;
    participants: PlannedParticipantRow[];
  } | null>(null);
  const [plannedInviteDetailLoading, setPlannedInviteDetailLoading] = useState(false);

  useEffect(() => {
    logNotif('screen mounted');
  }, []);

  const groupedNotifications = useMemo(() => {
    try {
      const unreadFriendCheckins = listForUi.filter(
        n => n.type === 'friend_checkin' && !n.read,
      );
      if (unreadFriendCheckins.length < FRIEND_CHECKIN_GROUP_THRESHOLD) {
        return listForUi;
      }

      const newestTs = unreadFriendCheckins[0]?.timestamp?.getTime?.() ?? 0;
      if (!newestTs) {
        return listForUi;
      }

      // Grouping should be rare: only when many check-ins happen almost simultaneously.
      const clustered = unreadFriendCheckins.filter(n => {
        const ts = n.timestamp?.getTime?.() ?? 0;
        return ts > 0 && newestTs - ts <= FRIEND_CHECKIN_GROUP_WINDOW_MS;
      });
      if (clustered.length < FRIEND_CHECKIN_GROUP_THRESHOLD) {
        return listForUi;
      }

      // Remove only clustered rows from base list to avoid duplicate keys in FlatList.
      const keepIds = new Set(clustered.map(n => n.id));
      const first = clustered[0];
      if (!first?.id) {
        return listForUi;
      }
      const groupedFirst: Notification = {
        ...first,
        title: `${clustered.length} venner er aktive lige nu`,
        message: clustered
          .slice(0, 3)
          .map(n => n.friendName || 'Ven')
          .join(', '),
        dataPayload: {
          ...(first.dataPayload ?? {}),
          groupedFriendCheckins: true,
          groupedFriendCheckinsCount: clustered.length,
        },
      };
      return [groupedFirst, ...listForUi.filter(n => !keepIds.has(n.id))];
    } catch (e) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Notifications] groupedNotifications fallback', e);
      }
      return listForUi;
    }
  }, [listForUi]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const n of listForUi) {
      if (n.friendId) {
        ids.add(n.friendId);
      }
    }
    if (ids.size === 0) {
      return;
    }
    void getPublicProfilesByIds([...ids])
      .then(m => {
        const o: Record<string, PublicProfile> = {};
        m.forEach((p, k) => {
          o[k] = p;
        });
        setProfileById(prev => ({...prev, ...o}));
      })
      .catch(err => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[Notifications] getPublicProfilesByIds failed', err);
        }
      });
  }, [listForUi]);

  useEffect(() => {
    if (!plannedInviteModalNotif) {
      setPlannedInviteDetail(null);
      setPlannedInviteDetailLoading(false);
      return;
    }
    const pid =
      plannedInviteModalNotif.plannedWorkoutId || plannedInviteModalNotif.planId;
    if (!pid) {
      setPlannedInviteDetail(null);
      return;
    }
    let cancelled = false;
    setPlannedInviteDetailLoading(true);
    setPlannedInviteDetail(null);
    fetchPlannedWorkoutById(pid)
      .then(async d => {
        if (cancelled) {
          return;
        }
        setPlannedInviteDetail(d);
        if (d?.participants?.length) {
          try {
            const ids = d.participants.map(p => p.user_id);
            const m = await getPublicProfilesByIds(ids);
            if (cancelled) {
              return;
            }
            setProfileById(prev => {
              const next = {...prev};
              m.forEach((p, k) => {
                next[k] = p;
              });
              return next;
            });
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlannedInviteDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPlannedInviteDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plannedInviteModalNotif]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    AsyncStorage.getItem(BICEPS_SENT_STORAGE(user.id))
      .then(raw => {
        if (!raw) {
          return;
        }
        try {
          const o = JSON.parse(raw) as Record<string, true>;
          setBicepsSentKeys(o);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [user?.id]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const readOne = (item: Notification) => {
    if (item.isFromServer) {
      void markRead(item.id);
    } else {
      markLocalRead(item.id);
    }
  };

  const onMarkAll = () => {
    void markAllInApp();
    markAllLocal();
  };

  const handleDismissNotification = (item: Notification) => {
    if (!user?.id) {
      return;
    }
    if (!item.isFromServer) {
      removeNotification(item.id);
      return;
    }
    const id = item.id;
    removeInAppRowById(id);
    void (async () => {
      try {
        await deleteInAppNotificationById(id, user.id);
      } catch {
        await refetch();
        Alert.alert('Kunne ikke slette notifikationen', 'Prøv igen.');
      }
    })();
  };

  const goFriendProfile = (id: string, name: string) => {
    if (!id) {
      return;
    }
    const p = profileById[id];
    navigateToFriendProfile(navigation, {
      friendId: id,
      friendName: p?.displayName || name,
      mutualFriends: 0,
      friendAvatarUrl: p?.avatarUrl ?? undefined,
      gyms: [],
    });
  };

  const handleOpenFromNotification = (item: Notification) => {
    readOne(item);
    const d = item.dataPayload;
    if (item.type === 'message' && item.chatId) {
      navigation.navigate('Chat', {
        chatId: item.chatId,
        friendId: item.friendId || '',
        friendName: item.friendName || 'Ven',
        participants:
          item.friendId && item.friendName
            ? [{id: item.friendId, name: item.friendName}]
            : undefined,
      });
      return;
    }
    if (item.type === 'workout_reaction') {
      const threadId =
        item.threadId ||
        item.chatId ||
        (d?.threadId as string | undefined) ||
        (d?.conversationId as string | undefined) ||
        (d?.conversation_id as string | undefined);
      if (threadId) {
        const friendId =
          item.friendId ||
          (d?.fromUserId as string | undefined) ||
          (d?.senderId as string | undefined);
        navigation.navigate('Chat', {
          chatId: threadId,
          friendId: friendId || '',
          friendName: item.friendName || item.title || 'Besked',
          participants:
            friendId && (item.friendName || item.title)
              ? [{id: friendId, name: item.friendName || item.title}]
              : undefined,
        });
        return;
      }
      const id = item.friendId || (d?.fromUserId as string);
      if (id) {
        goFriendProfile(id, item.friendName || item.title);
      }
      return;
    }
    if (item.type === 'biceps_reaction') {
      navigation.navigate('Home');
      return;
    }
    if (item.type === 'friend_checkin' || item.type === 'friend_request_accepted') {
      if (item.dataPayload?.groupedFriendCheckins) {
        navigation.navigate('Friends', {screen: 'Venner'} as never);
        return;
      }
      const id = (d?.friendUserId as string) || item.friendId || (d?.targetUserId as string);
      if (id) {
        goFriendProfile(id, item.friendName || item.title);
      }
      return;
    }
    if (item.type === 'friend_request') {
      const id = (d?.targetUserId as string) || item.friendId;
      if (id) {
        goFriendProfile(id, item.friendName || 'Ven');
      }
      return;
    }
    if (
      item.type === 'badge_unlocked' ||
      item.type === 'streak_milestone' ||
      item.type === 'badge_progress'
    ) {
      const bid =
        item.badgeId || (d?.badgeId as string | undefined);
      navigation.navigate('Badges', bid ? {highlightBadgeId: bid} : {});
      return;
    }
    if (item.type === 'workout_invite' && item.planId) {
      const pid = resolvePlannedWorkoutIdFromNotification(item);
      navigation.navigate('WorkoutSchedule', {
        initialTab: 'upcoming',
        ...(pid ? {openPlannedId: pid} : {}),
      });
      return;
    }
    if (
      item.type === 'planned_workout_invite' ||
      item.type === 'planned_workout_accepted' ||
      item.type === 'planned_workout_declined' ||
      item.type === 'planned_workout_reminder'
    ) {
      const pid = resolvePlannedWorkoutIdFromNotification(item);
      navigation.navigate('WorkoutSchedule', {
        initialTab: 'upcoming',
        ...(pid ? {openPlannedId: pid} : {}),
      });
      return;
    }
  };

  const handleJoinWorkout = (notification: Notification) => {
    if (notification.type !== 'workout_invite') {
      return;
    }
    const joinerName = user?.displayName || 'En ven';
    if (notification.joined) {
      markInviteJoined(notification.id);
    } else {
      markInviteJoined(notification.id);
      if (notification.planId && user) {
        acceptPlanInvite(notification.planId, user.id);
      }
      if (notification.friendName) {
        NotificationService.notifyInviteAccepted(
          notification.friendName,
          joinerName,
          notification.gymName || 'dit center',
        );
      }
      if (notification.planId) {
        navigation.navigate('WorkoutSchedule', {
          initialTab: 'upcoming',
          openPlannedId: notification.planId,
        });
      }
    }
  };

  const markBicepsSentPersist = (key: string) => {
    setBicepsSentKeys(prev => {
      const next = {...prev, [key]: true};
      if (user?.id) {
        AsyncStorage.setItem(
          BICEPS_SENT_STORAGE(user.id),
          JSON.stringify(next),
        ).catch(() => {});
      }
      return next;
    });
  };

  const handleFriendCheckinBiceps = async (item: Notification) => {
    const checkInId = String(
      item.checkInId || (item.dataPayload?.checkInId as string) || '',
    ).trim();
    const toUserId = item.friendId;
    if (!user?.id || !checkInId || !toUserId) {
      Alert.alert('Kunne ikke sende', 'Manglende tjek-in data.');
      return;
    }
    const key = bicepsReactionKey(checkInId, toUserId);
    if (bicepsSentKeys[key] || bicepsBusyKey) {
      return;
    }
    setBicepsBusyKey(key);
    try {
      await sendWorkoutBicepsReaction(toUserId, checkInId);
      markBicepsSentPersist(key);
    } catch (e) {
      Alert.alert(
        'Kunne ikke sende',
        e instanceof Error ? e.message : 'Prøv igen.',
      );
    } finally {
      setBicepsBusyKey(null);
    }
  };

  const handleFriendCheckinMessage = async (item: Notification) => {
    const fid = item.friendId;
    if (!fid) {
      return;
    }
    readOne(item);
    try {
      const threadId = await getOrCreateDmThread(fid);
      const p = profileById[fid];
      const name = p?.displayName || item.friendName || 'Ven';
      navigation.navigate('Chat', {
        chatId: threadId,
        friendId: fid,
        friendName: name,
        participants: [{id: fid, name}],
      });
    } catch (e) {
      Alert.alert(
        'Besked',
        e instanceof Error ? e.message : 'Kunne ikke åbne chat.',
      );
    }
  };

  const resolvePeerName = (item: Notification) => {
    const id = item.friendId;
    if (id && profileById[id]?.displayName) {
      return profileById[id].displayName;
    }
    if (item.friendName && item.friendName.length < 40) {
      return item.friendName;
    }
    return 'Brugeren';
  };

  const handleAcceptFriendRequest = async (item: Notification) => {
    const frId = item.friendRequestId;
    const notifId = item.id;
    if (!frId || !user?.id) {
      return;
    }
    const peer = resolvePeerName(item);
    setFriendReqBusyId(frId);
    setFriendRequestOutcome(notifId, 'accepted', peer);
    try {
      await acceptFriendRequest(frId);
      void markRead(notifId);
      void loadFriendStore(user.id);
      void refetch();
    } catch (e: unknown) {
      const msg = getSupabaseRpcErrorMessage(e);
      if (isFriendRequestStaleError(msg)) {
        void markRead(notifId);
        void loadFriendStore(user.id);
        void refetch();
        return;
      }
      clearFriendRequestOutcome(notifId);
      void useInAppNotificationStore.getState().refresh(user.id);
      if (isFriendRequestNotRecipientError(msg)) {
        Alert.alert(
          'Kunne ikke acceptere',
          'Denne anmodning tilhører ikke dig.',
        );
        return;
      }
      Alert.alert('Kunne ikke acceptere', msg || 'Prøv igen.');
    } finally {
      setFriendReqBusyId(null);
    }
  };

  const [plannedBusy, setPlannedBusy] = useState<string | null>(null);

  const handleAcceptPlanned = async (item: Notification) => {
    const pid = item.plannedWorkoutId || item.planId;
    if (!pid || !user?.id) {
      return;
    }
    setPlannedBusy(pid);
    try {
      await respondPlannedWorkoutInvite(pid, true);
      await markRead(item.id);
      setPlannedInviteModalNotif(null);
      try {
        const entries = await loadWorkoutPlanEntriesForUser(user.id, true);
        mergePlannedFromServer(entries);
      } catch {
        /* ignore */
      }
      await refetch();
      Alert.alert('Session tilføjet 💪', 'Find den under Planlagte sessions.');
    } catch (e: unknown) {
      Alert.alert(
        'Kunne ikke acceptere',
        e instanceof Error ? e.message : 'Prøv igen.',
      );
    } finally {
      setPlannedBusy(null);
    }
  };

  const handleDeclinePlanned = async (item: Notification) => {
    const pid = item.plannedWorkoutId || item.planId;
    if (!pid || !user?.id) {
      return;
    }
    setPlannedBusy(pid);
    try {
      await respondPlannedWorkoutInvite(pid, false);
      await markRead(item.id);
      setPlannedInviteModalNotif(null);
      await refetch();
    } catch (e: unknown) {
      Alert.alert(
        'Kunne ikke afvise',
        e instanceof Error ? e.message : 'Prøv igen.',
      );
    } finally {
      setPlannedBusy(null);
    }
  };

  const handleDeclineFriendRequest = async (item: Notification) => {
    const frId = item.friendRequestId;
    const notifId = item.id;
    if (!frId || !user?.id) {
      return;
    }
    const peer = resolvePeerName(item);
    setFriendReqBusyId(frId);
    setFriendRequestOutcome(notifId, 'declined', peer);
    try {
      await declineFriendRequest(frId);
      void markRead(notifId);
      void refetch();
    } catch (e: unknown) {
      const msg = getSupabaseRpcErrorMessage(e);
      if (isFriendRequestStaleError(msg)) {
        void markRead(notifId);
        await refetch();
        return;
      }
      clearFriendRequestOutcome(notifId);
      void useInAppNotificationStore.getState().refresh(user.id);
      Alert.alert('Kunne ikke afvise', msg || 'Prøv igen.');
    } finally {
      setFriendReqBusyId(null);
    }
  };

  const plannedModalParticipantLines: PlannedInviteParticipantLine[] = useMemo(() => {
    if (!plannedInviteDetail) {
      return [];
    }
    const sorted = [...plannedInviteDetail.participants].sort((a, b) => {
      if (a.role === 'creator') {
        return -1;
      }
      if (b.role === 'creator') {
        return 1;
      }
      return 0;
    });
    return sorted.map(p => {
      const prof = profileById[p.user_id];
      const name =
        prof?.displayName?.trim() ||
        prof?.username?.trim() ||
        (p.role === 'creator' ? 'Vært' : 'Ven');
      return {
        userId: p.user_id,
        name,
        role: p.role,
        responseStatus: p.response_status,
      };
    });
  }, [plannedInviteDetail, profileById]);

  const plannedModalShowRespond = useMemo(() => {
    if (!user?.id || !plannedInviteDetail) {
      return false;
    }
    if (plannedInviteDetail.workout.status !== 'active') {
      return false;
    }
    const my = plannedInviteDetail.participants.find(
      x => x.user_id === user.id && x.role === 'invitee',
    );
    return my?.response_status === 'pending';
  }, [plannedInviteDetail, user?.id]);

  const plannedModalTrainingLine = useMemo(() => {
    const types =
      plannedInviteDetail?.workout.training_types ??
      plannedInviteModalNotif?.muscles ??
      [];
    if (!types.length) {
      return 'Træning';
    }
    return types.map(t => labelForMuscleToken(String(t))).join(' · ');
  }, [plannedInviteDetail, plannedInviteModalNotif]);

  const plannedModalCenterLine = useMemo(() => {
    const fromRow =
      plannedInviteDetail?.workout.center_name?.trim() ||
      plannedInviteModalNotif?.gymName?.trim();
    return fromRow || '—';
  }, [plannedInviteDetail, plannedInviteModalNotif]);

  const plannedModalAddressLine = useMemo(() => {
    const gid =
      plannedInviteModalNotif?.gymId ||
      plannedInviteDetail?.workout.center_id ||
      '';
    const g = findGymById(gid || null);
    return g?.address?.trim() || '';
  }, [plannedInviteModalNotif, plannedInviteDetail]);

  const plannedModalSchedule = useMemo(() => {
    const fromPayload =
      typeof plannedInviteModalNotif?.dataPayload?.scheduledAt === 'string'
        ? (plannedInviteModalNotif.dataPayload.scheduledAt as string)
        : null;
    const raw =
      plannedInviteDetail?.workout.scheduled_at ||
      fromPayload ||
      (plannedInviteModalNotif?.scheduledAt
        ? plannedInviteModalNotif.scheduledAt.toISOString()
        : null);
    if (!raw) {
      return {dateLine: '—', timeLine: ''};
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return {dateLine: '—', timeLine: ''};
    }
    return {
      dateLine: d.toLocaleDateString('da-DK', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      timeLine: `kl. ${d.toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    };
  }, [plannedInviteDetail, plannedInviteModalNotif]);

  const renderNotificationItem = ({item}: {item: Notification}) => {
    const iconName =
      item.type === 'friend_request'
        ? friendRequestRowIcon(item)
        : getNotificationIcon(item.type);
    const iconColor = getNotificationIconColor(item.type, item.read);
    const actorId = item.friendId;
    const prof = actorId ? profileById[actorId] : undefined;
    const frResolved = !!item.friendRequestUiState;
    const frShowActions =
      item.type === 'friend_request' &&
      item.friendRequestId &&
      item.isFromServer &&
      !frResolved;

    const badgeDefRow = resolveBadgeDefinition(item);
    const isBadgeNotif =
      item.type === 'badge_unlocked' ||
      item.type === 'badge_progress' ||
      item.type === 'streak_milestone';
    const isGroupedFriendCheckins = Boolean(item.dataPayload?.groupedFriendCheckins);

    const renderRowLeading = () => {
      if (isBadgeNotif) {
        if (badgeDefRow) {
          return (
            <View style={styles.badgeEarnedIconWrap}>
              <Text style={styles.badgeEarnedEmoji} accessibilityLabel={badgeDefRow.name}>
                {badgeDefRow.emoji}
              </Text>
            </View>
          );
        }
        if (item.type === 'streak_milestone') {
          return (
            <View style={[styles.iconWrapper, {backgroundColor: iconColor + '20'}]}>
              <Icon name="flame" size={24} color={iconColor} />
            </View>
          );
        }
        return (
          <View style={[styles.iconWrapper, {backgroundColor: colors.rankGold + '20'}]}>
            <Icon name="medal" size={24} color={colors.rankGold} />
          </View>
        );
      }
      if (
        prof ||
        item.type === 'friend_request' ||
        item.type === 'friend_checkin' ||
        item.type === 'workout_reaction' ||
        item.type === 'biceps_reaction' ||
        item.type === 'planned_workout_invite'
      ) {
        return (
          <Avatar
            name={prof?.displayName || item.friendName || item.title}
            imageUrl={prof?.avatarUrl}
            size="md"
          />
        );
      }
      return (
        <View style={[styles.iconWrapper, {backgroundColor: iconColor + '20'}]}>
          <Icon name={iconName as 'notifications'} size={24} color={iconColor} />
        </View>
      );
    };

    return (
      <View
        style={[
          styles.row,
          !item.read && styles.rowUnread,
          item.friendRequestUiState === 'accepted' && styles.rowFrAccepted,
          item.friendRequestUiState === 'declined' && styles.rowFrDeclined,
        ]}>
        <Pressable
          onPress={() => handleOpenFromNotification(item)}
          style={({pressed}) => [styles.rowMain, pressed && {opacity: 0.85}]}
          android_ripple={{color: '#0001'}}>
          {renderRowLeading()}
          <View style={styles.content}>
            {item.type === 'friend_checkin' ? (
              <>
                <Text
                  style={[styles.title, styles.friendCheckinTitle, !item.read && styles.titleUnread]}
                  numberOfLines={3}
                  ellipsizeMode="tail">
                  {isGroupedFriendCheckins ? item.title : friendCheckinCardTitle(item)}
                </Text>
                {friendCheckinLocationTrainingLine(item) ? (
                  <Text
                    style={styles.friendCheckinBody}
                    numberOfLines={2}
                    ellipsizeMode="tail">
                    {friendCheckinLocationTrainingLine(item)}
                  </Text>
                ) : null}
                <Text style={styles.friendCheckinMeta} numberOfLines={1}>
                  {isGroupedFriendCheckins
                    ? 'Tryk for at se hvem der er aktive nu'
                    : friendCheckinMetaLine(item)}
                </Text>
              </>
            ) : item.type === 'badge_unlocked' ? (
              <>
                <Text
                  style={[styles.title, !item.read && styles.titleUnread]}
                  numberOfLines={1}>
                  Nyt badge
                </Text>
                <Text style={styles.message} numberOfLines={2} ellipsizeMode="tail">
                  {`Du har låst et nyt badge op: ${badgeUnlockDisplayName(
                    item,
                    badgeDefRow,
                  )}`}
                </Text>
                <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
              </>
            ) : item.type === 'badge_progress' || item.type === 'streak_milestone' ? (
              <>
                <Text
                  style={[styles.title, !item.read && styles.titleUnread]}
                  numberOfLines={2}
                  ellipsizeMode="tail">
                  {item.title}
                </Text>
                {item.message ? (
                  <Text style={styles.message} numberOfLines={2} ellipsizeMode="tail">
                    {item.message}
                  </Text>
                ) : null}
                <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.title, !item.read && styles.titleUnread]}>
                  {item.title}
                </Text>
                {item.message ? (
                  <Text style={styles.message} numberOfLines={3}>
                    {item.message}
                  </Text>
                ) : null}
                <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
              </>
            )}
          </View>
        </Pressable>
        {!item.read && <View style={styles.unreadDot} />}
        {frShowActions ? (
          <View style={styles.friendReqActions}>
            <TouchableOpacity
              onPress={() => handleDeclineFriendRequest(item)}
              disabled={friendReqBusyId === item.friendRequestId}
              style={[styles.friendReqBtn, styles.friendReqBtnMuted]}
              activeOpacity={0.8}>
              <Text style={styles.friendReqBtnTextMuted}>Afvis</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAcceptFriendRequest(item)}
              disabled={friendReqBusyId === item.friendRequestId}
              style={[styles.friendReqBtn, styles.friendReqBtnPrimary]}
              activeOpacity={0.8}>
              <Text style={styles.friendReqBtnTextPrimary}>Acceptér</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDismissNotification(item)}
              style={styles.dismissIconBtn}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
              accessibilityLabel="Fjern notifikation"
              activeOpacity={0.7}>
              <Icon name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : item.type === 'friend_checkin' && item.isFromServer && !isGroupedFriendCheckins ? (
          <View style={styles.friendCheckinActions}>
            {(() => {
              const ck = String(
                item.checkInId || (item.dataPayload?.checkInId as string) || '',
              ).trim();
              const fid = item.friendId || '';
              const bk = ck && fid ? bicepsReactionKey(ck, fid) : '';
              const sent = bk ? !!bicepsSentKeys[bk] : false;
              const busy = bk && bicepsBusyKey === bk;
              return (
                <>
                  <TouchableOpacity
                    onPress={() => void handleFriendCheckinBiceps(item)}
                    disabled={sent || busy || !ck || !fid}
                    style={[
                      styles.checkinIconBtn,
                      sent && styles.checkinIconBtnSent,
                    ]}
                    activeOpacity={0.8}
                    accessibilityLabel="Send biceps"
                    accessibilityState={{disabled: sent || busy || !ck || !fid}}>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <View style={styles.checkinBicepsIconInner}>
                        <Text style={styles.checkinIconEmoji} accessibilityElementsHidden>
                          💪
                        </Text>
                        {sent ? (
                          <View style={styles.checkinIconSentMark} pointerEvents="none">
                            <Icon name="checkmark" size={10} color={colors.success} />
                          </View>
                        ) : null}
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleFriendCheckinMessage(item)}
                    style={styles.checkinIconBtn}
                    activeOpacity={0.8}
                    accessibilityLabel="Send besked">
                    <Icon name="chatbubble-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </>
              );
            })()}
            <TouchableOpacity
              onPress={() => handleDismissNotification(item)}
              style={styles.dismissIconBtnTight}
              hitSlop={{top: 10, bottom: 10, left: 8, right: 8}}
              accessibilityLabel="Fjern notifikation"
              activeOpacity={0.7}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : item.type === 'workout_invite' ? (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => handleJoinWorkout(item)}
              style={[styles.joinBtn, item.joined && styles.joinBtnJoined]}
              activeOpacity={0.8}>
              <Text
                style={[styles.joinBtnText, item.joined && styles.joinBtnTextJoined]}>
                {item.joined ? 'Anmodet' : 'Deltag'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDismissNotification(item)}
              style={styles.dismissIconBtn}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
              accessibilityLabel="Fjern notifikation"
              activeOpacity={0.7}>
              <Icon name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => handleDismissNotification(item)}
            style={styles.dismissIconBtn}
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
            accessibilityLabel="Fjern notifikation"
            activeOpacity={0.7}>
            <Icon name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifikationer</Text>
        <Text style={styles.headerSubtitle}>
          Hold styr på venner, streaks og mere
        </Text>
        {listForUi.length > 0 && (
          <TouchableOpacity onPress={onMarkAll} style={styles.markAllBtn} activeOpacity={0.8}>
            <Text style={styles.markAllText}>Marker alle som læst</Text>
          </TouchableOpacity>
        )}
      </View>

      {pendingInvitations.length > 0 && (
        <TouchableOpacity
          style={styles.inviteBanner}
          onPress={() => navigation.navigate('WorkoutInvitations')}
          activeOpacity={0.8}>
          <Icon name="fitness" size={22} color={colors.white} />
          <Text style={styles.inviteBannerText}>
            {pendingInvitations.length} træningsinvitation
            {pendingInvitations.length > 1 ? 'er' : ''}
          </Text>
          <Icon name="chevron-forward" size={20} color={colors.white} />
        </TouchableOpacity>
      )}

      <FlatList
        data={groupedNotifications}
        removeClippedSubviews={false}
        keyExtractor={(item, index) =>
          `${item?.id != null ? String(item.id) : 'row'}_${index}`
        }
        extraData={`${frOutcomeKeys}|${Object.keys(bicepsSentKeys).join(',')}|${bicepsBusyKey ?? ''}|${plannedInviteModalNotif?.id ?? ''}|${plannedBusy ?? ''}`}
        renderItem={renderNotificationItem}
        contentContainerStyle={
          groupedNotifications.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Ingen notifikationer lige nu"
            message="Når dine venner tjekker ind, eller noget andet sker, vises det her."
            actionLabel="Tjek ind"
            onAction={() => {
              try {
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'MainTabs',
                    params: {screen: 'CheckIn'},
                  }),
                );
              } catch {
                navigation.navigate('CheckIn' as never);
              }
            }}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <PlannedSessionInviteDetailModal
        visible={!!plannedInviteModalNotif}
        loading={plannedInviteDetailLoading}
        onClose={() => setPlannedInviteModalNotif(null)}
        inviterName={
          plannedInviteModalNotif?.friendName ||
          plannedInviteModalNotif?.title ||
          'Ven'
        }
        inviterAvatarUrl={
          plannedInviteModalNotif?.friendId
            ? profileById[plannedInviteModalNotif.friendId]?.avatarUrl
            : undefined
        }
        trainingLine={plannedModalTrainingLine}
        centerLine={plannedModalCenterLine}
        addressLine={plannedModalAddressLine || undefined}
        dateLine={plannedModalSchedule.dateLine}
        timeLine={plannedModalSchedule.timeLine}
        noteLine={plannedInviteDetail?.workout.note?.trim() || null}
        participants={plannedModalParticipantLines}
        showRespondActions={plannedModalShowRespond}
        busy={
          plannedBusy ===
          (plannedInviteModalNotif?.plannedWorkoutId ||
            plannedInviteModalNotif?.planId ||
            '')
        }
        onAccept={() => {
          if (plannedInviteModalNotif) {
            void handleAcceptPlanned(plannedInviteModalNotif);
          }
        }}
        onDecline={() => {
          if (plannedInviteModalNotif) {
            void handleDeclinePlanned(plannedInviteModalNotif);
          }
        }}
      />
    </View>
  );
};

const NotificationsScreen = () => (
  <NotificationsErrorBoundary>
    <NotificationsScreenInner />
  </NotificationsErrorBoundary>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
  },
  markAllBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
  },
  markAllText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.primary,
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  inviteBannerText: {
    ...typography.bodyBold,
    color: colors.white,
    flex: 1,
    marginLeft: spacing.md,
  },
  list: {
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xs,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  rowMain: {flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0},
  rowUnread: {
    backgroundColor: colors.primary + '08',
    borderColor: colors.primary + '30',
  },
  rowFrAccepted: {
    backgroundColor: colors.success + '10',
    borderColor: colors.success + '35',
  },
  rowFrDeclined: {
    opacity: 0.92,
    backgroundColor: colors.backgroundCard,
    borderColor: colors.border,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.bodyBold,
    color: colors.text,
  },
  friendCheckinTitle: {
    lineHeight: 22,
    paddingRight: spacing.xs,
  },
  titleUnread: {
    fontWeight: '700',
  },
  message: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  badgeEarnedIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEarnedEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  friendCheckinBody: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  friendCheckinMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  friendReqActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  dismissIconBtn: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendReqBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  friendReqBtnMuted: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendReqBtnPrimary: {
    backgroundColor: colors.primary,
  },
  friendReqBtnTextMuted: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  friendReqBtnTextPrimary: {
    ...typography.small,
    fontWeight: '700',
    color: colors.white,
  },
  joinBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  joinBtnJoined: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary + '60',
  },
  joinBtnText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.white,
  },
  joinBtnTextJoined: {
    color: colors.primary,
  },
  friendCheckinActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  checkinIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinIconBtnSent: {
    opacity: 0.5,
  },
  checkinBicepsIconInner: {
    position: 'relative',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinIconEmoji: {
    fontSize: 18,
    lineHeight: 20,
  },
  checkinIconSentMark: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dismissIconBtnTight: {
    padding: 4,
    marginLeft: 2,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NotificationsScreen;
