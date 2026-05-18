import {create} from 'zustand';
import {
  listFriendsWithProfiles,
  removeFriendship,
  type PublicProfile,
} from '@/services/supabase/friendService';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoPayload} from '@/demo/buildDemoPayload';

type FriendState = {
  friends: PublicProfile[];
  friendIds: Set<string>;
  loading: boolean;
  lastLoadedUserId: string | null;
  version: number;
  load: (userId: string) => Promise<void>;
  removeFriend: (userId: string, otherId: string) => Promise<void>;
  reset: () => void;
  bump: () => void;
};

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  friendIds: new Set(),
  loading: false,
  lastLoadedUserId: null,
  version: 0,

  load: async (userId: string) => {
    if (!userId) {
      set({
        friends: [],
        friendIds: new Set(),
        lastLoadedUserId: null,
        version: get().version + 1,
      });
      return;
    }
    if (isDemoContentMode()) {
      const d = buildDemoPayload(userId);
      set({
        friends: d.friends,
        friendIds: new Set(d.friends.map(f => f.id)),
        lastLoadedUserId: userId,
        version: get().version + 1,
        loading: false,
      });
      return;
    }
    set({loading: true});
    try {
      const list = await listFriendsWithProfiles(userId);
      const friendIds = new Set(list.map(f => f.id));
      set({
        friends: list,
        friendIds,
        lastLoadedUserId: userId,
        version: get().version + 1,
        loading: false,
      });
    } catch {
      set({loading: false});
    }
  },

  removeFriend: async (userId: string, otherId: string) => {
    const prevFriends = get().friends;
    const prevIds = new Set(get().friendIds);
    const prevVersion = get().version;
    set({
      friends: prevFriends.filter(f => f.id !== otherId),
      friendIds: new Set([...prevIds].filter(id => id !== otherId)),
      version: prevVersion + 1,
    });
    try {
      await removeFriendship(userId, otherId);
    } catch (e) {
      set({
        friends: prevFriends,
        friendIds: prevIds,
        version: prevVersion + 1,
      });
      throw e;
    }
    try {
      await get().load(userId);
    } catch {
      // Bevar optimistisk liste hvis refetch fejler – venskab er allerede fjernet i DB
    }
  },

  reset: () =>
    set({
      friends: [],
      friendIds: new Set(),
      lastLoadedUserId: null,
      version: 0,
    }),

  bump: () => set({version: get().version + 1}),
}));
