/**
 * Notifikationer – Supabase public.notifications + lokale (workout, besked)
 */

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActionSheetIOS,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {CommonActions, useFocusEffect, useNavigation} from '@react-navigation/native';
import {useInAppNotifications} from '@/hooks/useInAppNotifications';
import {useNotificationStore} from '@/store/notificationStore';
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import NotificationService from '@/services/notifications/NotificationService';
import {useFormatRelativeTime} from '@/hooks/useFormatRelativeTime';
import {formatRelativeTime as formatRelativeTimeUtil} from '@/utils/formatRelativeTime';
import {getRuntimeLanguage, rt, useTranslation} from '@/i18n';
import {labelForMuscleToken} from '@/utils/muscleGroupLabels';
import {
  badgeNameForNotification,
  friendCheckinTitle,
  localizedBadgeProgressCopy,
  localizedFriendRequestCopy,
  localizedStreakCopy,
  resolveBadgeDefFromNotification,
} from '@/utils/notificationCopy';
import {shouldShowFriendRequestActions} from '@/utils/friendRequestNotificationResolve';
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
import {isFriendActionUnavailableError} from '@/services/supabase/userBlockService';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {useFriendStore} from '@/store/friendStore';
import {usePendingFriendRequestStore} from '@/store/pendingFriendRequestStore';
import {getOrCreateDmThread} from '@/services/supabase/dmService';
import {
  enqueueBicepsDm,
  newClientMessageId,
} from '@/services/notifications/notificationBicepsDm';
import {BicepsBurst} from '@/components/notifications/BicepsBurst';
import {GymlyPressable} from '@/components/ui/GymlyPressable';

const FRIEND_CHECKIN_GROUP_THRESHOLD = 4;
const FRIEND_CHECKIN_GROUP_WINDOW_MS = 5 * 60 * 1000;
const SENT_FLASH_MS = 1200;
/** Matches Avatar size "md" so person rows and icon wells share one size. */
const ROW_AVATAR_PX = 40;

function muscleLabel(raw: string): string {
  return labelForMuscleToken(raw, getRuntimeLanguage());
}

function friendCheckinTrainingLabel(item: Notification): string {
  const fromRow = item.muscles?.filter(m => m && String(m).trim().length > 0) ?? [];
  if (fromRow.length > 0) {
    return fromRow.map(m => muscleLabel(String(m))).join(' · ');
  }
  const bodyLine = item.message || '';
  const trainerIdx = bodyLine.search(/Træner:\s*/i);
  if (trainerIdx >= 0) {
    const part = bodyLine.slice(trainerIdx).replace(/Træner:\s*/i, '').trim();
    if (part) {
      return part
        .split(',')
        .map(s => muscleLabel(s))
        .join(' · ');
    }
  }
  return rt('notifications.workoutDefault');
}

function friendCheckinLocationTrainingLine(item: Notification): string {
  const center = (item.gymName || (item.dataPayload?.centerName as string) || '').trim();
  const train = friendCheckinTrainingLabel(item);
  if (center && train) {
    return `${center} · ${train}`;
  }
  return center || train || '';
}

function friendCheckinMetaLine(item: Notification): string {
  const startedRaw = item.dataPayload?.startedAt as string | undefined;
  if (startedRaw) {
    const start = new Date(startedRaw);
    if (!Number.isNaN(start.getTime())) {
      const mins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
      return rt('activeSession.minutesInProgress', {count: mins});
    }
  }
  return formatRelativeTimeUtil(item.timestamp, getRuntimeLanguage());
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
          <EmptyState
            icon="alert-circle-outline"
            title={rt('notifications.couldNotShowTitle')}
            message={this.state.message || rt('notifications.loadError')}
            actionLabel={rt('errors.tryAgain')}
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
  const {t, intlLocale} = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
  const {user} = useAppStore();
  const {listForUi, refetch, markRead, markAllRead: markAllInApp} =
    useInAppNotifications();

  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch]),
  );
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
  const frResolutionKeys = useInAppNotificationStore(s =>
    Object.keys(s.friendRequestResolutions).join(),
  );
  const removeInAppRowById = useInAppNotificationStore(s => s.removeInAppRowById);
  const loadFriendStore = useFriendStore(s => s.load);

  const pendingInvitations = user ? getPendingInvitations(user.id) : [];
  const [friendReqBusyId, setFriendReqBusyId] = useState<string | null>(null);
  const [burstByNotifId, setBurstByNotifId] = useState<Record<string, number>>({});
  const [sentFlashByNotifId, setSentFlashByNotifId] = useState<
    Record<string, number>
  >({});
  /** notifId -> clientMessageId of the last failed send, so retry never duplicates. */
  const failedClientIdByNotifId = useRef(new Map<string, string>());
  const burstSeq = useRef(0);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
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
    return () => {
      flashTimers.current.forEach(clearTimeout);
      flashTimers.current = [];
    };
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
        title: t('notifications.friendsActiveNow', {count: String(clustered.length)}),
        message: clustered
          .slice(0, 3)
          .map(n => n.friendName || t('notifications.guest'))
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

  const hasUnread = useMemo(() => listForUi.some(n => !n.read), [listForUi]);

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
        Alert.alert(t('notifications.couldNotDelete'), t('errors.tryAgain'));
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
    if (item.type === 'say_hi_request' || item.dbType === 'say_hi_request') {
      navigation.navigate('Messages', {
        openSayHi: true,
        sayHiRequestId:
          (d?.sayHiRequestId as string | undefined) ||
          (d?.say_hi_request_id as string | undefined),
      });
      return;
    }
    if (
      item.type === 'biceps_reaction' ||
      item.dbType === 'post_like' ||
      item.dbType === 'post_comment' ||
      item.dbType === 'comment_like'
    ) {
      const postId =
        (d?.postId as string | undefined) ||
        (d?.post_id as string | undefined);
      navigation.navigate('MainTabs', {
        screen: 'Home',
        params: postId ? {highlightPostId: postId} : undefined,
      });
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

  const flashSentConfirmed = (notifId: string) => {
    burstSeq.current += 1;
    const token = burstSeq.current;
    setBurstByNotifId(prev => ({...prev, [notifId]: token}));
    setSentFlashByNotifId(prev => ({...prev, [notifId]: token}));
    const timer = setTimeout(() => {
      const clearIfSameToken = (prev: Record<string, number>) => {
        if (prev[notifId] !== token) {
          return prev;
        }
        const next = {...prev};
        delete next[notifId];
        return next;
      };
      setSentFlashByNotifId(clearIfSameToken);
      setBurstByNotifId(clearIfSameToken);
      flashTimers.current = flashTimers.current.filter(x => x !== timer);
    }, SENT_FLASH_MS);
    flashTimers.current.push(timer);
  };

  /**
   * 💪 is a normal DM, so it is repeatable: every tap enqueues one send and we
   * stay on the notifications screen.
   */
  const sendBicepsDm = async (item: Notification, clientMessageId: string) => {
    const friendId = item.friendId;
    if (!user?.id || !friendId) {
      return;
    }
    const notifId = item.id;
    const friendName =
      profileById[friendId]?.displayName ||
      item.friendName ||
      t('common.friend');
    try {
      await enqueueBicepsDm({
        clientMessageId,
        currentUserId: user.id,
        friendId,
        friendName,
      });
      failedClientIdByNotifId.current.delete(notifId);
      flashSentConfirmed(notifId);
    } catch (e) {
      // Keep the id so a retry lands on the same message row instead of a duplicate.
      failedClientIdByNotifId.current.set(notifId, clientMessageId);
      if (isFriendActionUnavailableError(e)) {
        Alert.alert(
          t('notifications.couldNotSend'),
          t('friendsScreen.actionFailed'),
        );
        return;
      }
      Alert.alert(
        t('notifications.couldNotSend'),
        e instanceof Error ? e.message : t('errors.tryAgain'),
        [
          {text: t('common.cancel'), style: 'cancel'},
          {
            text: t('common.retry'),
            onPress: () => void sendBicepsDm(item, clientMessageId),
          },
        ],
      );
    }
  };

  const handleFriendCheckinBiceps = (item: Notification) => {
    if (!item.friendId) {
      return;
    }
    // Scale + light haptic fire on press via GymlyPressable; "Sent" only after await.
    void sendBicepsDm(item, newClientMessageId());
  };

  const openRowMenu = (item: Notification) => {
    const removeLabel = t('notifications.remove');
    const cancelLabel = t('common.cancel');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [cancelLabel, removeLabel],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
        },
        index => {
          if (index === 1) {
            handleDismissNotification(item);
          }
        },
      );
      return;
    }
    Alert.alert(t('notifications.title'), undefined, [
      {text: cancelLabel, style: 'cancel'},
      {
        text: removeLabel,
        style: 'destructive',
        onPress: () => handleDismissNotification(item),
      },
    ]);
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
        e instanceof Error ? e.message : t('notifications.couldNotOpenChat'),
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
    if (friendReqBusyId || !shouldShowFriendRequestActions(item.friendRequestUiState)) {
      return;
    }
    const peer = resolvePeerName(item);
    setFriendReqBusyId(frId);
    setFriendRequestOutcome(notifId, 'accepted', peer);
    try {
      await acceptFriendRequest(frId);
      void markRead(notifId);
      void loadFriendStore(user.id);
      void usePendingFriendRequestStore.getState().load(user.id);
      void refetch();
    } catch (e: unknown) {
      const msg = getSupabaseRpcErrorMessage(e);
      if (isFriendRequestStaleError(msg)) {
        setFriendRequestOutcome(notifId, 'accepted', peer);
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
          t('notifications.notYourRequest'),
        );
        return;
      }
      Alert.alert(
        t('notifications.couldNotAccept'),
        isFriendActionUnavailableError(e)
          ? t('friendsScreen.actionFailed')
          : msg || t('errors.tryAgain'),
      );
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
      Alert.alert(t('notifications.sessionAdded'), t('notifications.sessionAddedBody'));
    } catch (e: unknown) {
      Alert.alert(
        t('notifications.couldNotAccept'),
        e instanceof Error ? e.message : t('errors.tryAgain'),
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
        t('notifications.couldNotDecline'),
        e instanceof Error ? e.message : t('errors.tryAgain'),
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
    if (friendReqBusyId || !shouldShowFriendRequestActions(item.friendRequestUiState)) {
      return;
    }
    const peer = resolvePeerName(item);
    setFriendReqBusyId(frId);
    setFriendRequestOutcome(notifId, 'declined', peer);
    try {
      await declineFriendRequest(frId);
      void markRead(notifId);
      void usePendingFriendRequestStore.getState().load(user.id);
      void refetch();
    } catch (e: unknown) {
      const msg = getSupabaseRpcErrorMessage(e);
      if (isFriendRequestStaleError(msg)) {
        setFriendRequestOutcome(notifId, 'declined', peer);
        void markRead(notifId);
        await refetch();
        return;
      }
      clearFriendRequestOutcome(notifId);
      void useInAppNotificationStore.getState().refresh(user.id);
      Alert.alert(t('notifications.couldNotDecline'), msg || t('errors.tryAgain'));
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
        (p.role === 'creator' ? t('notifications.host') : t('notifications.guest'));
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
      return rt('notifications.workoutDefault');
    }
    return types.map(tok => muscleLabel(String(tok))).join(' · ');
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
      dateLine: d.toLocaleDateString(intlLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      timeLine: t('plannedSessions.timeAt', {
        time: d.toLocaleTimeString(intlLocale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }),
    };
  }, [plannedInviteDetail, plannedInviteModalNotif, intlLocale, t]);

  const renderNotificationItem = ({item}: {item: Notification}) => {
    const iconName =
      item.type === 'friend_request'
        ? friendRequestRowIcon(item)
        : getNotificationIcon(item.type);
    const iconColor = getNotificationIconColor(item.type, item.read);
    const actorId = item.friendId;
    const prof = actorId ? profileById[actorId] : undefined;
    const frShowActions =
      item.type === 'friend_request' &&
      item.friendRequestId &&
      item.isFromServer &&
      shouldShowFriendRequestActions(item.friendRequestUiState);

    const badgeDefRow = resolveBadgeDefFromNotification(item);
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
          <Icon name={iconName as 'notifications'} size={22} color={iconColor} />
        </View>
      );
    };

    const showCheckinActions =
      item.type === 'friend_checkin' &&
      item.isFromServer &&
      !isGroupedFriendCheckins;
    const burstToken = burstByNotifId[item.id] ?? 0;
    const showSentFlash = !!sentFlashByNotifId[item.id];

    const renderRowActions = () => {
      if (frShowActions) {
        return (
          <View style={styles.friendReqActions}>
            <TouchableOpacity
              onPress={() => handleDeclineFriendRequest(item)}
              disabled={friendReqBusyId === item.friendRequestId}
              style={[styles.friendReqBtn, styles.friendReqBtnMuted]}
              activeOpacity={0.8}>
              <Text style={styles.friendReqBtnTextMuted}>{t('groups.decline')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAcceptFriendRequest(item)}
              disabled={friendReqBusyId === item.friendRequestId}
              style={[styles.friendReqBtn, styles.friendReqBtnPrimary]}
              activeOpacity={0.8}>
              <Text style={styles.friendReqBtnTextPrimary}>{t('groups.accept')}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      if (showCheckinActions) {
        return (
          <View style={styles.checkinActions}>
            {item.friendId ? (
              <View style={styles.bicepsSlot}>
                <BicepsBurst token={burstToken} />
                <GymlyPressable
                  haptic="light"
                  onPress={() => handleFriendCheckinBiceps(item)}
                  style={styles.checkinIconBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.sendBiceps')}>
                  <Text style={styles.checkinIconEmoji} accessibilityElementsHidden>
                    💪
                  </Text>
                </GymlyPressable>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => void handleFriendCheckinMessage(item)}
              style={styles.checkinIconBtn}
              activeOpacity={0.8}
              accessibilityLabel={t('a11y.sendMessage')}>
              <Icon name="chatbubble-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
            {showSentFlash ? (
              <Text style={styles.sentFlash}>{t('notifications.sent')}</Text>
            ) : null}
          </View>
        );
      }
      if (item.type === 'workout_invite') {
        return (
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
          </View>
        );
      }
      return null;
    };

    const rowActions = renderRowActions();

    return (
      <View
        style={[
          styles.row,
          !item.read && styles.rowUnread,
          item.friendRequestUiState === 'accepted' && styles.rowFrAccepted,
          item.friendRequestUiState === 'declined' && styles.rowFrDeclined,
        ]}>
        <View style={styles.rowTop}>
          <Pressable
            testID={
              item.dbType === 'post_like' || item.type === 'biceps_reaction'
                ? 'notif-post-like'
                : undefined
            }
            onPress={() => handleOpenFromNotification(item)}
            style={({pressed}) => [styles.rowMain, pressed && {opacity: 0.85}]}
            android_ripple={{color: '#0001'}}>
            {renderRowLeading()}
            <View style={styles.content}>
              {item.type === 'friend_checkin' ? (
                <>
                  <Text
                    style={[styles.title, !item.read && styles.titleUnread]}
                    numberOfLines={2}
                    ellipsizeMode="tail">
                    {isGroupedFriendCheckins
                      ? item.title
                      : friendCheckinTitle(
                          item.friendName ||
                            (actorId ? profileById[actorId]?.displayName : '') ||
                            item.title ||
                            '',
                          t,
                        )}
                  </Text>
                  {friendCheckinLocationTrainingLine(item) ? (
                    <Text
                      style={styles.message}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {friendCheckinLocationTrainingLine(item)}
                    </Text>
                  ) : null}
                  <Text style={styles.time} numberOfLines={1}>
                    {isGroupedFriendCheckins
                      ? t('notifications.tapActiveNow')
                      : friendCheckinMetaLine(item)}
                  </Text>
                </>
              ) : item.type === 'badge_unlocked' ? (
                <>
                  <Text
                    style={[styles.title, !item.read && styles.titleUnread]}
                    numberOfLines={1}>
                    {t('notifications.newBadge')}
                  </Text>
                  <Text style={styles.message} numberOfLines={2} ellipsizeMode="tail">
                    {t('notifications.badgeUnlocked', {
                      name: badgeNameForNotification(item, badgeDefRow, t),
                    })}
                  </Text>
                  <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
                </>
              ) : item.type === 'badge_progress' ||
                item.type === 'streak_milestone' ? (
                (() => {
                  const copy =
                    item.type === 'streak_milestone'
                      ? localizedStreakCopy(item, t)
                      : localizedBadgeProgressCopy(item, t);
                  return (
                    <>
                      <Text
                        style={[styles.title, !item.read && styles.titleUnread]}
                        numberOfLines={2}
                        ellipsizeMode="tail">
                        {copy.title}
                      </Text>
                      {copy.message ? (
                        <Text
                          style={styles.message}
                          numberOfLines={2}
                          ellipsizeMode="tail">
                          {copy.message}
                        </Text>
                      ) : null}
                      <Text style={styles.time}>
                        {formatRelativeTime(item.timestamp)}
                      </Text>
                    </>
                  );
                })()
              ) : item.type === 'friend_request' ? (
                (() => {
                  const copy = localizedFriendRequestCopy(item, t);
                  return (
                    <>
                      <Text
                        style={[styles.title, !item.read && styles.titleUnread]}
                        numberOfLines={2}
                        ellipsizeMode="tail">
                        {copy.title}
                      </Text>
                      {copy.message ? (
                        <Text
                          style={styles.message}
                          numberOfLines={2}
                          ellipsizeMode="tail">
                          {copy.message}
                        </Text>
                      ) : null}
                      {copy.statusLabel && !frShowActions ? (
                        <Text style={styles.frStatusLabel}>{copy.statusLabel}</Text>
                      ) : null}
                      <Text style={styles.time}>
                        {formatRelativeTime(item.timestamp)}
                      </Text>
                    </>
                  );
                })()
              ) : (
                <>
                  <Text
                    style={[styles.title, !item.read && styles.titleUnread]}
                    numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.message ? (
                    <Text style={styles.message} numberOfLines={2}>
                      {item.message}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
                </>
              )}
            </View>
          </Pressable>
          <View style={styles.rowTrailing}>
            {!item.read ? <View style={styles.unreadDot} /> : null}
            <TouchableOpacity
              onPress={() => openRowMenu(item)}
              style={styles.menuBtn}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.moreOptions')}
              activeOpacity={0.7}>
              <Icon name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        {rowActions ? (
          <View style={styles.rowActionsWrap}>{rowActions}</View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {hasUnread ? (
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onMarkAll}
            style={styles.markAllBtn}
            accessibilityRole="button"
            activeOpacity={0.8}>
            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {pendingInvitations.length > 0 && (
        <TouchableOpacity
          style={styles.inviteBanner}
          onPress={() => navigation.navigate('WorkoutInvitations')}
          activeOpacity={0.8}>
          <Icon name="fitness" size={22} color={colors.white} />
          <Text style={styles.inviteBannerText}>
            {t(
              pendingInvitations.length === 1
                ? 'notifications.workoutInvites_one'
                : 'notifications.workoutInvites_other',
              {count: String(pendingInvitations.length)},
            )}
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
        extraData={`${frResolutionKeys}|${Object.entries(burstByNotifId)
          .map(([k, v]) => `${k}:${v}`)
          .join(',')}|${Object.keys(sentFlashByNotifId).join(',')}|${
          plannedInviteModalNotif?.id ?? ''
        }|${plannedBusy ?? ''}|${friendReqBusyId ?? ''}`}
        renderItem={renderNotificationItem}
        contentContainerStyle={
          groupedNotifications.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title={t('notifications.emptyTitle')}
            message={t('notifications.emptyMessage')}
            actionLabel={t('notifications.checkInCta')}
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
            ? profileById[plannedInviteModalNotif.friendId]?.avatarUrl ?? undefined
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  markAllBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
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
  },
  emptyContainer: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    overflow: 'visible',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0},
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  rowUnread: {
    backgroundColor: colors.primary + '0A',
  },
  rowFrAccepted: {
    backgroundColor: colors.success + '0D',
  },
  rowFrDeclined: {
    opacity: 0.92,
  },
  frStatusLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  iconWrapper: {
    width: ROW_AVATAR_PX,
    height: ROW_AVATAR_PX,
    borderRadius: ROW_AVATAR_PX / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.small,
    fontWeight: '600',
    color: colors.text,
  },
  titleUnread: {
    fontWeight: '700',
  },
  message: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeEarnedIconWrap: {
    width: ROW_AVATAR_PX,
    height: ROW_AVATAR_PX,
    borderRadius: ROW_AVATAR_PX / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEarnedEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
    marginLeft: spacing.sm,
  },
  menuBtn: {
    width: 36,
    height: 36,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActionsWrap: {
    marginLeft: ROW_AVATAR_PX + spacing.md,
    marginTop: 8,
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
  },
  friendReqBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
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
    paddingVertical: 6,
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
  checkinActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bicepsSlot: {
    position: 'relative',
    overflow: 'visible',
  },
  checkinIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinIconEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  sentFlash: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '600',
  },
});

export default NotificationsScreen;
