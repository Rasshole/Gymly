import {create} from 'zustand';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {logRealtimeEvent, logRealtimeStore} from '@/realtime/realtimeDebug';
import {
  fetchInAppNotifications,
  getUnreadInAppCount,
  markInAppNotificationRead,
  markAllInAppRead,
  type NotificationRow,
} from '@/services/notifications/inAppNotificationService';
import {useNotificationStore} from '@/store/notificationStore';

export type FriendRequestOutcomeMap = Record<
  string,
  {outcome: 'accepted' | 'declined'; peerName: string}
>;

type InAppState = {
  rows: NotificationRow[];
  dbUnread: number;
  loadedUserId: string | null;
  /** Optimistisk UX efter accept/afvis (nøgle = notification id) */
  friendRequestOutcomes: FriendRequestOutcomeMap;
  setRows: (r: NotificationRow[], uid: string) => void;
  reset: () => void;
  refresh: (userId: string) => Promise<void>;
  markRead: (id: string, userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  setFriendRequestOutcome: (
    notifId: string,
    outcome: 'accepted' | 'declined',
    peerName: string,
  ) => void;
  clearFriendRequestOutcome: (notifId: string) => void;
  /** Fjerner én række (optimistisk ved sletning) */
  removeInAppRowById: (notifId: string) => void;
};

export const useInAppNotificationStore = create<InAppState>((set, get) => ({
  rows: [],
  dbUnread: 0,
  loadedUserId: null,
  friendRequestOutcomes: {},

  setRows: (r, uid) => set({rows: r, loadedUserId: uid}),

  reset: () => {
    set({rows: [], dbUnread: 0, loadedUserId: null, friendRequestOutcomes: {}});
  },

  refresh: async (userId: string) => {
    if (!userId) {
      get().reset();
      return;
    }
    const [data, c] = await Promise.all([
      fetchInAppNotifications(userId),
      getUnreadInAppCount(userId),
    ]);
    set(state => ({
      rows: data,
      dbUnread: c,
      loadedUserId: userId,
      friendRequestOutcomes: state.friendRequestOutcomes,
    }));
    const frP = data.filter(
      r => r.type === 'friend_request' && !r.is_read,
    ).length;
    useNotificationStore.getState().setIncomingFriendRequestCount(frP);
  },

  setFriendRequestOutcome: (notifId, outcome, peerName) => {
    set(state => {
      const prev = state.rows.find(r => r.id === notifId);
      const wasUnread = prev && !prev.is_read;
      const nextRows = state.rows.map(r =>
        r.id === notifId && r.type === 'friend_request'
          ? {...r, is_read: true}
          : r,
      );
      const frP = nextRows.filter(
        r => r.type === 'friend_request' && !r.is_read,
      ).length;
      useNotificationStore.getState().setIncomingFriendRequestCount(frP);
      return {
        rows: nextRows,
        friendRequestOutcomes: {
          ...state.friendRequestOutcomes,
          [notifId]: {outcome, peerName},
        },
        dbUnread: wasUnread ? Math.max(0, state.dbUnread - 1) : state.dbUnread,
      };
    });
  },

  clearFriendRequestOutcome: notifId => {
    set(state => {
      const rest = {...state.friendRequestOutcomes};
      delete rest[notifId];
      return {friendRequestOutcomes: rest};
    });
  },

  removeInAppRowById: notifId => {
    set(state => {
      const row = state.rows.find(r => r.id === notifId);
      const wasUnread = row && !row.is_read;
      const next = state.rows.filter(r => r.id !== notifId);
      const outcomes = {...state.friendRequestOutcomes};
      delete outcomes[notifId];
      const frP = next.filter(
        r => r.type === 'friend_request' && !r.is_read,
      ).length;
      useNotificationStore.getState().setIncomingFriendRequestCount(frP);
      return {
        rows: next,
        friendRequestOutcomes: outcomes,
        dbUnread: wasUnread ? Math.max(0, state.dbUnread - 1) : state.dbUnread,
      };
    });
  },

  markRead: async (id, userId) => {
    await markInAppNotificationRead(id, userId);
    set(state => {
      const was = state.rows.find(r => r.id === id);
      const wasUnread = was && !was.is_read;
      const next = state.rows.map(r => (r.id === id ? {...r, is_read: true} : r));
      const frP = next.filter(
        r => r.type === 'friend_request' && !r.is_read,
      ).length;
      useNotificationStore.getState().setIncomingFriendRequestCount(frP);
      return {
        rows: next,
        dbUnread: wasUnread ? Math.max(0, state.dbUnread - 1) : state.dbUnread,
      };
    });
  },

  markAllRead: async userId => {
    await markAllInAppRead(userId);
    set(state => ({
      rows: state.rows.map(r => ({...r, is_read: true})),
      dbUnread: 0,
      friendRequestOutcomes: state.friendRequestOutcomes,
    }));
    useNotificationStore.getState().setIncomingFriendRequestCount(0);
  },
}));

/**
 * Tilsluttes én fælles GymlyRealtimeHub-kanal (ingen duplikat subscriptions).
 */
export function attachInAppNotificationsToHubChannel(
  channel: RealtimeChannel,
  userId: string,
): RealtimeChannel {
  return channel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      payload => {
        logRealtimeEvent('notifications', 'notifications', 'INSERT', userId);
        const n = payload.new as NotificationRow;
        useInAppNotificationStore.setState(state => {
          if (state.rows.some(p => p.id === n.id)) {
            return state;
          }
          const nextRows = [n, ...state.rows];
          const nextUnread = n.is_read ? state.dbUnread : state.dbUnread + 1;
          const frP = nextRows.filter(
            r => r.type === 'friend_request' && !r.is_read,
          ).length;
          useNotificationStore.getState().setIncomingFriendRequestCount(frP);
          return {rows: nextRows, dbUnread: nextUnread};
        });
        logRealtimeStore('notifications', 'insert_row');
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        logRealtimeEvent('notifications', 'notifications', 'UPDATE', userId);
        useInAppNotificationStore.getState().refresh(userId).catch(() => {});
        logRealtimeStore('notifications', 'refresh_after_update');
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      payload => {
        logRealtimeEvent('notifications', 'notifications', 'DELETE', userId);
        const oldId = (payload.old as {id?: string})?.id;
        if (oldId) {
          useInAppNotificationStore.getState().removeInAppRowById(oldId);
          logRealtimeStore('notifications', 'remove_row');
        }
      },
    );
}

