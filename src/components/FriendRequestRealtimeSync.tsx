/**
 * Nye venneanmodninger (INSERT) + opdatering (accepter/afvis) uden at polle.
 * Klokke-badge + samme in-app række som notifikationer.
 */

import React, {useEffect} from 'react';
import {supabase} from '@/services/supabase/supabaseClient';
import {useAppStore} from '@/store/appStore';
import {useNotificationStore} from '@/store/notificationStore';
import {listPendingIncomingRequests} from '@/services/supabase/friendService';
import {syncDmInboxToStore} from '@/services/supabase/dmInboxSync';
import {useFriendStore} from '@/store/friendStore';

export function FriendRequestRealtimeSync() {
  const userId = useAppStore(s => s.user?.id);
  const setIncoming = useNotificationStore(s => s.setIncomingFriendRequestCount);
  const loadFriends = useFriendStore(s => s.load);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const refreshCount = () => {
      void listPendingIncomingRequests(userId)
        .then(rows => setIncoming(rows.length))
        .catch(() => {});
    };

    const syncFriendList = () => {
      void loadFriends(userId);
      const dn =
        useAppStore.getState().user?.displayName?.trim() || 'Bruger';
      void syncDmInboxToStore(userId, dn).catch(() => {});
    };

    refreshCount();

    const channel = supabase
      .channel(`friend_requests_rt:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${userId}`,
        },
        () => {
          refreshCount();
          syncFriendList();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `from_user_id=eq.${userId}`,
        },
        () => {
          refreshCount();
          syncFriendList();
        },
      )
      .subscribe();

    const chFriendships = supabase
      .channel(`friendships_rt:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_a=eq.${userId}`,
        },
        () => {
          refreshCount();
          syncFriendList();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_b=eq.${userId}`,
        },
        () => {
          refreshCount();
          syncFriendList();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(chFriendships);
    };
  }, [userId, setIncoming, loadFriends]);

  return null;
}
