import {useMemo} from 'react';
import {
  applyLocalFriendRequestResolution,
  mapRowToViewNotification,
} from '@/services/notifications/notificationMappers';
import {isBellNotification} from '@/services/notifications/bellNotificationFilter';
import type {Notification} from '@/types/notification.types';
import {useAppStore} from '@/store/appStore';
import {useNotificationStore} from '@/store/notificationStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import {isSuppressedRankingNotificationRow} from '@/config/launchSurfaceConfig';

function normalizeNotification(n: Notification): Notification {
  const raw = n.timestamp as unknown;
  let timestamp: Date;
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    timestamp = raw;
  } else if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    timestamp = Number.isFinite(d.getTime()) ? d : new Date();
  } else {
    timestamp = new Date();
  }
  const id =
    n.id != null && String(n.id).trim().length > 0
      ? String(n.id)
      : `notif_${timestamp.getTime()}_${Math.random().toString(36).slice(2, 9)}`;
  return {...n, id, timestamp};
}

function notificationSortKey(n: Notification): number {
  const t = n.timestamp;
  if (t instanceof Date && Number.isFinite(t.getTime())) {
    return t.getTime();
  }
  return 0;
}

type Result = {
  listForUi: Notification[];
  dbUnread: number;
  refetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

/**
 * Sammenstiller Supabase in-app (store) + lokale (workout/besked) notifikationer.
 */
export function useInAppNotifications(): Result {
  const userId = useAppStore(s => s.user?.id);
  const rows = useInAppNotificationStore(s => s.rows);
  const frOutcomes = useInAppNotificationStore(s => s.friendRequestOutcomes);
  const refresh = useInAppNotificationStore(s => s.refresh);
  const markR = useInAppNotificationStore(s => s.markRead);
  const markAllR = useInAppNotificationStore(s => s.markAllRead);
  const localN = useNotificationStore(s => s.notifications);

  const fromDb: Notification[] = useMemo(() => {
    const out: Notification[] = [];
    for (const r of rows) {
      if (isSuppressedRankingNotificationRow(r.type)) {
        continue;
      }
      try {
        let n = mapRowToViewNotification(r);
        const o = n.id ? frOutcomes[n.id] : undefined;
        if (n.type === 'friend_request' && o) {
          n = applyLocalFriendRequestResolution(n, o);
        }
        out.push(normalizeNotification(n));
      } catch (e) {
        if (__DEV__) {
          console.warn('[useInAppNotifications] skipped bad notification row', e, r?.id);
        }
      }
    }
    return out;
  }, [rows, frOutcomes]);

  const listForUi: Notification[] = useMemo(() => {
    const bellDbRows = fromDb.filter(n => isBellNotification(n.type));
    const localOnly = localN
      .filter(
        n =>
          n.type === 'workout_invite' ||
          n.type === 'invite_response',
      )
      .filter(n => isBellNotification(n.type))
      .map(n => normalizeNotification(n));
    return [...bellDbRows, ...localOnly].sort(
      (a, b) => notificationSortKey(b) - notificationSortKey(a),
    );
  }, [fromDb, localN]);

  const dbUnread = useMemo(() => {
    let unread = 0;
    for (const r of rows) {
      if (isSuppressedRankingNotificationRow(r.type)) {
        continue;
      }
      if (!r.is_read && isBellNotification(r.type)) {
        unread += 1;
      }
    }
    return unread;
  }, [rows]);

  const markRead = (id: string) => (userId ? markR(id, userId) : Promise.resolve());
  const markAllRead = () => (userId ? markAllR(userId) : Promise.resolve());

  return {
    listForUi,
    /** Ulæst klok-badge: kun Supabase notifications (user_id + is_read=false). */
    dbUnread,
    refetch: () => (userId ? refresh(userId) : Promise.resolve()),
    markRead,
    markAllRead,
  };
}
