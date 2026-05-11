import {supabase} from '@/services/supabase/supabaseClient';
import {checkAndUnlockBadges} from '@/store/badgeStore';
import {updateUserStatsAfterSession} from '@/services/supabase/userStatsService';
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

export type AutoCheckoutKind = 'inactivity' | 'left_geofence';

/**
 * Tjek-ud. `endReason` sættes ved manuelt/ auto (kolonne `end_reason` efter migration).
 * `autoCheckoutReason` spejles i `auto_checkout_reason` når sat (migration).
 */
export async function endActiveCheckInInSupabase(
  checkInId: string,
  userId: string,
  endReason?: CheckInEndReason,
  options?: {autoCheckoutReason?: AutoCheckoutKind},
): Promise<void> {
  const now = new Date().toISOString();
  const nowDate = new Date(now);
  const {data: existingCheckIn} = await supabase
    .from('check_ins')
    .select('started_at')
    .eq('id', checkInId)
    .eq('user_id', userId)
    .maybeSingle();
  const auto =
    options?.autoCheckoutReason != null
      ? options.autoCheckoutReason
      : endReason === 'inactivity' || endReason === 'left_geofence'
        ? (endReason as AutoCheckoutKind)
        : null;

  const fullPatch: Record<string, unknown> = {
    is_active: false,
    ended_at: now,
    end_reason: endReason ?? 'user',
    geofence_grace_started_at: null,
    geofence_grace_kind: null,
    away_started_at: null,
    last_distance_meters: null,
  };
  if (auto) {
    fullPatch.auto_checkout_reason = auto;
  } else {
    fullPatch.auto_checkout_reason = null;
  }

  const {error} = await supabase
    .from('check_ins')
    .update(fullPatch)
    .eq('id', checkInId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null);

  if (error) {
    if (
      error.message?.includes('auto_checkout_reason') ||
      error.message?.includes('away_started') ||
      error.message?.includes('column') ||
      error.message?.includes('last_distance')
    ) {
      const {error: err2} = await supabase
        .from('check_ins')
        .update({is_active: false, ended_at: now, end_reason: endReason ?? 'user'})
        .eq('id', checkInId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('ended_at', null);
      if (err2) {
        const {error: err3} = await supabase
          .from('check_ins')
          .update({is_active: false, ended_at: now})
          .eq('id', checkInId)
          .eq('user_id', userId);
        if (err3) {
          throw new Error(err3.message ?? 'Kunne ikke tjekke ud i databasen.');
        }
      }
      const startedAt = existingCheckIn?.started_at
        ? new Date(String(existingCheckIn.started_at))
        : nowDate;
      try {
        await updateUserStatsAfterSession(userId, {
          startedAt,
          endedAt: nowDate,
          hasValidCheckIn: true,
        });
      } catch (statsErr) {
        console.warn('[CheckInService] stats update failed after checkout fallback:', statsErr);
      }
      void checkAndUnlockBadges(userId);
      return;
    }
    const {error: err2} = await supabase
      .from('check_ins')
      .update({is_active: false, ended_at: now})
      .eq('id', checkInId)
      .eq('user_id', userId);
    if (err2) {
      throw new Error(err2.message ?? 'Kunne ikke tjekke ud i databasen.');
    }
  }
  const startedAt = existingCheckIn?.started_at
    ? new Date(String(existingCheckIn.started_at))
    : nowDate;
  try {
    await updateUserStatsAfterSession(userId, {
      startedAt,
      endedAt: nowDate,
      hasValidCheckIn: true,
    });
  } catch (statsErr) {
    console.warn('[CheckInService] stats update failed after checkout:', statsErr);
  }
  void checkAndUnlockBadges(userId);
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

/** Væk fra center: persist (away_started, distance). Grace-felter ryddes når "hjem" i safe. */
export async function patchCheckInAwayState(
  checkInId: string,
  userId: string,
  patch: {
    away_started_at: string | null;
    last_distance_meters: number | null;
  },
): Promise<void> {
  const {error} = await supabase
    .from('check_ins')
    .update({
      away_started_at: patch.away_started_at,
      last_distance_meters: patch.last_distance_meters,
      geofence_grace_started_at: patch.away_started_at,
      geofence_grace_kind: patch.away_started_at
        ? patch.last_distance_meters != null && patch.last_distance_meters > 800
          ? 'outside'
          : 'buffer'
        : null,
    })
    .eq('id', checkInId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('ended_at', null);

  if (error) {
    if (
      error.message?.includes('away_started') ||
      error.message?.includes('last_distance') ||
      error.message?.includes('column')
    ) {
      return;
    }
    throw new Error(error.message ?? 'Kunne ikke opdatere away state.');
  }
}

export async function getLatestAutoCheckoutEventForUser(userId: string): Promise<{
  endedAt: string;
  reason: AutoCheckoutKind;
} | null> {
  const {data, error} = await supabase
    .from('check_ins')
    .select('ended_at, auto_checkout_reason')
    .eq('user_id', userId)
    .eq('is_active', false)
    .not('auto_checkout_reason', 'is', null)
    .not('ended_at', 'is', null)
    .order('ended_at', {ascending: false})
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const reason = String(data.auto_checkout_reason || '');
  if (reason !== 'inactivity' && reason !== 'left_geofence') {
    return null;
  }
  return {
    endedAt: String(data.ended_at),
    reason: reason as AutoCheckoutKind,
  };
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
  insertPayload.away_started_at = null;
  insertPayload.last_distance_meters = null;

  let {data, error} = await supabase
    .from('check_ins')
    .insert(insertPayload)
    .select('id, started_at')
    .single();

  if (error && /planned_workout/i.test(String(error.message))) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop planned id for retry
    const {planned_workout_id, ...withoutPw} = insertPayload;
    void planned_workout_id;
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
  if (
    error &&
    /away_started|last_distance|auto_checkout/i.test(String(error.message))
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop optional cols for old DBs
    const {away_started_at, last_distance_meters, ...withoutAway} = insertPayload;
    void away_started_at;
    void last_distance_meters;
    const r4 = await supabase
      .from('check_ins')
      .insert(withoutAway)
      .select('id, started_at')
      .single();
    data = r4.data;
    error = r4.error;
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

  if (!data) {
    throw new Error('Kunne ikke gemme tjek-ind (ingen række returneret).');
  }
  void checkAndUnlockBadges(user.id, params.displayName);
  return {
    id: data.id,
    startedAt: new Date(data.started_at ?? startedAt),
  };
}
