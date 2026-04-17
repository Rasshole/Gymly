/**
 * Online Users Service — aktivitet/online fra backend når integration er klar
 */

import type {OnlineUser} from '@/types/online.types';

export interface GetOnlineUsersOptions {
  filter?: 'alle' | 'venner';
}

export async function getOnlineUsers(
  _userId: string,
  _options: GetOnlineUsersOptions = {},
): Promise<OnlineUser[]> {
  return [];
}
