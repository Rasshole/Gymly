import type {NotificationRow, InAppNotificationType} from '@/services/notifications/inAppNotificationService';
import type {Notification, NotificationType} from '@/types/notification.types';

function mapType(t: InAppNotificationType): NotificationType {
  switch (t) {
    case 'friend_checked_in':
      return 'friend_checkin';
    case 'friend_request':
      return 'friend_request';
    case 'friend_request_accepted':
      return 'friend_request_accepted';
    case 'badge_unlocked':
      return 'badge_unlocked';
    case 'streak_milestone':
      return 'streak_milestone';
    case 'badge_progress':
      return 'badge_progress';
    case 'planned_workout_invite':
      return 'planned_workout_invite';
    case 'planned_workout_accepted':
      return 'planned_workout_accepted';
    case 'planned_workout_declined':
      return 'planned_workout_declined';
    case 'planned_workout_reminder':
      return 'planned_workout_reminder';
    case 'dm_message':
      return 'message';
    case 'workout_reminder':
      return 'planned_workout_reminder';
    default:
      return 'friend_checkin';
  }
}

export type LocalFriendRequestResolution = {
  outcome: 'accepted' | 'declined';
  peerName: string;
};

/** Tekst/tilstand når bruger lige har accepteret/afvist (optimistisk UI) */
export function applyLocalFriendRequestResolution(
  n: Notification,
  o: LocalFriendRequestResolution,
): Notification {
  const name = o.peerName.trim() || 'Brugeren';
  if (o.outcome === 'accepted') {
    return {
      ...n,
      read: true,
      title: 'Du er nu venner med ' + name,
      message: '',
      friendRequestUiState: 'accepted',
    };
  }
  return {
    ...n,
    read: true,
    title: 'Venneanmodning',
    message: 'Du har afvist venneanmodningen fra ' + name + '.',
    friendRequestUiState: 'declined',
  };
}

export function mapRowToViewNotification(row: NotificationRow): Notification {
  const data = row.data ?? {};
  const fId = (data.friendRequestId as string) || undefined;
  const targetUser = (data.targetUserId as string) || row.actor_user_id || undefined;
  const plannedWorkoutId = (data.plannedWorkoutId as string) || undefined;
  const threadId =
    (data.threadId as string) || (data.conversationId as string) || undefined;
  const schedRaw = data.scheduledAt as string | undefined;
  return {
    id: row.id,
    type: mapType(row.type),
    title: row.title,
    message: row.body,
    read: row.is_read,
    timestamp: new Date(row.created_at),
    friendName: targetUser,
    friendId: row.actor_user_id || (data.friendUserId as string) || targetUser,
    friendRequestId: fId,
    checkInTime: new Date(row.created_at),
    gymName: (data.centerName as string) || undefined,
    gymId: (data.centerId as string) || undefined,
    planId: plannedWorkoutId,
    plannedWorkoutId,
    threadId,
    chatId: threadId,
    scheduledAt: schedRaw ? new Date(schedRaw) : undefined,
    muscles: Array.isArray(data.muscleGroups)
      ? (data.muscleGroups as string[])
      : Array.isArray(data.trainingTypes)
        ? (data.trainingTypes as string[])
        : undefined,
    badgeName: (data.badgeName as string) || undefined,
    streakCount: typeof data.streakDays === 'number' ? data.streakDays : undefined,
    dbType: row.type,
    dataPayload: data,
    isFromServer: true,
  };
}
