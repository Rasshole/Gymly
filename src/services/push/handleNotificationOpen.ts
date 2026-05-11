import {navigationRef} from '@/navigation/navigationRef';
import {SURFACE_GROUPS_IN_APP} from '@/config/launchSurfaceConfig';

/**
 * FCM data: alle værdier er strenge. Naviger fra baggrund/quit.
 */
export function navigateFromPushData(data: Record<string, string> | undefined): void {
  if (!data || !navigationRef.isReady()) {
    return;
  }
  const type = data.type;
  if (!type) {
    return;
  }

  const notifId = data.notificationId;

  const nav = navigationRef as unknown as {
    navigate: (name: string, params?: Record<string, unknown>) => void;
  };

  if (type === 'dm_message') {
    const friendId = data.senderId || data.sender_id || data.user_id;
    const threadId =
      data.conversationId ||
      data.conversation_id ||
      data.chatId ||
      data.chat_id ||
      data.threadId ||
      data.thread_id;
    if (friendId) {
      nav.navigate('Chat', {
        friendId,
        friendName: data.title || 'Besked',
        chatId: threadId,
      });
    }
    return;
  }

  if (type === 'friend_request' || type === 'friend_request_accepted') {
    nav.navigate('Notifications', notifId ? {highlightNotificationId: notifId} : undefined);
    return;
  }

  if (type === 'friend_checked_in') {
    const friendUserId =
      data.friendUserId ||
      data.friend_user_id ||
      data.senderId ||
      data.sender_id ||
      data.user_id;
    const centerId = data.centerId || data.center_id;
    const centerName = data.centerName || data.center_name;
    const friendLabel =
      data.friendName ||
      data.friend_name ||
      data.actorName ||
      data.actor_name ||
      data.title;
    if (centerId || centerName) {
      nav.navigate('GymPresence', {
        gym: {
          gymId: centerId || 'unknown',
          gymName: centerName || 'Center',
          activeUsers: 0,
          userList: [],
        },
      });
      return;
    }
    if (friendUserId) {
      nav.navigate('FriendProfile', {
        friendId: friendUserId,
        friendName: friendLabel,
      });
    }
    return;
  }

  if (type === 'workout_reaction') {
    const threadId =
      data.conversationId ||
      data.conversation_id ||
      data.threadId ||
      data.thread_id ||
      data.chatId ||
      data.chat_id;
    const fromId =
      data.fromUserId ||
      data.senderId ||
      data.sender_id ||
      data.user_id;
    const vibeName =
      data.actorName || data.actor_name || data.title || 'Besked';
    if (threadId && fromId) {
      nav.navigate('Chat', {
        friendId: fromId,
        friendName: vibeName,
        chatId: threadId,
      });
      return;
    }
    nav.navigate('Notifications', notifId ? {highlightNotificationId: notifId} : undefined);
    return;
  }

  if (type === 'biceps_reaction') {
    nav.navigate('Notifications', notifId ? {highlightNotificationId: notifId} : undefined);
    return;
  }

  if (
    type === 'planned_workout_invite' ||
    type === 'planned_workout_accepted' ||
    type === 'planned_workout_declined' ||
    type === 'planned_workout_reminder'
  ) {
    const pid = data.plannedWorkoutId;
    nav.navigate('WorkoutSchedule', {
      openPlannedId: pid,
      initialTab: 'upcoming',
    });
    return;
  }

  if (
    type === 'gymly_group_invite' ||
    type === 'gymly_group_invite_declined' ||
    type === 'gymly_group_member_joined' ||
    type === 'gymly_group_message' ||
    type === 'gymly_planned_in_group' ||
    type === 'gymly_group_check_in'
  ) {
    if (!SURFACE_GROUPS_IN_APP) {
      nav.navigate('Notifications', notifId ? {highlightNotificationId: notifId} : undefined);
      return;
    }
    const groupId = data.groupId;
    if (groupId) {
      nav.navigate('GroupDetail', {groupId});
      return;
    }
  }

  if (type === 'workout_reminder') {
    nav.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
    return;
  }

  if (type === 'leaderboard_movement') {
    nav.navigate('Notifications', notifId ? {highlightNotificationId: notifId} : undefined);
    return;
  }

  if (type === 'badge_unlocked' || type === 'streak_milestone' || type === 'badge_progress') {
    const badgeId = data.badgeId;
    nav.navigate('MainTabs', {
      screen: 'Badges',
      params: badgeId ? {highlightBadgeId: badgeId} : {},
    });
    return;
  }

  if (notifId) {
    nav.navigate('Notifications', {highlightNotificationId: notifId});
  }
}
