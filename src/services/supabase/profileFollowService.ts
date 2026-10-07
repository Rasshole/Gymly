import {supabase} from '@/services/supabase/supabaseClient';
import {FriendActionUnavailableError} from '@/utils/userBlockErrors';

function refused(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /follow_unavailable|follow_self/i.test(message);
}

async function callFollow(name: 'follow_profile' | 'unfollow_profile', followedId: string) {
  const {error} = await supabase.rpc(name, {p_followed: followedId});
  if (error) {
    if (refused(error)) {
      throw new FriendActionUnavailableError();
    }
    throw error;
  }
}

export async function followProfile(followedId: string): Promise<void> {
  await callFollow('follow_profile', followedId);
}

export async function unfollowProfile(followedId: string): Promise<void> {
  await callFollow('unfollow_profile', followedId);
}

/** Ids among `candidateIds` that the signed-in user follows. Never a public list. */
export async function listMyFollowedIds(
  followerId: string,
  candidateIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(candidateIds.filter(Boolean))].slice(0, 100);
  if (!followerId || ids.length === 0) {
    return new Set();
  }
  const {data, error} = await supabase
    .from('profile_follows')
    .select('followed_id')
    .eq('follower_id', followerId)
    .in('followed_id', ids);
  if (error) {
    throw error;
  }
  return new Set((data ?? []).map(row => String(row.followed_id)));
}
