/**
 * Notifications Screen
 * Premium notifikationer – lette at scanne, visuelt pæne
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useNotificationStore, Notification} from '@/store/notificationStore';
import {useWorkoutInvitationStore} from '@/store/workoutInvitationStore';
import {useAppStore} from '@/store/appStore';
import {useWorkoutPlanStore} from '@/store/workoutPlanStore';
import NotificationService from '@/services/notifications/NotificationService';
import {getInitialNotifications} from '@/services/data';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';
import {
  listPendingIncomingRequests,
  acceptFriendRequest,
  declineFriendRequest,
  type PublicProfile,
  type FriendRequestRow,
} from '@/services/supabase/friendService';

type IncomingFriendRequest = FriendRequestRow & {fromProfile?: PublicProfile};

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'friend_checkin':
      return 'location';
    case 'friend_request':
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
      return 'medal';
    default:
      return 'notifications';
  }
};

const getNotificationIconColor = (type: Notification['type'], read: boolean) => {
  if (read) return colors.textMuted;
  switch (type) {
    case 'friend_checkin':
      return colors.success;
    case 'streak_milestone':
      return colors.warning;
    case 'badge_unlocked':
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
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    markInviteJoined,
    seedNotifications,
  } = useNotificationStore();
  const {getPendingInvitations} = useWorkoutInvitationStore();
  const {acceptPlanInvite} = useWorkoutPlanStore();

  const pendingInvitations = user ? getPendingInvitations(user.id) : [];
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<
    IncomingFriendRequest[]
  >([]);
  const [friendReqBusyId, setFriendReqBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadIncomingFriendRequests = useCallback(async () => {
    if (!user?.id) {
      setIncomingFriendRequests([]);
      return;
    }
    try {
      const list = await listPendingIncomingRequests(user.id);
      setIncomingFriendRequests(list);
    } catch {
      setIncomingFriendRequests([]);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadIncomingFriendRequests();
    }, [loadIncomingFriendRequests]),
  );

  useEffect(() => {
    if (notifications.length === 0) {
      getInitialNotifications().then((data) => {
        if (data.length > 0) {
          seedNotifications(data);
        }
      });
    }
  }, [notifications.length, seedNotifications]);

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
          notification.gymName || 'dit center'
        );
      }
      if (notification.planId) {
        navigation.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
      }
    }
  };

  const handleAcceptFriendRequest = async (req: IncomingFriendRequest) => {
    setFriendReqBusyId(req.id);
    try {
      await acceptFriendRequest(req.id);
      setIncomingFriendRequests(prev => prev.filter(r => r.id !== req.id));
    } catch {
      /* stille fejl — bruger kan prøve igen */
    } finally {
      setFriendReqBusyId(null);
    }
  };

  const handleDeclineFriendRequest = async (req: IncomingFriendRequest) => {
    setFriendReqBusyId(req.id);
    try {
      await declineFriendRequest(req.id);
      setIncomingFriendRequests(prev => prev.filter(r => r.id !== req.id));
    } catch {
      /* stille fejl */
    } finally {
      setFriendReqBusyId(null);
    }
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await loadIncomingFriendRequests();
    } finally {
      setRefreshing(false);
    }
  };

  const renderNotificationItem = ({item}: {item: Notification}) => {
    const iconName = getNotificationIcon(item.type);
    const iconColor = getNotificationIconColor(item.type, item.read);

    return (
      <TouchableOpacity
        style={[styles.row, !item.read && styles.rowUnread]}
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.8}>
        <View style={[styles.iconWrapper, {backgroundColor: iconColor + '20'}]}>
          <Icon name={iconName as any} size={24} color={iconColor} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, !item.read && styles.titleUnread]}>
            {item.type === 'friend_checkin' && item.friendName
              ? `${item.friendName} tjekkede ind`
              : item.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {item.type === 'friend_checkin' && item.gymName
              ? `${item.friendName} er nu i ${item.gymName}`
              : item.message}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(item.timestamp)}</Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
        {(item.type === 'workout_invite' || item.type === 'friend_checkin') && (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => handleJoinWorkout(item)}
              style={[styles.joinBtn, item.joined && styles.joinBtnJoined]}
              activeOpacity={0.8}>
              <Text
                style={[
                  styles.joinBtnText,
                  item.joined && styles.joinBtnTextJoined,
                ]}>
                {item.joined ? 'Anmodet' : 'Deltag'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => removeNotification(item.id)}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {item.type !== 'workout_invite' &&
          item.type !== 'friend_checkin' && (
            <TouchableOpacity
              onPress={() => removeNotification(item.id)}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifikationer</Text>
        <Text style={styles.headerSubtitle}>
          Hold styr på venner, streaks og mere
        </Text>
        {notifications.length > 0 && unreadCount > 0 && (
          <TouchableOpacity
            onPress={markAllAsRead}
            style={styles.markAllBtn}
            activeOpacity={0.8}>
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

      {incomingFriendRequests.length > 0 && (
        <View style={styles.friendReqBlock}>
          <Text style={styles.friendReqHeading}>Venneanmodninger</Text>
          {incomingFriendRequests.map(req => {
            const label =
              req.fromProfile?.displayName ??
              req.fromProfile?.username ??
              'Ny bruger';
            const busy = friendReqBusyId === req.id;
            return (
              <View key={req.id} style={styles.friendReqCard}>
                <Icon name="person-add-outline" size={24} color={colors.primary} />
                <View style={styles.friendReqBody}>
                  <Text style={styles.friendReqName} numberOfLines={1}>
                    {label}
                  </Text>
                  {req.fromProfile?.username ? (
                    <Text style={styles.friendReqSub} numberOfLines={1}>
                      @{req.fromProfile.username}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.friendReqActions}>
                  <TouchableOpacity
                    onPress={() => handleDeclineFriendRequest(req)}
                    disabled={busy}
                    style={[styles.friendReqBtn, styles.friendReqBtnMuted]}
                    activeOpacity={0.8}>
                    <Text style={styles.friendReqBtnTextMuted}>Afvis</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAcceptFriendRequest(req)}
                    disabled={busy}
                    style={[styles.friendReqBtn, styles.friendReqBtnPrimary]}
                    activeOpacity={0.8}>
                    <Text style={styles.friendReqBtnTextPrimary}>Acceptér</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderNotificationItem}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Ingen notifikationer lige nu"
            message="Når dine venner tjekker ind, får du besked her. Tjek ind selv for at holde momentumet."
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
  friendReqBlock: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  friendReqHeading: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  friendReqCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendReqBody: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  friendReqName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  friendReqSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  friendReqActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  rowUnread: {
    backgroundColor: colors.primary + '08',
    borderColor: colors.primary + '30',
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
