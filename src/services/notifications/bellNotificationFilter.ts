import type {InAppNotificationType} from '@/services/notifications/inAppNotificationService';
import type {NotificationType} from '@/types/notification.types';

type BellType = InAppNotificationType | NotificationType | string;

const NON_BELL_TYPES = new Set<string>([
  'dm_message',
  'message',
  'gymly_group_message',
]);

export function isBellNotification(type: BellType): boolean {
  return !NON_BELL_TYPES.has(String(type || '').trim());
}

