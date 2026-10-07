import {supabase} from '@/services/supabase/supabaseClient';

function warnJourney(label: string, error: {message?: string} | null): void {
  if (error && __DEV__) {
    console.warn(`[productJourney] ${label}`, error.message ?? error);
  }
}

/** Signup, and onboarding when the account flag is already set. Idempotent. */
export function recordMyAccountJourney(justCompleted = false): void {
  void supabase
    .rpc('record_my_account_journey', {p_just_completed: justCompleted})
    .then(({error}) => warnJourney('account', error));
}

/**
 * Fallback for a completed check-in. The database trigger is authoritative.
 * Both paths no-op when the step is already stored.
 */
export function recordMyCompletedCheckIn(checkInId: string): void {
  if (!checkInId) {
    return;
  }
  void supabase
    .rpc('record_my_completed_check_in', {p_check_in_id: checkInId})
    .then(({error}) => warnJourney('check_in', error));
}
