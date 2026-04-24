import {useMemo} from 'react';
import {
  applyLocalFriendRequestResolution,
  mapRowToViewNotification,
} from '@/services/notifications/notificationMappers';
import type {Notification} from '@/types/notification.types';
import {useAppStore} from '@/store/appStore';
import {useNotificationStore} from '@/store/notificationStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';

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
  const dbUnread = useInAppNotificationStore(s => s.dbUnread);
  const refresh = useInAppNotificationStore(s => s.refresh);
  const markR = useInAppNotificationStore(s => s.markRead);
  const markAllR = useInAppNotificationStore(s => s.markAllRead);
  const localN = useNotificationStore(s => s.notifications);

  const fromDb: Notification[] = useMemo(
    () =>
      rows.map(r => {
        const n = mapRowToViewNotification(r);
        const o = n.id ? frOutcomes[n.id] : undefined;
        if (n.type === 'friend_request' && o) {
          return applyLocalFriendRequestResolution(n, o);
        }
        return n;
      }),
    [rows, frOutcomes],
  );

  const listForUi: Notification[] = useMemo(() => {
    const localOnly = localN.filter(
      n =>
        n.type === 'workout_invite' ||
        n.type === 'message' ||
        n.type === 'invite_response',
    );
    return [...fromDb, ...localOnly].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }, [fromDb, localN]);

  const markRead = (id: string) => (userId ? markR(id, userId) : Promise.resolve());
  const markAllRead = () => (userId ? markAllR(userId) : Promise.resolve());

  const unreadBell = useMemo(() => {
    const localU = localN.filter(
      n =>
        (n.type === 'workout_invite' || n.type === 'message' || n.type === 'invite_response') &&
        !n.read,
    ).length;
    return dbUnread + localU;
  }, [dbUnread, localN]);

  return {
    listForUi,
    /** I alt ulæst (klok) – DB + lokale invite/besked */
    dbUnread: unreadBell,
    refetch: () => (userId ? refresh(userId) : Promise.resolve()),
    markRead,
    markAllRead,
  };
}
