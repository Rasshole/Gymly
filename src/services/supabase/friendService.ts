import {supabase} from '@/services/supabase/supabaseClient';
import {checkAndUnlockBadges} from '@/store/badgeStore';
import type {User} from '@/types/user.types';
import {withAvatarCacheBust} from '../../utils/avatar';

const USERNAME_TAKEN_DA = 'Brugernavnet er allerede taget';

async function invokeSendPushForNotification(notificationId: string): Promise<void> {
  const {error} = await supabase.functions.invoke('send-push', {
    body: {notification_id: notificationId},
  });
  if (__DEV__) {
    if (error) {
      console.log('[notify] send-push called:', false, {notification_id: notificationId, error: error.message});
    } else {
      console.log('[notify] send-push called:', true, {notification_id: notificationId});
    }
  }
}

export async function mergeProfileUsernameIntoUser(user: User): Promise<User> {
  const row = await fetchMyProfileUsernameFields(user.id);
  if (!row?.username) {
    return user;
  }
  return {
    ...user,
    username: row.username,
    usernameRequiresChange: row.usernameRequiresChange,
  };
}

export async function fetchMyProfileUsernameFields(
  userId: string,
): Promise<{username: string; usernameRequiresChange: boolean} | null> {
  const {data, error} = await supabase
    .from('profiles')
    .select('username, username_requires_change')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const row = data as {
    username?: string;
    username_requires_change?: boolean;
  };
  return {
    username: String(row.username ?? ''),
    usernameRequiresChange: Boolean(row.username_requires_change),
  };
}

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarUpdatedAt?: string | null;
};

export type FriendRequestRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
};

function mapProfile(row: {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  updated_at?: string | null;
}): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: withAvatarCacheBust(row.avatar_url, row.updated_at),
    avatarUpdatedAt: row.updated_at ?? null,
  };
}

export async function upsertMyProfile(user: User): Promise<void> {
  const username = (user.username || '').trim().toLowerCase();
  if (!username) {
    return;
  }
  const gymIds = (user.favoriteGyms ?? [])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 3);
  const baseRow = {
    id: user.id,
    username,
    display_name: (user.displayName || username).trim(),
    avatar_url: user.profileImageUrl ?? null,
    updated_at: new Date().toISOString(),
  };

  const attempts: Array<Record<string, unknown>> = [
    {
      ...baseRow,
      favorite_gym_ids: gymIds,
      username_requires_change: user.usernameRequiresChange === true,
    },
    {
      ...baseRow,
      username_requires_change: user.usernameRequiresChange === true,
    },
    baseRow,
  ];

  let lastError: unknown = null;
  for (const row of attempts) {
    const {error} = await supabase.from('profiles').upsert(row, {onConflict: 'id'});
    if (!error) {
      return;
    }
    lastError = error;
    const code = (error as {code?: string}).code;
    const msg = (error.message || '').toLowerCase();
    if (
      code === '23505' ||
      msg.includes('duplicate') ||
      msg.includes('unique') ||
      msg.includes('profiles_username')
    ) {
      throw new Error(USERNAME_TAKEN_DA);
    }
    // Retry only for schema mismatch style errors; otherwise fail fast.
    const recoverable =
      msg.includes('column') ||
      msg.includes('favorite_gym_ids') ||
      msg.includes('username_requires_change') ||
      msg.includes('invalid input syntax') ||
      msg.includes('type');
    if (!recoverable) {
      throw error;
    }
    if (__DEV__) {
      console.warn('[upsertMyProfile] retrying with reduced payload:', msg);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Kunne ikke gemme profil');
}

export async function searchProfiles(
  currentUserId: string,
  query: string,
): Promise<PublicProfile[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const pattern = `%${q}%`;
  const [byUser, byName] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, updated_at')
      .neq('id', currentUserId)
      .ilike('username', pattern)
      .limit(15),
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, updated_at')
      .neq('id', currentUserId)
      .ilike('display_name', pattern)
      .limit(15),
  ]);

  if (byUser.error) {
    throw byUser.error;
  }
  if (byName.error) {
    throw byName.error;
  }

  const merged = new Map<string, PublicProfile>();
  for (const row of [...(byUser.data ?? []), ...(byName.data ?? [])]) {
    merged.set(row.id, mapProfile(row as any));
  }
  return [...merged.values()].slice(0, 25);
}

/** Kort vist navn til notifikationer (Realtime) */
export async function getPublicProfilesByIds(
  ids: string[],
): Promise<Map<string, PublicProfile>> {
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (uniq.length === 0) {
    return new Map();
  }
  const {data, error} = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, updated_at')
    .in('id', uniq);
  if (error) {
    throw error;
  }
  const m = new Map<string, PublicProfile>();
  for (const row of data ?? []) {
    m.set(row.id as string, mapProfile(row as any));
  }
  return m;
}

export async function getProfileDisplayNameForId(userId: string): Promise<string> {
  const {data, error} = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    return 'En bruger';
  }
  const d = (data as {display_name: string; username: string}).display_name?.trim();
  const u = (data as {display_name: string; username: string}).username?.trim();
  return d || u || 'En bruger';
}

/** Bruger DB-orden (least/greatest) — ikke nødvendigvis samme som JS a &lt; b for uuid-strings. */
const friendshipOrFilter = (id1: string, id2: string) =>
  `and(user_a.eq.${id1},user_b.eq.${id2}),and(user_a.eq.${id2},user_b.eq.${id1})`;

/** Om der findes et venskab mellem to brugere */
export async function isFriendWith(
  myUserId: string,
  otherUserId: string,
): Promise<boolean> {
  if (!myUserId || !otherUserId || myUserId === otherUserId) {
    return false;
  }
  const {data, error} = await supabase
    .from('friendships')
    .select('user_a')
    .or(friendshipOrFilter(myUserId, otherUserId))
    .maybeSingle();
  if (error) {
    return false;
  }
  return !!data;
}

/**
 * Fjerner venskab i DB: RPC bruger least/greatest (uuid) så parret matcher altid
 * `friendships` (user_a, user_b), og sletter `friend_requests` for paret uden
 * at fejle på tomt DELETE … SELECT.
 */
export async function removeFriendship(
  myUserId: string,
  otherUserId: string,
): Promise<void> {
  if (myUserId === otherUserId) {
    throw new Error('Ugyldig modpart');
  }
  const {error} = await supabase.rpc('remove_friendship_between', {
    p_other: otherUserId,
  });
  if (error) {
    throw new Error('Kunne ikke fjerne venskab. Prøv igen.');
  }
}

export async function getMyFriendIds(userId: string): Promise<Set<string>> {
  const {data, error} = await supabase
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (error) {
    throw error;
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const a = row.user_a as string;
    const b = row.user_b as string;
    ids.add(a === userId ? b : a);
  }
  return ids;
}

export async function getOutgoingPendingTo(
  fromUserId: string,
  toUserId: string,
): Promise<boolean> {
  const {data, error} = await supabase
    .from('friend_requests')
    .select('id')
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', toUserId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    return false;
  }
  return !!data;
}

export type PendingBetween = {
  incoming: FriendRequestRow | null;
  outgoing: FriendRequestRow | null;
};

/** Indkommende/udgående afventende anmodninger mellem to brugere */
export async function getPendingRequestBetween(
  myUserId: string,
  otherUserId: string,
): Promise<PendingBetween> {
  const [inc, out] = await Promise.all([
    supabase
      .from('friend_requests')
      .select('id, from_user_id, to_user_id, status, created_at')
      .eq('to_user_id', myUserId)
      .eq('from_user_id', otherUserId)
      .eq('status', 'pending')
      .maybeSingle(),
    supabase
      .from('friend_requests')
      .select('id, from_user_id, to_user_id, status, created_at')
      .eq('from_user_id', myUserId)
      .eq('to_user_id', otherUserId)
      .eq('status', 'pending')
      .maybeSingle(),
  ]);

  const map = (r: (typeof inc)['data']): FriendRequestRow | null => {
    if (!r) {
      return null;
    }
    return {
      id: r.id as string,
      fromUserId: r.from_user_id as string,
      toUserId: r.to_user_id as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    };
  };
  if (inc.error) {
    throw inc.error;
  }
  if (out.error) {
    throw out.error;
  }
  return {
    incoming: map(inc.data),
    outgoing: map(out.data),
  };
}

export async function sendFriendRequest(
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  if (fromUserId === toUserId) {
    throw new Error('Du kan ikke tilføje dig selv.');
  }
  const friends = await getMyFriendIds(fromUserId);
  if (friends.has(toUserId)) {
    throw new Error('I er allerede venner.');
  }
  const {data, error} = await supabase
    .from('friend_requests')
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('Der ligger allerede en afventende anmodning.');
    }
    throw error;
  }
  const requestId = data?.id as string | undefined;
  if (!requestId) {
    return;
  }
  setTimeout(async () => {
    try {
      const {data: notification} = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'friend_request')
        .filter('data->>friendRequestId', 'eq', requestId)
        .order('created_at', {ascending: false})
        .limit(1)
        .maybeSingle();
      const notificationId = notification?.id as string | undefined;
      if (notificationId) {
        await invokeSendPushForNotification(notificationId);
      } else if (__DEV__) {
        console.log('[notify] friend_request notification created:', false, {requestId});
      }
    } catch (e) {
      if (__DEV__) {
        console.log('[notify] friend_request push fallback failed:', e);
      }
    }
  }, 450);
}

export async function listFriendsWithProfiles(
  userId: string,
): Promise<PublicProfile[]> {
  const {data: rows, error} = await supabase
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (error) {
    throw error;
  }

  const friendIds: string[] = [];
  for (const row of rows ?? []) {
    const a = row.user_a as string;
    const b = row.user_b as string;
    friendIds.push(a === userId ? b : a);
  }
  if (friendIds.length === 0) {
    return [];
  }

  const {data: profiles, error: pErr} = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, updated_at')
    .in('id', friendIds);

  if (pErr) {
    throw pErr;
  }
  return (profiles ?? []).map(mapProfile);
}

export async function listPendingIncomingRequests(
  userId: string,
): Promise<(FriendRequestRow & {fromProfile?: PublicProfile})[]> {
  const {data: reqs, error} = await supabase
    .from('friend_requests')
    .select('id, from_user_id, to_user_id, status, created_at')
    .eq('to_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', {ascending: false});

  if (error) {
    throw error;
  }

  const fromIds = [...new Set((reqs ?? []).map(r => r.from_user_id as string))];
  if (fromIds.length === 0) {
    return [];
  }

  const {data: profiles} = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, updated_at')
    .in('id', fromIds);

  const byId = new Map((profiles ?? []).map(p => [p.id, mapProfile(p as any)]));

  return (reqs ?? []).map(r => ({
    id: r.id as string,
    fromUserId: r.from_user_id as string,
    toUserId: r.to_user_id as string,
    status: r.status as string,
    createdAt: r.created_at as string,
    fromProfile: byId.get(r.from_user_id as string),
  }));
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  const {data: reqBefore} = await supabase
    .from('friend_requests')
    .select('from_user_id, to_user_id')
    .eq('id', requestId)
    .maybeSingle();
  const {error} = await supabase.rpc('accept_friend_request', {
    p_request_id: requestId,
  });
  if (error) {
    throw error;
  }
  const fromUserId = (reqBefore?.from_user_id as string | undefined) ?? null;
  const toUserId = (reqBefore?.to_user_id as string | undefined) ?? null;
  if (fromUserId && toUserId) {
    setTimeout(async () => {
      try {
        const {data: notification} = await supabase
          .from('notifications')
          .select('id')
          .eq('type', 'friend_request_accepted')
          .eq('user_id', fromUserId)
          .eq('actor_user_id', toUserId)
          .order('created_at', {ascending: false})
          .limit(1)
          .maybeSingle();
        const notificationId = notification?.id as string | undefined;
        if (notificationId) {
          await invokeSendPushForNotification(notificationId);
        } else if (__DEV__) {
          console.log('[notify] friend_request_accepted notification created:', false, {
            requestId,
            fromUserId,
            toUserId,
          });
        }
      } catch (e) {
        if (__DEV__) {
          console.log('[notify] friend_request_accepted push fallback failed:', e);
        }
      }
    }, 450);
  }
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (user?.id) {
    void checkAndUnlockBadges(user.id);
  }
}

export async function declineFriendRequest(requestId: string): Promise<void> {
  const {error} = await supabase.rpc('decline_friend_request', {
    p_request_id: requestId,
  });
  if (error) {
    throw error;
  }
}
