/**
 * useOnlineUsers – hook for online/active users
 * Uses OnlineUsersService (mock or Firestore)
 */

import {useState, useEffect, useCallback} from 'react';
import {getOnlineUsers} from '@/services/data/OnlineUsersService';
import type {OnlineUser} from '@/types/online.types';

export interface UseOnlineUsersOptions {
  filter?: 'alle' | 'venner';
}

export function useOnlineUsers(
  userId: string | undefined,
  options: UseOnlineUsersOptions = {}
) {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const data = await getOnlineUsers(userId, options);
    setUsers(data);
    setLoading(false);
  }, [userId, options.filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {users, loading, refresh};
}
