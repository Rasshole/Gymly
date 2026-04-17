/**
 * Notification Data Service — initial notifikationer fra backend
 */

import type {Notification} from '@/types/notification.types';

export async function getInitialNotifications(): Promise<
  Array<Omit<Notification, 'id' | 'timestamp' | 'read'> & {timestamp?: Date; read?: boolean}>
> {
  return [];
}
