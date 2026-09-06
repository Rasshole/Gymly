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
  enabled?: boolean;
}

export function useOnlineUsers(
  userId: string | undefined,
  options: UseOnlineUsersOptions = {},
) {
  const filter = options.filter ?? 'venner';
  const enabled = options.enabled ?? true;
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
    if (!enabled) {
      return;
    }
    void refresh();
  }, [refresh, friendVersion, enabled]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    return subscribeCheckInsPresence(() => {
      void refresh();
    });
  }, [userId, refresh, enabled]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    const id = setInterval(() => {
      void refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [userId, refresh, enabled]);

  return {users, loading, refresh};
}
