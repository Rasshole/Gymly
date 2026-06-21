import {NativeModules, Platform} from 'react-native';
import type {NotificationRow} from '@/services/notifications/inAppNotificationService';
import {isBellNotification} from '@/services/notifications/bellNotificationFilter';
import {isSuppressedRankingNotificationRow} from '@/config/launchSurfaceConfig';

type GymlyAppBadgeNative = {
  setBadgeCount: (count: number) => void;
};

const nativeBadge: GymlyAppBadgeNative | undefined =
  NativeModules.GymlyAppBadgeModule as GymlyAppBadgeNative | undefined;

/** Matches in-app bell badge (NotificationsScreen / header). */
export function countBellUnreadFromRows(rows: NotificationRow[]): number {
  let unread = 0;
  for (const row of rows) {
    if (isSuppressedRankingNotificationRow(row.type)) {
      continue;
    }
    if (!row.is_read && isBellNotification(row.type)) {
      unread += 1;
    }
  }
  return unread;
}

/**
 * Sync home-screen app icon badge with unread bell notifications.
 * iOS only — Android launcher badges vary by OEM.
 */
export function setAppIconBadgeCount(count: number): void {
  const safe = Math.max(0, Math.floor(count));
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    nativeBadge?.setBadgeCount?.(safe);
  } catch (e) {
    if (__DEV__) {
      console.warn('[appIconBadge] setBadgeCount failed', e);
    }
  }
}

export function syncAppIconBadgeFromRows(rows: NotificationRow[]): void {
  setAppIconBadgeCount(countBellUnreadFromRows(rows));
}

/** App-ikon badge = kun pending venneanmodninger (matcher klokke i header). */
export function syncAppIconBadgeFriendRequestCount(count: number): void {
  setAppIconBadgeCount(count);
}
