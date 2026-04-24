import {create} from 'zustand';
import {supabase} from '@/services/supabase/supabaseClient';
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
  startRealtime: (userId: string) => () => void;
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

let realtimeCleanup: (() => void) | null = null;

export const useInAppNotificationStore = create<InAppState>((set, get) => ({
  rows: [],
  dbUnread: 0,
  loadedUserId: null,
  friendRequestOutcomes: {},

  setRows: (r, uid) => set({rows: r, loadedUserId: uid}),

  reset: () => {
    if (realtimeCleanup) {
      realtimeCleanup();
      realtimeCleanup = null;
    }
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
      const {[notifId]: _, ...rest} = state.friendRequestOutcomes;
      return {friendRequestOutcomes: rest};
    });
  },

  removeInAppRowById: notifId => {
    set(state => {
      const row = state.rows.find(r => r.id === notifId);
      const wasUnread = row && !row.is_read;
      const next = state.rows.filter(r => r.id !== notifId);
      const {[notifId]: _, ...outcomes} = state.friendRequestOutcomes;
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

  startRealtime: (userId: string) => {
    if (realtimeCleanup) {
      realtimeCleanup();
    }
    const ch = supabase
      .channel(`inapp_notif_store_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        payload => {
          const n = payload.new as NotificationRow;
          set(state => {
            if (state.rows.some(p => p.id === n.id)) {
              return state;
            }
            const nextRows = [n, ...state.rows];
            const nextUnread = n.is_read
              ? state.dbUnread
              : state.dbUnread + 1;
            const frP = nextRows.filter(
              r => r.type === 'friend_request' && !r.is_read,
            ).length;
            useNotificationStore.getState().setIncomingFriendRequestCount(frP);
            return {rows: nextRows, dbUnread: nextUnread};
          });
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
          void get()
            .refresh(userId)
            .catch(() => {});
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
          const oldId = (payload.old as {id?: string})?.id;
          if (oldId) {
            get().removeInAppRowById(oldId);
          }
        },
      )
      .subscribe();
    realtimeCleanup = () => {
      void supabase.removeChannel(ch);
      realtimeCleanup = null;
    };
    return () => {
      if (realtimeCleanup) {
        realtimeCleanup();
      }
    };
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
