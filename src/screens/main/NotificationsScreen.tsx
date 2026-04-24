/**
 * Notifikationer – Supabase public.notifications + lokale (workout, besked)
 */

import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Pressable,
  Platform,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
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
import {respondPlannedWorkoutInvite} from '@/services/supabase/plannedWorkoutService';
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

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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

const NotificationsScreen = () => {
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
  const [refreshing, setRefreshing] = useState(false);
  const [profileById, setProfileById] = useState<Record<string, PublicProfile>>(
    {},
  );

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
    void getPublicProfilesByIds([...ids]).then(m => {
      const o: Record<string, PublicProfile> = {};
      m.forEach((p, k) => {
        o[k] = p;
      });
      setProfileById(prev => ({...prev, ...o}));
    });
  }, [listForUi]);

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

  const runDismissLayoutAnimation = () => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        200,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
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
    runDismissLayoutAnimation();
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
    if (item.type === 'friend_checkin' || item.type === 'friend_request_accepted') {
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
      navigation.navigate('Badges');
      return;
    }
    if (item.type === 'workout_invite' && item.planId) {
      navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
      return;
    }
    if (
      (item.type === 'planned_workout_invite' ||
        item.type === 'planned_workout_accepted' ||
        item.type === 'planned_workout_declined') &&
      item.threadId
    ) {
      navigation.navigate('Chat', {
        chatId: item.threadId,
        friendId: item.friendId || '',
        friendName: item.friendName || 'Ven',
        participants:
          item.friendId && item.friendName
            ? [{id: item.friendId, name: item.friendName}]
            : undefined,
      });
    }
  };

  const handleJoinWorkout = (notification: Notification) => {
    if (
      notification.type !== 'workout_invite' &&
      notification.type !== 'friend_checkin'
    ) {
      return;
    }
    const joinerName = user?.displayName || 'En ven';
    if (notification.joined) {
      markInviteJoined(notification.id);
    } else {
      markInviteJoined(notification.id);
      if (notification.type === 'workout_invite' && notification.planId && user) {
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
        navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
      }
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
    runDismissLayoutAnimation();
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
    runDismissLayoutAnimation();
    try {
      await respondPlannedWorkoutInvite(pid, true);
      await markRead(item.id);
      await refetch();
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
    runDismissLayoutAnimation();
    try {
      await respondPlannedWorkoutInvite(pid, false);
      await markRead(item.id);
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
    runDismissLayoutAnimation();
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

    const planPid = item.plannedWorkoutId || item.planId;
    const plannedShowActions =
      item.type === 'planned_workout_invite' &&
      item.isFromServer &&
      !!planPid &&
      !item.read;

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
          {prof || item.type === 'friend_request' || item.type === 'friend_checkin' ? (
            <Avatar
              name={prof?.displayName || item.friendName || item.title}
              imageUrl={prof?.avatarUrl}
              size="md"
            />
          ) : (
            <View style={[styles.iconWrapper, {backgroundColor: iconColor + '20'}]}>
              <Icon name={iconName as 'notifications'} size={24} color={iconColor} />
            </View>
          )}
          <View style={styles.content}>
            <Text style={[styles.title, !item.read && styles.titleUnread]}>
              {item.title}
            </Text>
            {item.message ? (
              <Text style={styles.message} numberOfLines={3}>
                {item.message}
              </Text>
            ) : null}
            <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
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
        ) : plannedShowActions ? (
          <View style={styles.friendReqActions}>
            <TouchableOpacity
              onPress={() => handleDeclinePlanned(item)}
              disabled={plannedBusy === planPid}
              style={[styles.friendReqBtn, styles.friendReqBtnMuted]}
              activeOpacity={0.8}>
              <Text style={styles.friendReqBtnTextMuted}>Afvis</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAcceptPlanned(item)}
              disabled={plannedBusy === planPid}
              style={[styles.friendReqBtn, styles.friendReqBtnPrimary]}
              activeOpacity={0.8}>
              <Text style={styles.friendReqBtnTextPrimary}>Accepter</Text>
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
        ) : (item.type === 'workout_invite' || item.type === 'friend_checkin') ? (
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
        data={listForUi}
        keyExtractor={item => item.id}
        extraData={frOutcomeKeys}
        renderItem={renderNotificationItem}
        contentContainerStyle={
          listForUi.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Ingen notifikationer lige nu"
            message="Når dine venner tjekker ind, eller noget andet sker, vises det her."
            actionLabel="Tjek ind"
            onAction={() => navigation.navigate('CheckIn')}
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
    </View>
  );
};

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
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
});

export default NotificationsScreen;
