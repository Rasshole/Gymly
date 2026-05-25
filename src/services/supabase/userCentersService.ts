/**
 * Foretrukne centre (user_centers) + spejling til profiles.favorite_gym_ids.
 */

import {supabase} from '@/services/supabase/supabaseClient';

async function fetchLegacyFavoriteGymIds(userId: string): Promise<string[]> {
  const {data, error} = await supabase
    .from('profiles')
    .select('favorite_gym_ids')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    return [];
  }
  const raw = (data as {favorite_gym_ids?: unknown}).favorite_gym_ids;
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...new Set(raw.map(x => String(x).trim()).filter(Boolean))].slice(0, 3);
}

export type UserCenterRow = {
  centerId: string;
  sortOrder: number;
  isPrimary: boolean;
};

export async function fetchUserCentersOrdered(userId: string): Promise<UserCenterRow[]> {
  const {data, error} = await supabase
    .from('user_centers')
    .select('center_id, sort_order, is_primary')
    .eq('user_id', userId)
    .order('sort_order', {ascending: true});

  if (!error && data && data.length > 0) {
    return data.map(row => ({
      centerId: String((row as {center_id: string}).center_id),
      sortOrder: Number((row as {sort_order: number}).sort_order) || 0,
      isPrimary: Boolean((row as {is_primary: boolean}).is_primary),
    }));
  }

  if (error && !isMissingTableError(error)) {
    throw error;
  }

  const legacyIds = await fetchLegacyFavoriteGymIds(userId);
  return legacyIds.slice(0, 3).map((centerId, i) => ({
    centerId,
    sortOrder: i,
    isPrimary: i === 0,
  }));
}

export async function fetchUserCenterIdsOrdered(userId: string): Promise<string[]> {
  const rows = await fetchUserCentersOrdered(userId);
  return rows.map(r => r.centerId);
}

/**
 * Single write path for home gyms (onboarding, profile Rediger, settings).
 * Updates `user_centers` + mirrors `profiles.favorite_gym_ids`.
 */
export async function persistUserHomeGyms(
  userId: string,
  centerIds: string[],
): Promise<string[]> {
  return saveUserCenters(userId, centerIds);
}

export async function saveUserCenters(
  userId: string,
  centerIds: string[],
): Promise<string[]> {
  const ids = [...new Set(centerIds.filter(Boolean))].slice(0, 3);
  const now = new Date().toISOString();

  const {error: delErr} = await supabase.from('user_centers').delete().eq('user_id', userId);
  if (delErr && !isMissingTableError(delErr)) {
    throw delErr;
  }

  if (ids.length > 0 && !delErr) {
    const inserts = ids.map((centerId, i) => ({
      user_id: userId,
      center_id: centerId,
      sort_order: i,
      is_primary: i === 0,
      updated_at: now,
    }));
    const {error: insErr} = await supabase.from('user_centers').insert(inserts);
    if (insErr && !isMissingTableError(insErr)) {
      throw insErr;
    }
  }

  const {error: profErr} = await supabase
    .from('profiles')
    .update({
      favorite_gym_ids: ids,
      updated_at: now,
    })
    .eq('id', userId);

  if (profErr) {
    throw profErr;
  }

  return ids;
}

function isMissingTableError(error: {message?: string; code?: string}): boolean {
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    msg.includes('user_centers') && msg.includes('does not exist') ||
    msg.includes('relation') && msg.includes('user_centers')
  );
}

export function subscribeUserCenters(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`user-centers-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_centers',
        filter: `user_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
