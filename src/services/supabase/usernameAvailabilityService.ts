import {supabase} from '@/services/supabase/supabaseClient';
import {normalizeUsernameForStorage} from '@/utils/usernameRules';

/**
 * true = ledigt (ingen anden profil med samme lower(username)).
 * p_excludeUserId: egen bruger ved profilredigering.
 */
export async function isUsernameAvailableInSupabase(
  rawUsername: string,
  pExcludeUserId?: string | null,
): Promise<boolean> {
  const u = normalizeUsernameForStorage(rawUsername);
  if (!u) {
    return false;
  }
  const {data, error} = await supabase.rpc('is_username_available', {
    p_username: u,
    p_exclude_user_id: pExcludeUserId ?? null,
  });
  if (error) {
    if (__DEV__) {
      console.warn('[usernameAvailability]', error.message);
    }
    return false;
  }
  return data === true;
}
