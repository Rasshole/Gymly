import {supabase} from '@/services/supabase/supabaseClient';
import type {
  CheckInEndReason,
  CheckInSubmitResult,
  SubmitCheckInParams,
  SupabaseCheckInRow,
} from '@/types/checkIn.types';

/**
 * Slutter alle tidligere åbne tjek for brugeren (én aktiv session ad gangen).
 */
export async function endPriorActiveCheckInsForUser(
  userId: string,
): Promise<void> {
  const {error} = await supabase
    .from('check_ins')
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null);

  if (error) {
    throw new Error(
      error.message?.includes('row-level security') || error.message === ''
        ? 'Kunne ikke opdatere tidligere tjek-ind. Tjek rettigheder (RLS) for check_ins.'
        : error.message,
    );
  }
}

/**
 * Henter aktivt tjek-ind: is_active = true og ended_at IS NULL.
 */
export async function getActiveCheckInForUser(
  userId: string,
): Promise<SupabaseCheckInRow | null> {
  const {data, error} = await supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null)
    .maybeSingle();

  if (error) {
    let message = error.message ?? 'Kunne ikke hente aktivt tjek-ind.';
    if (message.includes('check_ins') && message.includes('column')) {
      message =
        'Supabase skal have kolonnerne started_at, ended_at, is_active. Kør migration 20260501120000_check_ins_session_lifecycle.sql.';
    }
    throw new Error(message);
  }

  if (!data) {
    return null;
  }
  return data as SupabaseCheckInRow;
}

/**
 * Tjek-ud. `endReason` sættes ved manuelt/ auto (kolonne `end_reason` efter migration).
 */
export async function endActiveCheckInInSupabase(
  checkInId: string,
  userId: string,
  endReason?: CheckInEndReason,
): Promise<void> {
  const now = new Date().toISOString();
  const {error} = await supabase
    .from('check_ins')
    .update({
      is_active: false,
      ended_at: now,
      geofence_grace_started_at: null,
      geofence_grace_kind: null,
      end_reason: endReason ?? 'user',
    })
    .eq('id', checkInId)
    .eq('user_id', userId);

  if (error) {
    const {error: err2} = await supabase
      .from('check_ins')
      .update({is_active: false, ended_at: now})
      .eq('id', checkInId)
      .eq('user_id', userId);
    if (err2) {
      throw new Error(err2.message ?? 'Kunne ikke tjekke ud i databasen.');
    }
    return;
  }
}

export async function updateCheckInLastSeenAt(
  checkInId: string,
  userId: string,
  at: Date = new Date(),
): Promise<void> {
  const {error} = await supabase
    .from('check_ins')
    .update({last_seen_at: at.toISOString()})
    .eq('id', checkInId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null);

  if (error) {
    if (error.message?.includes('last_seen_at')) {
      return;
    }
    throw new Error(error.message ?? 'Kunne ikke opdatere last_seen_at.');
  }
}

export async function setCheckInGeofenceGrace(
  checkInId: string,
  userId: string,
  kind: 'buffer' | 'outside',
  startedAt: Date = new Date(),
): Promise<void> {
  const {error} = await supabase
    .from('check_ins')
    .update({
      geofence_grace_kind: kind,
      geofence_grace_started_at: startedAt.toISOString(),
    })
    .eq('id', checkInId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null);

  if (error) {
    if (
      error.message?.includes('geofence') ||
      error.message?.includes('column')
    ) {
      return;
    }
    throw new Error(error.message ?? 'Kunne ikke sætte geofence.');
  }
}

export async function clearCheckInGeofenceGrace(
  checkInId: string,
  userId: string,
): Promise<void> {
  const {error} = await supabase
    .from('check_ins')
    .update({
      geofence_grace_kind: null,
      geofence_grace_started_at: null,
    })
    .eq('id', checkInId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null);

  if (error) {
    if (
      error.message?.includes('geofence') ||
      error.message?.includes('column')
    ) {
      return;
    }
    throw new Error(error.message ?? 'Kunne ikke nulstille geofence.');
  }
}

/**
 * Gemmer tjek-ind i Supabase (primær sti når native Firebase ikke er til stede).
 * Afslutter evt. forrige aktiv række, indsætter ny med started_at, is_active = true.
 */
export async function submitCheckInSupabase(
  params: SubmitCheckInParams,
): Promise<CheckInSubmitResult> {
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

  await endPriorActiveCheckInsForUser(user.id);

  const startedAt = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    gym_id: String(params.gymId),
    gym_name: params.gymName,
    city: params.city ?? null,
    workout_type: params.workoutType ?? null,
    note: params.note ?? null,
    user_display_name: params.displayName,
    started_at: startedAt,
    is_active: true,
    ended_at: null,
    last_seen_at: startedAt,
  };
  if (params.plannedWorkoutId) {
    insertPayload.planned_workout_id = params.plannedWorkoutId;
  }

  let {data, error} = await supabase
    .from('check_ins')
    .insert(insertPayload)
    .select('id, started_at')
    .single();

  if (error && /planned_workout/i.test(String(error.message))) {
    const {planned_workout_id: _dropped, ...withoutPw} = insertPayload;
    const r2 = await supabase
      .from('check_ins')
      .insert(withoutPw)
      .select('id, started_at')
      .single();
    data = r2.data;
    error = r2.error;
  }
  if (error && /last_seen_at|column.*does not exist/i.test(String(error.message))) {
    const {user_id, gym_id, gym_name, city, workout_type, note, user_display_name, started_at, is_active, ended_at} =
      insertPayload;
    const r3 = await supabase
      .from('check_ins')
      .insert({user_id, gym_id, gym_name, city, workout_type, note, user_display_name, started_at, is_active, ended_at})
      .select('id, started_at')
      .single();
    data = r3.data;
    error = r3.error;
  }

  if (error) {
    let message = error.message ?? 'Kunne ikke gemme tjek-ind.';
    if (message.includes('check_ins') && message.includes('column')) {
      message =
        'Supabase skal have session-kolonner. Kør migration 20260501120000_check_ins_session_lifecycle.sql.';
    } else if (
      message.includes('check_ins') &&
      (message.includes('does not exist') || message.includes('schema cache'))
    ) {
      message =
        'Supabase mangler tabellen check_ins. Kør supabase/migrations/20260328130000_check_ins.sql.';
    } else if (message.includes('check_ins_one_active_per_user')) {
      message =
        'Allerede et aktivt tjek-ind. Prøv igen om et øjeblik, eller tjek for dobbelttjek.';
    }
    throw new Error(message);
  }

  return {
    id: data.id,
    startedAt: new Date(data.started_at ?? startedAt),
  };
}
