import {isLocalQaSupabaseBackend} from '@/config/supabaseConfig';

/**
 * Smart Check-in stays off in release.
 * The Home suggestion is shown only in a Debug build pointed at local QA.
 */
export const SURFACE_SMART_CHECK_IN = false;

export function isSmartCheckInQaSurfaceEnabled(): boolean {
  if (SURFACE_SMART_CHECK_IN) {
    return true;
  }
  return typeof __DEV__ !== 'undefined' && __DEV__ && isLocalQaSupabaseBackend();
}
