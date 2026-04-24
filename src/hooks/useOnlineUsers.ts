/**
 * useOnlineUsers – hook for online/active users
 * Uses OnlineUsersService (mock or Firestore)
 */

import {useState, useEffect, useCallback} from 'react';
import {getOnlineUsers} from '@/services/data/OnlineUsersService';
import type {OnlineUser} from '@/types/online.types';
import {subscribeCheckInsPresence} from '@/realtime/checkInsPresenceSubscription';
import {useFriendStore} from '@/store/friendStore';

export interface UseOnlineUsersOptions {
  filter?: 'alle' | 'venner';
}

export function useOnlineUsers(
  userId: string | undefined,
  options: UseOnlineUsersOptions = {}
) {
  const filter = options.filter ?? 'venner';
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const friendVersion = useFriendStore(s => s.version);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getOnlineUsers(userId, {filter});
    setUsers(data);
    setLoading(false);
  }, [userId, filter]);

  useEffect(() => {
    void refresh();
  }, [refresh, friendVersion]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refresh();
    });
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const id = setInterval(() => {
      void refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [userId, refresh]);

  return {users, loading, refresh};
}
