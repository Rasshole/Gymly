import {create} from 'zustand';
import {
  fetchBlockedUserIds,
  blockUser as blockUserRpc,
  unblockUser as unblockUserRpc,
} from '@/services/supabase/userBlockService';
import {useFriendStore} from '@/store/friendStore';
import {clearBicepsDmThreadCache} from '@/services/notifications/notificationBicepsDm';

type BlockState = {
  blockedIds: Set<string>;
  version: number;
  lastLoadedUserId: string | null;
  loading: boolean;
  load: (userId: string) => Promise<void>;
  /** Optimistic local exclusion (e.g. after successful block RPC). */
  markBlocked: (otherUserId: string) => void;
  markUnblocked: (otherUserId: string) => void;
  reset: () => void;
};

export const useBlockStore = create<BlockState>((set, get) => ({
  blockedIds: new Set(),
  version: 0,
  lastLoadedUserId: null,
  loading: false,

  load: async (userId: string) => {
    if (!userId) {
      set({
        blockedIds: new Set(),
        lastLoadedUserId: null,
        version: get().version + 1,
        loading: false,
      });
      return;
    }
    set({loading: true});
    try {
      const blockedIds = await fetchBlockedUserIds(userId);
      set({
        blockedIds,
        lastLoadedUserId: userId,
        version: get().version + 1,
        loading: false,
      });
    } catch {
      set({loading: false});
    }
  },

  markBlocked: (otherUserId: string) => {
    if (!otherUserId) {
      return;
    }
    const next = new Set(get().blockedIds);
    next.add(otherUserId);
    set({blockedIds: next, version: get().version + 1});
  },

  markUnblocked: (otherUserId: string) => {
    if (!otherUserId) {
      return;
    }
    const next = new Set(get().blockedIds);
    next.delete(otherUserId);
    set({blockedIds: next, version: get().version + 1});
  },

  reset: () =>
    set({
      blockedIds: new Set(),
      lastLoadedUserId: null,
      version: get().version + 1,
      loading: false,
    }),
}));

/**
 * Block + sync local exclusion. Friendship / pending requests are cleared by
 * the `block_user` RPC and are not restored on unblock.
 */
export async function blockUserAndSync(
  otherUserId: string,
  currentUserId?: string,
): Promise<void> {
  await blockUserRpc(otherUserId);
  useBlockStore.getState().markBlocked(otherUserId);
  clearBicepsDmThreadCache(otherUserId);
  const uid = currentUserId ?? useBlockStore.getState().lastLoadedUserId;
  if (uid) {
    void useFriendStore.getState().load(uid);
  }
}

/**
 * Unblock + refresh mutual block set (keeps inbound blocks if the other user
 * still blocks you). Does not recreate friendships or friend requests.
 */
export async function unblockUserAndSync(
  otherUserId: string,
  currentUserId?: string,
): Promise<void> {
  await unblockUserRpc(otherUserId);
  const uid = currentUserId ?? useBlockStore.getState().lastLoadedUserId;
  if (uid) {
    await useBlockStore.getState().load(uid);
  } else {
    useBlockStore.getState().markUnblocked(otherUserId);
  }
}
