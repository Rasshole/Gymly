import {useMemo, useCallback} from 'react';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import type {PublicProfile} from '@/services/supabase/friendService';

/**
 * Fælles kilde: accepterede venner ligger i friendStore
 * (synket fra public.friendships + profiles).
 * friendCount = acceptedFriends.length når listen er for den nuværende bruger.
 */
export function useFriends() {
  const userId = useAppStore(s => s.user?.id);
  const lastLoaded = useFriendStore(s => s.lastLoadedUserId);
  const list = useFriendStore(s => s.friends);
  const version = useFriendStore(s => s.version);
  const load = useFriendStore(s => s.load);
  const removeFriend = useFriendStore(s => s.removeFriend);

  const forCurrentUser = Boolean(userId && lastLoaded === userId);

  const acceptedFriends: PublicProfile[] = useMemo(
    () => (forCurrentUser ? list : []),
    [forCurrentUser, list],
  );

  const friendCount = forCurrentUser ? list.length : null;

  const refetchFriends = useCallback(async () => {
    if (userId) {
      await load(userId);
    }
  }, [userId, load]);

  return {
    acceptedFriends,
    friendCount,
    forCurrentUser,
    hasSyncedFriendList: forCurrentUser,
    refetchFriends,
    removeFriend,
    listVersion: version,
  };
}
