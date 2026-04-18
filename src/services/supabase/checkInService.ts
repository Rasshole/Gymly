import {supabase} from '@/services/supabase/supabaseClient';
import type {SubmitCheckInParams} from '@/types/checkIn.types';

/**
 * Gemmer tjek-ind i Supabase (primær sti når native Firebase ikke er til stede).
 */
export async function submitCheckInSupabase(
  params: SubmitCheckInParams,
): Promise<string> {
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Du skal være logget ind for at tjekke ind.');
  }

  if (user.id !== params.userId) {
    throw new Error('Brugersession matcher ikke. Log ud og ind igen.');
  }

  const {data, error} = await supabase
    .from('check_ins')
    .insert({
      user_id: user.id,
      gym_id: String(params.gymId),
      gym_name: params.gymName,
      city: params.city ?? null,
      workout_type: params.workoutType ?? null,
      note: params.note ?? null,
      user_display_name: params.displayName,
    })
    .select('id')
    .single();

  if (error) {
    let message = error.message ?? 'Kunne ikke gemme tjek-ind.';
    if (
      message.includes('check_ins') &&
      (message.includes('does not exist') || message.includes('schema cache'))
    ) {
      message =
        'Supabase mangler tabellen check_ins. Kør SQL fra supabase/migrations/20260328130000_check_ins.sql i Supabase SQL Editor.';
    }
    throw new Error(message);
  }

  return data.id;
}
