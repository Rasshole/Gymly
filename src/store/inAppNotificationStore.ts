import {create} from 'zustand';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {logRealtimeEvent, logRealtimeStore} from '@/realtime/realtimeDebug';
import {
  fetchInAppNotifications,
  markInAppNotificationRead,
  markAllInAppRead,
  type NotificationRow,
} from '@/services/notifications/inAppNotificationService';
import {
  applyOptimisticFriendRequestResolution,
  resolveFriendRequestNotifications,
  type FriendRequestResolutionMap,
} from '@/services/notifications/resolveFriendRequestNotificationStatuses';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {
  countBellUnreadFromRows,
  syncAppIconBadgeFromRows,
} from '@/services/push/appIconBadge';

export type {FriendRequestResolutionMap};

type InAppState = {
  rows: NotificationRow[];
  dbUnread: number;
  loadedUserId: string | null;
  /** Server (+ optimistic) UI state per friend_request notification id */
  friendRequestResolutions: FriendRequestResolutionMap;
  /** Increments on each status resolve attempt; stale async results are dropped */
  friendRequestResolveGeneration: number;
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
  /** Mark all friend_request notifs for this request id (e.g. accept from Friends). */
  setFriendRequestOutcomeByRequestId: (
    requestId: string,
    outcome: 'accepted' | 'declined',
    peerName: string,
  ) => void;
  clearFriendRequestOutcome: (notifId: string) => void;
  /** Fjerner én række (optimistisk ved sletning) */
  removeInAppRowById: (notifId: string) => void;
};

async function resolveStatusesForRows(
  userId: string,
  rows: NotificationRow[],
  generation: number,
  get: () => InAppState,
  set: (
    partial:
      | Partial<InAppState>
      | ((state: InAppState) => Partial<InAppState>),
  ) => void,
): Promise<void> {
  const previous = get().friendRequestResolutions;
  const next = await resolveFriendRequestNotifications({
    userId,
    rows,
    previous,
  });
  if (get().friendRequestResolveGeneration !== generation) {
    return;
  }
  set({friendRequestResolutions: next});
}

export const useInAppNotificationStore = create<InAppState>((set, get) => ({
  rows: [],
  dbUnread: 0,
  loadedUserId: null,
  friendRequestResolutions: {},
  friendRequestResolveGeneration: 0,

  setRows: (r, uid) => {
    syncAppIconBadgeFromRows(r);
    set({rows: r, loadedUserId: uid});
  },

  reset: () => {
    syncAppIconBadgeFromRows([]);
    set({
      rows: [],
      dbUnread: 0,
      loadedUserId: null,
      friendRequestResolutions: {},
      friendRequestResolveGeneration: get().friendRequestResolveGeneration + 1,
    });
  },

  refresh: async (userId: string) => {
    if (!userId) {
      get().reset();
      return;
    }
    if (isDemoContentMode()) {
      // Lazy: buildDemoPayload → danishGyms → centers.json (~4MB); never at module load.
      const {buildDemoPayload} = require('@/demo/buildDemoPayload') as typeof import('@/demo/buildDemoPayload');
      const d = buildDemoPayload(userId);
      const nextRows = d.notificationRows;
      const bellUnread = countBellUnreadFromRows(nextRows);
      syncAppIconBadgeFromRows(nextRows);
      const generation = get().friendRequestResolveGeneration + 1;
      const previous = get().friendRequestResolutions;
      const demoResolutions: FriendRequestResolutionMap = {};
      for (const row of nextRows) {
        if (row.type !== 'friend_request') {
          continue;
        }
        const data = row.data ?? {};
        const requestId =
          typeof data.friendRequestId === 'string'
            ? data.friendRequestId
            : undefined;
        const peerName =
          (typeof data.friendName === 'string' && data.friendName) ||
          (typeof data.actorName === 'string' && data.actorName) ||
          '';
        const prev = previous[row.id];
        demoResolutions[row.id] =
          prev?.source === 'optimistic'
            ? prev
            : {
                uiState: 'pending',
                peerName,
                source: 'server',
                requestId,
              };
      }
      set({
        rows: nextRows,
        dbUnread: bellUnread,
        loadedUserId: userId,
        friendRequestResolveGeneration: generation,
        friendRequestResolutions: demoResolutions,
      });
      return;
    }
    const data = await fetchInAppNotifications(userId);
    const bellUnread = countBellUnreadFromRows(data);
    syncAppIconBadgeFromRows(data);
    const generation = get().friendRequestResolveGeneration + 1;
    set(state => ({
      rows: data,
      dbUnread: bellUnread,
      loadedUserId: userId,
      friendRequestResolveGeneration: generation,
      friendRequestResolutions: state.friendRequestResolutions,
    }));
    await resolveStatusesForRows(userId, data, generation, get, set);
  },

  setFriendRequestOutcome: (notifId, outcome, peerName) => {
    set(state => {
      const nextRows = state.rows.map(r =>
        r.id === notifId && r.type === 'friend_request'
          ? {...r, is_read: true}
          : r,
      );
      const resolutions = applyOptimisticFriendRequestResolution(
        state.friendRequestResolutions,
        nextRows,
        {notifId, outcome, peerName},
      );
      const patch = {
        rows: nextRows,
        friendRequestResolutions: resolutions,
        dbUnread: countBellUnreadFromRows(nextRows),
      };
      syncAppIconBadgeFromRows(nextRows);
      return patch;
    });
  },

  setFriendRequestOutcomeByRequestId: (requestId, outcome, peerName) => {
    set(state => {
      const nextRows = state.rows.map(r => {
        if (r.type !== 'friend_request') {
          return r;
        }
        const rid = (r.data ?? {}).friendRequestId;
        if (rid === requestId) {
          return {...r, is_read: true};
        }
        return r;
      });
      const resolutions = applyOptimisticFriendRequestResolution(
        state.friendRequestResolutions,
        nextRows,
        {requestId, outcome, peerName},
      );
      syncAppIconBadgeFromRows(nextRows);
      return {
        rows: nextRows,
        friendRequestResolutions: resolutions,
        dbUnread: countBellUnreadFromRows(nextRows),
      };
    });
  },

  clearFriendRequestOutcome: notifId => {
    set(state => {
      const rest = {...state.friendRequestResolutions};
      delete rest[notifId];
      return {friendRequestResolutions: rest};
    });
  },

  removeInAppRowById: notifId => {
    set(state => {
      const next = state.rows.filter(r => r.id !== notifId);
      const resolutions = {...state.friendRequestResolutions};
      delete resolutions[notifId];
      const patch = {
        rows: next,
        friendRequestResolutions: resolutions,
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
    set(state => {
      const next = state.rows.map(r => ({...r, is_read: true}));
      syncAppIconBadgeFromRows(next);
      return {
        rows: next,
        dbUnread: 0,
        friendRequestResolutions: state.friendRequestResolutions,
      };
    });
    await markAllInAppRead(userId);
    set(state => {
      syncAppIconBadgeFromRows(state.rows);
      return {
        rows: state.rows.map(r => ({...r, is_read: true})),
        dbUnread: 0,
        friendRequestResolutions: state.friendRequestResolutions,
      };
    });
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
          syncAppIconBadgeFromRows(nextRows);
          return {rows: nextRows, dbUnread: bellUnread};
        });
        // Re-resolve so a new friend_request gets correct pending/unknown state.
        if (n.type === 'friend_request') {
          void useInAppNotificationStore.getState().refresh(userId);
        }
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
