import type {NotificationRow, InAppNotificationType} from '@/services/notifications/inAppNotificationService';
import type {Notification, NotificationType} from '@/types/notification.types';
import {getRuntimeLanguage} from '@/i18n/runtimeLanguage';
import {formatSocialNotificationBody} from '@/services/notifications/socialNotificationCopy';
import {safeDisplayName} from '@/utils/displayName';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {detectGymChain} from '@/services/gymLogoService';
import {getMessagePreview} from '@/utils/dmMessagePreview';

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
    case 'workout_reaction':
      return 'workout_reaction';
    case 'biceps_reaction':
    case 'post_like':
      return 'biceps_reaction';
    case 'post_comment':
      return 'message';
    case 'comment_like':
      return 'biceps_reaction';
    case 'gymly_group_invite':
    case 'gymly_group_invite_declined':
      return 'group_invite';
    case 'gymly_group_member_joined':
    case 'gymly_group_message':
    case 'gymly_planned_in_group':
    case 'gymly_group_check_in':
      return 'friend_checkin';
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
  const createdRaw =
    row.created_at != null && String(row.created_at).trim().length > 0
      ? String(row.created_at)
      : new Date().toISOString();
  const createdAt = new Date(createdRaw);
  const safeCreated = Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
  const rowId =
    row.id != null && String(row.id).length > 0
      ? String(row.id)
      : `notif_${safeCreated.getTime()}`;

  const data = row.data ?? {};
  const fId = (data.friendRequestId as string) || undefined;
  const actorName =
    safeDisplayName(
      data.friendName as string | undefined,
      data.actorName as string | undefined,
      data.displayName as string | undefined,
    ) || 'Ukendt bruger';
  const plannedWorkoutId =
    (data.plannedWorkoutId as string) ||
    (data.planned_workout_id as string) ||
    undefined;
  const threadId =
    (data.threadId as string) || (data.conversationId as string) || undefined;
  const schedRaw = data.scheduledAt as string | undefined;
  const groupId =
    (data.groupId as string) || (data.group_id as string) || undefined;
  const groupName = (data.groupName as string) || undefined;
  const centerNameRaw = ((data.centerName as string) || '').trim();
  const inferredBrand = centerNameRaw
    ? detectGymChain(undefined, centerNameRaw).displayName
    : '';
  const formattedCenterName = centerNameRaw
    ? formatGymNameWithBrand(centerNameRaw, inferredBrand)
    : undefined;
  const socialBody = formatSocialNotificationBody(getRuntimeLanguage(), {
    type: row.type,
    actorName:
      (data.actorName as string) ||
      actorName ||
      undefined,
    likeCount:
      typeof data.likeCount === 'number'
        ? data.likeCount
        : typeof data.likeCount === 'string'
          ? parseInt(data.likeCount, 10)
          : undefined,
    grouped: Boolean(data.grouped),
  });

  const displayBody =
    row.type === 'dm_message'
      ? getMessagePreview({text: row.body ?? ''})
      : socialBody || (row.body ?? '');

  return {
    id: rowId,
    type: mapType(row.type),
    title: (row.title ?? 'Notifikation').trim() || 'Notifikation',
    message: displayBody,
    read: row.is_read,
    timestamp: safeCreated,
    groupId,
    groupName,
    friendName: actorName,
    friendId: row.actor_user_id || (data.friendUserId as string) || undefined,
    friendRequestId: fId,
    checkInTime: safeCreated,
    gymName: formattedCenterName,
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
    badgeId: (data.badgeId as string) || undefined,
    streakCount: typeof data.streakDays === 'number' ? data.streakDays : undefined,
    dbType: row.type,
    checkInId: (data.checkInId as string) || undefined,
    dataPayload: data,
    isFromServer: true,
  };
}
