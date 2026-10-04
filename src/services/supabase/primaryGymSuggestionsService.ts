import {supabase} from '@/services/supabase/supabaseClient';
import type {PublicProfile} from '@/services/supabase/friendService';

export type GymSuggestionProfile = Pick<
  PublicProfile,
  'id' | 'username' | 'displayName' | 'avatarUrl'
>;

export async function fetchMyPrimaryGymDiscoverable(): Promise<boolean> {
  const {data, error} = await supabase.rpc('my_primary_gym_discoverable');
  if (error) {
    throw error;
  }
  return data === true;
}

/** Always updates the signed-in profile. The server ignores any other user id. */
export async function setMyPrimaryGymDiscoverable(visible: boolean): Promise<void> {
  const {error} = await supabase.rpc('set_primary_gym_discoverable', {
    p_visible: visible,
  });
  if (error) {
    throw error;
  }
}

export async function listPrimaryGymSuggestions(
  centerId: string,
): Promise<GymSuggestionProfile[]> {
  const {data, error} = await supabase.rpc('list_primary_gym_suggestions', {
    p_center_id: centerId,
  });
  if (error) {
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map(row => {
    const r = row as {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    };
    return {
      id: r.id,
      username: r.username ?? '',
      displayName: (r.display_name || r.username || '').trim(),
      avatarUrl: r.avatar_url,
    };
  });
}
