import {supabase} from '@/services/supabase/supabaseClient';
import type {RealtimeChannel} from '@supabase/supabase-js';

/**
 * Let reaktion til ven der har aktivt tjek-ind (idempotent på server).
 */
export async function sendWorkoutBicepsReaction(
  toUserId: string,
  checkInId: string,
): Promise<void> {
  const {error} = await supabase.rpc('send_workout_biceps_reaction', {
    p_to_user_id: toUserId,
    p_check_in_id: checkInId,
  });
  if (error) {
    const m = error.message || '';
    if (/no_active_check_in/i.test(m)) {
      throw new Error('Tjek ind er ikke længere aktivt.');
    }
    if (/not_friends/i.test(m)) {
      throw new Error('I skal være venner.');
    }
    throw new Error(m || 'Kunne ikke sende reaktion.');
  }
}

export type PostBicepsState = {
  postId: string;
  count: number;
  reactedByMe: boolean;
};

export type PostBicepsUser = {
  userId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
};

export async function fetchPostBicepsStates(
  postIds: string[],
  currentUserId: string,
): Promise<Record<string, PostBicepsState>> {
  if (!postIds.length || !currentUserId) {
    return {};
  }
  const uniquePostIds = Array.from(new Set(postIds));
  const {data, error} = await supabase
    .from('post_reactions')
    .select('post_id, user_id')
    .in('post_id', uniquePostIds)
    .eq('type', 'biceps');

  if (error) {
    throw new Error(error.message || 'Kunne ikke hente biceps-reaktioner.');
  }

  const result: Record<string, PostBicepsState> = {};
  for (const postId of uniquePostIds) {
    result[postId] = {postId, count: 0, reactedByMe: false};
  }
  for (const row of (data ?? []) as Array<{post_id: string; user_id: string}>) {
    if (!result[row.post_id]) {
      result[row.post_id] = {postId: row.post_id, count: 0, reactedByMe: false};
    }
    result[row.post_id].count += 1;
    if (row.user_id === currentUserId) {
      result[row.post_id].reactedByMe = true;
    }
  }
  return result;
}

export async function togglePostBicepsReaction(
  postId: string,
): Promise<{reacted: boolean; count: number}> {
  const {data, error} = await supabase.rpc('toggle_post_biceps_reaction', {
    p_post_id: postId,
  });

  if (error) {
    throw new Error(error.message || 'Kunne ikke opdatere biceps.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    reacted: Boolean(row?.reacted),
    count: Number(row?.reactions_count ?? 0),
  };
}

export async function fetchPostBicepsUsers(postId: string): Promise<PostBicepsUser[]> {
  const {data, error} = await supabase
    .from('post_reactions')
    .select('user_id, created_at')
    .eq('post_id', postId)
    .eq('type', 'biceps')
    .order('created_at', {ascending: false});

  if (error) {
    throw new Error(error.message || 'Kunne ikke hente biceps-liste.');
  }

  const rows = (data ?? []) as Array<{user_id: string; created_at: string}>;
  const ids = Array.from(new Set(rows.map(r => r.user_id)));
  if (!ids.length) {
    return [];
  }

  const {data: profiles, error: profilesError} = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url')
    .in('id', ids);

  if (profilesError) {
    throw new Error(profilesError.message || 'Kunne ikke hente brugerprofiler.');
  }

  const profileById = new Map(
    ((profiles ?? []) as Array<{
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }>).map(p => [p.id, p]),
  );

  return rows.map(r => {
    const p = profileById.get(r.user_id);
    return {
      userId: r.user_id,
      name: p?.display_name?.trim() || p?.username?.trim() || 'Bruger',
      username: p?.username?.trim() || 'bruger',
      avatarUrl: p?.avatar_url ?? null,
      createdAt: r.created_at,
    };
  });
}

let postReactionsChannel: RealtimeChannel | null = null;
let postReactionsRefCount = 0;
const postReactionListeners = new Set<(postId: string) => void>();

function notifyPostReactionListeners(postId: string) {
  for (const listener of postReactionListeners) {
    try {
      listener(postId);
    } catch {
      // ignore listener failures
    }
  }
}

function ensurePostReactionsChannel() {
  if (postReactionsChannel) {
    return;
  }
  postReactionsChannel = supabase
    .channel('post_biceps_reactions_shared')
    .on(
      'postgres_changes',
      {event: '*', schema: 'public', table: 'post_reactions'},
      payload => {
        const newPostId = (payload.new as {post_id?: string} | null)?.post_id;
        const oldPostId = (payload.old as {post_id?: string} | null)?.post_id;
        if (newPostId) {
          notifyPostReactionListeners(newPostId);
        }
        if (oldPostId && oldPostId !== newPostId) {
          notifyPostReactionListeners(oldPostId);
        }
      },
    )
    .subscribe();
}

export function subscribePostBicepsRealtime(
  onReactionChanged: (postId: string) => void,
): () => void {
  postReactionsRefCount += 1;
  postReactionListeners.add(onReactionChanged);
  ensurePostReactionsChannel();
  return () => {
    postReactionListeners.delete(onReactionChanged);
    postReactionsRefCount -= 1;
    if (postReactionsRefCount <= 0 && postReactionsChannel) {
      void supabase.removeChannel(postReactionsChannel);
      postReactionsChannel = null;
    }
  };
}
