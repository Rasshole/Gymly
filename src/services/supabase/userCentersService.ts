/**
 * Foretrukne centre (user_centers) + spejling til profiles.favorite_gym_ids.
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {emitProfileCentersChanged} from '@/realtime/profileCentersBridge';

function logCenters(event: string, payload?: Record<string, unknown>) {
  if (__DEV__) {
    console.log(`[homeGyms] ${event}`, payload ?? '');
  }
}

export async function fetchFavoriteGymIdsFromProfile(userId: string): Promise<string[]> {
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

  const legacyIds = await fetchFavoriteGymIdsFromProfile(userId);
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

/** Best-effort mirror — must not fail the save if user_centers already persisted. */
async function mirrorFavoriteGymsToProfile(
  userId: string,
  ids: string[],
  now: string,
): Promise<{ok: boolean; error?: string}> {
  const {error: updErr} = await supabase
    .from('profiles')
    .update({
      favorite_gym_ids: ids,
      updated_at: now,
    })
    .eq('id', userId);

  if (!updErr) {
    return {ok: true};
  }

  const msg = updErr.message ?? String(updErr);
  logCenters('mirror.profile_update_failed', {userId, msg});

  const {data: row} = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', userId)
    .maybeSingle();

  if (row?.username) {
    const {error: upsErr} = await supabase.from('profiles').upsert(
      {
        id: userId,
        username: String(row.username).trim().toLowerCase(),
        display_name: (row as {display_name?: string}).display_name ?? row.username,
        favorite_gym_ids: ids,
        updated_at: now,
      },
      {onConflict: 'id'},
    );
    if (!upsErr) {
      logCenters('mirror.profile_upsert_ok', {userId});
      return {ok: true};
    }
    return {ok: false, error: upsErr.message};
  }

  return {ok: false, error: msg};
}

async function verifyUserCentersWritten(
  userId: string,
  expectedIds: string[],
): Promise<boolean> {
  if (expectedIds.length === 0) {
    return true;
  }
  try {
    const rows = await fetchUserCentersOrdered(userId);
    if (rows.length === 0) {
      return false;
    }
    const written = rows.map(r => r.centerId);
    return expectedIds.every((id, i) => written[i] === id);
  } catch {
    return false;
  }
}

export async function saveUserCenters(
  userId: string,
  centerIds: string[],
): Promise<string[]> {
  const ids = [...new Set(centerIds.filter(Boolean))].slice(0, 3);
  const now = new Date().toISOString();

  logCenters('save.request_started', {userId, ids, primaryId: ids[0]});

  let centersTableAvailable = true;
  let centersPersisted = false;

  const {error: delErr} = await supabase.from('user_centers').delete().eq('user_id', userId);
  if (delErr) {
    if (isMissingTableError(delErr)) {
      centersTableAvailable = false;
      logCenters('save.user_centers_table_missing', {userId});
    } else {
      logCenters('save.user_centers_delete_failed', {userId, message: delErr.message});
      throw delErr;
    }
  }

  if (ids.length > 0 && centersTableAvailable) {
    const inserts = ids.map((centerId, i) => ({
      user_id: userId,
      center_id: centerId,
      sort_order: i,
      is_primary: i === 0,
      updated_at: now,
    }));
    const {error: insErr} = await supabase.from('user_centers').insert(inserts);
    if (insErr) {
      logCenters('save.user_centers_insert_failed', {
        userId,
        message: insErr.message,
        code: (insErr as {code?: string}).code,
      });
      throw insErr;
    }
    centersPersisted = await verifyUserCentersWritten(userId, ids);
    logCenters('save.user_centers_inserted', {
      userId,
      count: inserts.length,
      verified: centersPersisted,
    });
  }

  const mirror = await mirrorFavoriteGymsToProfile(userId, ids, now);
  if (!mirror.ok) {
    logCenters('save.profile_mirror_failed', {userId, error: mirror.error});
    if (centersPersisted) {
      logCenters('save.success_despite_profile_mirror', {userId, ids});
    } else if (ids.length > 0) {
      const legacyOk = await verifyProfileFavoriteGyms(userId, ids);
      if (legacyOk) {
        logCenters('save.success_via_profile_only', {userId, ids});
      } else {
        throw new Error(mirror.error ?? 'Could not save home gyms to profile');
      }
    }
  } else {
    logCenters('save.profile_mirror_ok', {userId});
  }

  emitProfileCentersChanged(userId);
  logCenters('save.request_success', {userId, ids, centersPersisted, mirrorOk: mirror.ok});

  return ids;
}

async function verifyProfileFavoriteGyms(userId: string, expectedIds: string[]): Promise<boolean> {
  const fromProfile = await fetchFavoriteGymIdsFromProfile(userId);
  if (fromProfile.length === 0) {
    return false;
  }
  return expectedIds.every((id, i) => fromProfile[i] === id);
}

function isMissingTableError(error: {message?: string; code?: string}): boolean {
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    (msg.includes('user_centers') && msg.includes('does not exist')) ||
    (msg.includes('relation') && msg.includes('user_centers'))
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
