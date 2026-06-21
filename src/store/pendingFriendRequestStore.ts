import {create} from 'zustand';
import {
  acceptFriendRequest,
  declineFriendRequest,
  listPendingIncomingRequests,
  type PublicProfile,
} from '@/services/supabase/friendService';
import {useNotificationStore} from '@/store/notificationStore';
import {useFriendStore} from '@/store/friendStore';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {DEMO_PROFILES} from '@/demo/demoPersonas';

export type PendingFriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
  fromProfile?: PublicProfile;
};

type PendingFriendRequestState = {
  pending: PendingFriendRequest[];
  loading: boolean;
  sheetVisible: boolean;
  busyRequestId: string | null;
  loadedUserId: string | null;
  load: (userId: string) => Promise<void>;
  openSheet: () => void;
  closeSheet: () => void;
  accept: (userId: string, requestId: string) => Promise<void>;
  decline: (userId: string, requestId: string) => Promise<void>;
  reset: () => void;
};

function demoPendingRequests(userId: string): PendingFriendRequest[] {
  const sender = DEMO_PROFILES[10];
  if (!sender) {
    return [];
  }
  return [
    {
      id: 'demo-pending-fr-1',
      fromUserId: sender.id,
      toUserId: userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      fromProfile: {
        id: sender.id,
        username: sender.username,
        displayName: sender.displayName,
        avatarUrl: sender.avatarUrl ?? null,
      },
    },
  ];
}

function applyCount(pending: PendingFriendRequest[]): void {
  useNotificationStore.getState().setIncomingFriendRequestCount(pending.length);
}

export const usePendingFriendRequestStore = create<PendingFriendRequestState>(
  (set, get) => ({
    pending: [],
    loading: false,
    sheetVisible: false,
    busyRequestId: null,
    loadedUserId: null,

    load: async (userId: string) => {
      if (!userId) {
        get().reset();
        return;
      }
      if (isDemoContentMode()) {
        const pending = demoPendingRequests(userId);
        applyCount(pending);
        set({pending, loadedUserId: userId, loading: false});
        return;
      }
      set({loading: true});
      try {
        const rows = await listPendingIncomingRequests(userId);
        const pending = rows as PendingFriendRequest[];
        applyCount(pending);
        set({pending, loadedUserId: userId, loading: false});
      } catch {
        set({loading: false});
      }
    },

    openSheet: () => set({sheetVisible: true}),
    closeSheet: () => set({sheetVisible: false}),

    accept: async (userId: string, requestId: string) => {
      set({busyRequestId: requestId});
      const prev = get().pending;
      const next = prev.filter(r => r.id !== requestId);
      applyCount(next);
      set({pending: next});
      try {
        await acceptFriendRequest(requestId);
        void useFriendStore.getState().load(userId);
        void get().load(userId);
      } catch (e) {
        applyCount(prev);
        set({pending: prev});
        throw e;
      } finally {
        set({busyRequestId: null});
      }
    },

    decline: async (userId: string, requestId: string) => {
      set({busyRequestId: requestId});
      const prev = get().pending;
      const next = prev.filter(r => r.id !== requestId);
      applyCount(next);
      set({pending: next});
      try {
        await declineFriendRequest(requestId);
        void get().load(userId);
      } catch (e) {
        applyCount(prev);
        set({pending: prev});
        throw e;
      } finally {
        set({busyRequestId: null});
      }
    },

    reset: () => {
      applyCount([]);
      set({
        pending: [],
        loading: false,
        sheetVisible: false,
        busyRequestId: null,
        loadedUserId: null,
      });
    },
  }),
);
