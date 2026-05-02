/**
 * CheckinService – tjek-ind (én kilde: Supabase `check_ins`).
 * Firestore-brug er fjernet: FCM findes på samme app uden at skrive tjek til Firestore.
 */

import {submitCheckInSupabase} from '@/services/supabase/checkInService';
import type {CheckInSubmitResult, SubmitCheckInParams} from '@/types/checkIn.types';

export type {SubmitCheckInParams} from '@/types/checkIn.types';

/**
 * Gemmer tjek-ind i Supabase så RLS, venner, planlagt træning og notifikationer er konsistente.
 */
export async function submitCheckIn(
  params: SubmitCheckInParams,
): Promise<CheckInSubmitResult> {
  return submitCheckInSupabase(params);
}
