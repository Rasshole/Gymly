import {isLocalQaSupabaseBackend} from '@/config/supabaseConfig';

/**
 * Public coach/gym badges stay off in release.
 * A badge is shown only after the server identity is approved, and only when
 * the release flag is on or this Debug build is pointed at local QA.
 */
export const SURFACE_CREATOR_IDENTITY_BADGES = false;

export function isCreatorTierQaSurfaceEnabled(): boolean {
  if (SURFACE_CREATOR_IDENTITY_BADGES) {
    return true;
  }
  return typeof __DEV__ !== 'undefined' && __DEV__ && isLocalQaSupabaseBackend();
}

export function shouldShowCreatorIdentityBadge(status: string | null | undefined): boolean {
  if (status !== 'approved') {
    return false;
  }
  return isCreatorTierQaSurfaceEnabled();
}
