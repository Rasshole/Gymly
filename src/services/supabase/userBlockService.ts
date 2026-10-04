import {supabase} from '@/services/supabase/supabaseClient';
import {withAvatarCacheBust} from '../../utils/avatar';

export {
  FRIEND_ACTION_UNAVAILABLE,
  FriendActionUnavailableError,
  isFriendActionUnavailableError,
  isBlockBackendMissingError,
} from '@/utils/userBlockErrors';

export type BlockedProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

/**
 * IDs of users in a block relationship with `currentUserId` (either direction).
 * Empty set if the table is missing or the query fails (search still works).
 */
export async function fetchBlockedUserIds(
  currentUserId: string,
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!currentUserId) {
    return blocked;
  }
  const {data, error} = await supabase
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`)
    .limit(500);

  if (error || !data) {
    if (__DEV__ && error) {
      console.warn('[userBlockService] fetchBlockedUserIds:', error.message);
    }
    return blocked;
  }

  for (const row of data as Array<{blocker_id?: string; blocked_id?: string}>) {
    const fromId = row.blocker_id;
    const toId = row.blocked_id;
    if (fromId === currentUserId && typeof toId === 'string' && toId) {
      blocked.add(toId);
    }
    if (toId === currentUserId && typeof fromId === 'string' && fromId) {
      blocked.add(fromId);
    }
  }
  return blocked;
}

/** Profiles I have blocked (outbound only — for Settings list). */
export async function fetchMyBlockedProfiles(
  currentUserId: string,
): Promise<BlockedProfile[]> {
  if (!currentUserId) {
    return [];
  }
  const {data: rows, error} = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', currentUserId)
    .order('created_at', {ascending: false})
    .limit(200);

  if (error || !rows?.length) {
    if (__DEV__ && error) {
      console.warn('[userBlockService] fetchMyBlockedProfiles:', error.message);
    }
    return [];
  }

  const ids = [
    ...new Set(
      (rows as Array<{blocked_id?: string}>)
        .map(r => r.blocked_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) {
    return [];
  }

  const {data: profiles, error: pErr} = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, updated_at')
    .in('id', ids);

  if (pErr || !profiles) {
    return ids.map(id => ({
      id,
      username: '',
      displayName: 'User',
      avatarUrl: null,
    }));
  }

  const byId = new Map(
    (
      profiles as Array<{
        id: string;
        username: string;
        display_name: string;
        avatar_url: string | null;
        updated_at?: string | null;
      }>
    ).map(p => [
      p.id,
      {
        id: p.id,
        username: p.username ?? '',
        displayName: (p.display_name || p.username || 'User').trim(),
        avatarUrl: withAvatarCacheBust(p.avatar_url, p.updated_at ?? null),
      } satisfies BlockedProfile,
    ]),
  );

  return ids.map(
    id =>
      byId.get(id) ?? {
        id,
        username: '',
        displayName: 'User',
        avatarUrl: null,
      },
  );
}

export async function usersAreBlocked(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (!userA || !userB || userA === userB) {
    return false;
  }
  const {data, error} = await supabase.rpc('users_are_blocked', {
    a: userA,
    b: userB,
  });
  if (!error) {
    return Boolean(data);
  }
  const set = await fetchBlockedUserIds(userA);
  return set.has(userB);
}

export async function blockUser(otherUserId: string): Promise<void> {
  const {error} = await supabase.rpc('block_user', {p_other: otherUserId});
  if (error) {
    throw error;
  }
}

export async function unblockUser(otherUserId: string): Promise<void> {
  const {error} = await supabase.rpc('unblock_user', {p_other: otherUserId});
  if (error) {
    throw error;
  }
}
