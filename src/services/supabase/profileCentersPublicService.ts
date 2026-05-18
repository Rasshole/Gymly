/**
 * Primære/lokale centre til profilvisning — kun Supabase + center-register (ingen lokal mock).
 */

import {supabase} from '@/services/supabase/supabaseClient';
import {fetchUserCenterIdsOrdered} from '@/services/supabase/userCentersService';
import {findGymByIdRelaxed} from '@/utils/gymDisplay';
import type {ProfileCenterRow} from '@/components/profile/ProfileCentersList';

function normalizeGymId(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export async function fetchFavoriteGymIdsForUser(userId: string): Promise<string[]> {
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
  const ids = raw
    .map(normalizeGymId)
    .filter((s): s is string => Boolean(s));
  return [...new Set(ids)].slice(0, 10);
}

/**
 * Hyppigst brugte gym_id fra afsluttede tjek-ind (kræver RLS: egen bruger eller venskab).
 */
export async function fetchMostFrequentGymIdsFromCheckIns(
  userId: string,
  limit = 5,
): Promise<string[]> {
  const {data, error} = await supabase
    .from('check_ins')
    .select('gym_id')
    .eq('user_id', userId)
    .eq('is_active', false)
    .not('ended_at', 'is', null)
    .limit(600);
  if (error || !data?.length) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const row of data) {
    const gid = normalizeGymId((row as {gym_id?: unknown}).gym_id);
    if (!gid) {
      continue;
    }
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

function toRowsFromResolved(
  resolved: {id: string; name: string; city?: string; brand?: string}[],
): ProfileCenterRow[] {
  return resolved.map(g => ({
    centerId: g.id,
    name: g.name,
    city: g.city,
    brand: g.brand,
  }));
}

/**
 * 1) profiles.favorite_gym_ids (rækkefølge = primær først)
 * 2) Ellers hyppigste gym_id fra check_ins der kan resolves i registeret
 */
export async function loadProfileCentersForUser(
  userId: string,
): Promise<ProfileCenterRow[]> {
  const favIds = await fetchUserCenterIdsOrdered(userId);
  const fromFavorites: {id: string; name: string; city?: string; brand?: string}[] = [];
  const seen = new Set<string>();
  for (const id of favIds.slice(0, 3)) {
    const g = findGymByIdRelaxed(id);
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      fromFavorites.push({
        id: g.id,
        name: g.name,
        city: g.city,
        brand: g.brand,
      });
    }
  }
  if (fromFavorites.length > 0) {
    return toRowsFromResolved(fromFavorites);
  }

  const histIds = await fetchMostFrequentGymIdsFromCheckIns(userId, 5);
  const fromHistory: {id: string; name: string; city?: string; brand?: string}[] = [];
  for (const id of histIds) {
    const g = findGymByIdRelaxed(id);
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      fromHistory.push({
        id: g.id,
        name: g.name,
        city: g.city,
        brand: g.brand,
      });
    }
  }
  return toRowsFromResolved(fromHistory);
}
