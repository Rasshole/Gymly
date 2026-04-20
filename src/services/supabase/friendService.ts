import {supabase} from '@/services/supabase/supabaseClient';
import type {User} from '@/types/user.types';

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
}): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

export async function upsertMyProfile(user: User): Promise<void> {
  const username = (user.username || '').trim().toLowerCase();
  if (!username) {
    return;
  }
  const {error} = await supabase.from('profiles').upsert(
    {
      id: user.id,
      username,
      display_name: (user.displayName || username).trim(),
      avatar_url: user.profileImageUrl ?? null,
      updated_at: new Date().toISOString(),
    },
    {onConflict: 'id'},
  );
  if (error) {
    throw error;
  }
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
      .select('id, username, display_name, avatar_url')
      .neq('id', currentUserId)
      .ilike('username', pattern)
      .limit(15),
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
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
  const {error} = await supabase.from('friend_requests').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('Der ligger allerede en afventende anmodning.');
    }
    throw error;
  }
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
    .select('id, username, display_name, avatar_url')
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
    .select('id, username, display_name, avatar_url')
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
  const {error} = await supabase.rpc('accept_friend_request', {
    p_request_id: requestId,
  });
  if (error) {
    throw error;
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
