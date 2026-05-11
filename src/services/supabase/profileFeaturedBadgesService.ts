import {BADGE_BY_ID} from '@/config/badgeDefinitions';
import {supabase} from '@/services/supabase/supabaseClient';

export async function fetchFeaturedBadgeIdsForUser(
  userId: string,
): Promise<string[]> {
  if (!userId) {
    return [];
  }
  const {data, error} = await supabase
    .from('profiles')
    .select('featured_badge_ids')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    return [];
  }
  const raw = (data as {featured_badge_ids?: unknown}).featured_badge_ids;
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...new Set(raw.map(x => String(x)).filter(id => BADGE_BY_ID[id]))].slice(
    0,
    3,
  );
}

/** Kun gyldige badge_id, max 3 — database har også check. */
export async function updateMyFeaturedBadgeIds(
  userId: string,
  ids: string[],
): Promise<string[]> {
  const next = [...new Set(ids.map(String))]
    .filter(id => BADGE_BY_ID[id])
    .slice(0, 3);
  const {error} = await supabase
    .from('profiles')
    .update({featured_badge_ids: next})
    .eq('id', userId);
  if (error) {
    throw error;
  }
  return next;
}
