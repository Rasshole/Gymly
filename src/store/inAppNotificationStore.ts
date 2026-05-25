import {create} from 'zustand';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {logRealtimeEvent, logRealtimeStore} from '@/realtime/realtimeDebug';
import {
  fetchInAppNotifications,
  markInAppNotificationRead,
  markAllInAppRead,
  type NotificationRow,
} from '@/services/notifications/inAppNotificationService';
import {useNotificationStore} from '@/store/notificationStore';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';
import {
  countBellUnreadFromRows,
  setAppIconBadgeCount,
  syncAppIconBadgeFromRows,
} from '@/services/push/appIconBadge';

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
    setAppIconBadgeCount(0);
  },

  refresh: async (userId: string) => {
    if (!userId) {
      get().reset();
      return;
    }
    if (isDemoContentMode()) {
      const d = buildDemoPayload(userId);
      const frP = d.notificationRows.filter(
        r => r.type === 'friend_request' && !r.is_read,
      ).length;
      const nextRows = d.notificationRows;
      const bellUnread = countBellUnreadFromRows(nextRows);
      set(state => ({
        rows: nextRows,
        dbUnread: bellUnread,
        loadedUserId: userId,
        friendRequestOutcomes: state.friendRequestOutcomes,
      }));
      syncAppIconBadgeFromRows(nextRows);
      useNotificationStore.getState().setIncomingFriendRequestCount(frP);
      return;
    }
    const data = await fetchInAppNotifications(userId);
    const bellUnread = countBellUnreadFromRows(data);
    set(state => ({
      rows: data,
      dbUnread: bellUnread,
      loadedUserId: userId,
      friendRequestOutcomes: state.friendRequestOutcomes,
    }));
    syncAppIconBadgeFromRows(data);
    const frP = data.filter(
      r => r.type === 'friend_request' && !r.is_read,
    ).length;
    useNotificationStore.getState().setIncomingFriendRequestCount(frP);
  },

  setFriendRequestOutcome: (notifId, outcome, peerName) => {
    set(state => {
      const nextRows = state.rows.map(r =>
        r.id === notifId && r.type === 'friend_request'
          ? {...r, is_read: true}
          : r,
      );
      const frP = nextRows.filter(
        r => r.type === 'friend_request' && !r.is_read,
      ).length;
      useNotificationStore.getState().setIncomingFriendRequestCount(frP);
      const patch = {
        rows: nextRows,
        friendRequestOutcomes: {
          ...state.friendRequestOutcomes,
          [notifId]: {outcome, peerName},
        },
        dbUnread: countBellUnreadFromRows(nextRows),
      };
      syncAppIconBadgeFromRows(nextRows);
      return patch;
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
      const next = state.rows.filter(r => r.id !== notifId);
      const outcomes = {...state.friendRequestOutcomes};
      delete outcomes[notifId];
      const frP = next.filter(
        r => r.type === 'friend_request' && !r.is_read,
      ).length;
      useNotificationStore.getState().setIncomingFriendRequestCount(frP);
      const patch = {
        rows: next,
        friendRequestOutcomes: outcomes,
        dbUnread: countBellUnreadFromRows(next),
      };
      syncAppIconBadgeFromRows(next);
      return patch;
    });
  },

  markRead: async (id, userId) => {
    set(state => {
      const next = state.rows.map(r => (r.id === id ? {...r, is_read: true} : r));
      const bellUnread = countBellUnreadFromRows(next);
      syncAppIconBadgeFromRows(next);
      return {rows: next, dbUnread: bellUnread};
    });
    try {
      await markInAppNotificationRead(id, userId);
    } catch {
      void get().refresh(userId);
    }
  },

  markAllRead: async userId => {
    set(state => ({
      rows: state.rows.map(r => ({...r, is_read: true})),
      dbUnread: 0,
      friendRequestOutcomes: state.friendRequestOutcomes,
    }));
    setAppIconBadgeCount(0);
    await markAllInAppRead(userId);
    set(state => ({
      rows: state.rows.map(r => ({...r, is_read: true})),
      dbUnread: 0,
      friendRequestOutcomes: state.friendRequestOutcomes,
    }));
    setAppIconBadgeCount(0);
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
          const bellUnread = countBellUnreadFromRows(nextRows);
          const frP = nextRows.filter(
            r => r.type === 'friend_request' && !r.is_read,
          ).length;
          useNotificationStore.getState().setIncomingFriendRequestCount(frP);
          syncAppIconBadgeFromRows(nextRows);
          return {rows: nextRows, dbUnread: bellUnread};
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

