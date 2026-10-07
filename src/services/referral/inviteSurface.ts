/**
 * Invite 5 Friends stays off in the public release until the internal
 * distribution tests pass. Debug builds pointed at local QA can exercise the
 * journey without flipping INVITE_5_FRIENDS_ENABLED.
 */

import {INVITE_5_FRIENDS_ENABLED} from '@/config/launchSurfaceConfig';
import {isLocalQaSupabaseBackend} from '@/config/supabaseConfig';

export function isInviteFiveFriendsSurfaceEnabled(): boolean {
  if (INVITE_5_FRIENDS_ENABLED) {
    return true;
  }
  return typeof __DEV__ !== 'undefined' && __DEV__ && isLocalQaSupabaseBackend();
}

/** Network side effects stay off hosted Jest runs even when the flag is mocked on. */
export function referralJourneyMayUseBackend(): boolean {
  if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID && !isLocalQaSupabaseBackend()) {
    return false;
  }
  return isInviteFiveFriendsSurfaceEnabled();
}
