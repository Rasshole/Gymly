import {navigationRef} from '@/navigation/navigationRef';

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

  if (type === 'dm_message') {
    const friendId = data.senderId;
    const threadId = data.conversationId;
    if (friendId) {
      navigationRef.navigate('Chat', {
        friendId,
        friendName: data.title || 'Besked',
        chatId: threadId,
      });
    }
    return;
  }

  if (type === 'friend_request' || type === 'friend_request_accepted') {
    navigationRef.navigate('Notifications', notifId ? {highlightNotificationId: notifId} : undefined);
    return;
  }

  if (type === 'friend_checked_in') {
    const friendUserId = data.friendUserId || data.senderId;
    if (friendUserId) {
      navigationRef.navigate('FriendProfile', {
        friendId: friendUserId,
        friendName: data.title,
      });
    }
    return;
  }

  if (
    type === 'planned_workout_invite' ||
    type === 'planned_workout_accepted' ||
    type === 'planned_workout_declined' ||
    type === 'planned_workout_reminder'
  ) {
    const pid = data.plannedWorkoutId;
    navigationRef.navigate('WorkoutSchedule', {
      openPlannedId: pid,
      initialTab: 'upcoming',
    });
    return;
  }

  if (type === 'workout_reminder') {
    navigationRef.navigate('WorkoutSchedule', {initialTab: 'upcoming'});
    return;
  }

  if (type === 'badge_unlocked' || type === 'streak_milestone' || type === 'badge_progress') {
    const badgeId = data.badgeId;
    navigationRef.navigate('MainTabs', {
      screen: 'Badges',
      params: badgeId ? {highlightBadgeId: badgeId} : {},
    });
    return;
  }

  if (notifId) {
    navigationRef.navigate('Notifications', {highlightNotificationId: notifId});
  }
}
