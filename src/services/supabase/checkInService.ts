import {emitProfileStatsSelf} from '@/realtime/profileStatsSelfBridge';
import {supabase} from '@/services/supabase/supabaseClient';
import {checkAndUnlockBadges} from '@/store/badgeStore';
import {updateUserStatsAfterSession} from '@/services/supabase/userStatsService';
import {
  completedTrainingFromCheckInRow,
  type CompletedTrainingSession,
} from '@/services/training/completedTraining';
import {sessionDurationMinutes} from '@/utils/trainingStatsFromCheckIns';
import type {
  CheckInEndReason,
  CheckoutReason,
  CheckInSubmitResult,
  SubmitCheckInParams,
  SupabaseCheckInRow,
} from '@/types/checkIn.types';

export type {CompletedTrainingSession} from '@/services/training/completedTraining';

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

const CHECK_IN_CORE_SELECT =
  'id, gym_id, gym_name, workout_type, started_at, ended_at, is_active';

function isOptionalCheckInColumnError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return /column|duration_minutes|end_reason|checkout_reason|workout_needs_review|auto_checkout|away_started|last_distance|geofence|schema cache/i.test(
    message,
  );
}

async function fetchCheckInRowForUser(
  checkInId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const {data, error} = await supabase
    .from('check_ins')
    .select(CHECK_IN_CORE_SELECT)
    .eq('id', checkInId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? 'Kunne ikke hente tjek-ind.');
  }
  return data as Record<string, unknown> | null;
}

/**
 * Afslutter aktiv træning i `check_ins` (kilde til stats + Dine træninger).
 */
export async function completeActiveTrainingSession(
  userId: string,
  params: {
    checkInId?: string | null;
    endReason?: CheckInEndReason;
    checkoutReason?: CheckoutReason;
    workoutNeedsReview?: boolean;
    autoCheckoutReason?: AutoCheckoutKind;
  },
): Promise<CompletedTrainingSession> {
  const active = await getActiveCheckInForUser(userId).catch(() => null);
  let checkInId = params.checkInId ?? active?.id ?? null;
  if (active?.id && checkInId && active.id !== checkInId) {
    checkInId = active.id;
  }
  if (!checkInId && active?.id) {
    checkInId = active.id;
  }
  if (!checkInId) {
    throw new Error('Ingen aktiv træning at afslutte.');
  }

  const now = new Date().toISOString();
  const nowDate = new Date(now);
  let existingCheckIn = await fetchCheckInRowForUser(checkInId, userId);

  if (!existingCheckIn?.started_at && active?.id && active.id !== checkInId) {
    checkInId = active.id;
    existingCheckIn = await fetchCheckInRowForUser(checkInId, userId);
  }

  if (!existingCheckIn?.started_at) {
    throw new Error('Aktiv træning blev ikke fundet.');
  }

  if (existingCheckIn.ended_at) {
    return completedTrainingFromCheckInRow({
      id: String(existingCheckIn.id),
      gym_id: existingCheckIn.gym_id as string | undefined,
      gym_name: String(existingCheckIn.gym_name),
      workout_type: (existingCheckIn.workout_type as string | null) ?? null,
      started_at: String(existingCheckIn.started_at),
      ended_at: String(existingCheckIn.ended_at),
    });
  }

  const startedAt = new Date(String(existingCheckIn.started_at));
  const durationMinutes = sessionDurationMinutes(startedAt, nowDate);
  const endReason = params.endReason ?? 'user';
  const checkoutReason = params.checkoutReason ?? null;
  const workoutNeedsReview =
    params.workoutNeedsReview === true ||
    checkoutReason === 'auto_distance';
  const auto =
    params.autoCheckoutReason != null
      ? params.autoCheckoutReason
      : checkoutReason === 'auto_distance'
        ? 'left_geofence'
        : checkoutReason === 'system_recovery'
          ? 'inactivity'
          : endReason === 'inactivity' || endReason === 'left_geofence'
            ? (endReason as AutoCheckoutKind)
            : null;

  const patchAttempts: Array<Record<string, unknown>> = [
    {is_active: false, ended_at: now},
    {is_active: false, ended_at: now, end_reason: endReason},
    {
      is_active: false,
      ended_at: now,
      end_reason: endReason,
      duration_minutes: durationMinutes,
      geofence_grace_started_at: null,
      geofence_grace_kind: null,
      away_started_at: null,
      last_distance_meters: null,
      auto_checkout_reason: auto,
      checkout_reason: checkoutReason,
      workout_needs_review: workoutNeedsReview,
    },
    {
      is_active: false,
      ended_at: now,
      end_reason: endReason,
      duration_minutes: durationMinutes,
      geofence_grace_started_at: null,
      geofence_grace_kind: null,
      away_started_at: null,
      last_distance_meters: null,
      auto_checkout_reason: auto,
      checkout_reason: checkoutReason,
    },
    {
      is_active: false,
      ended_at: now,
      end_reason: endReason,
      duration_minutes: durationMinutes,
      geofence_grace_started_at: null,
      geofence_grace_kind: null,
      away_started_at: null,
      last_distance_meters: null,
      auto_checkout_reason: auto,
    },
  ];

  let lastError: string | undefined;

  const tryPatch = async (
    patch: Record<string, unknown>,
    activeOnly: boolean,
  ): Promise<boolean> => {
    let q = supabase
      .from('check_ins')
      .update(patch)
      .eq('id', checkInId)
      .eq('user_id', userId);
    if (activeOnly) {
      q = q.is('ended_at', null).or('is_active.eq.true,is_active.is.null');
    }
    const {error} = await q;
    if (error) {
      if (isOptionalCheckInColumnError(error.message)) {
        return false;
      }
      lastError = error.message;
      return false;
    }
    return true;
  };

  let ended = false;
  for (const patch of patchAttempts) {
    if (await tryPatch(patch, true)) {
      ended = true;
      break;
    }
    if (await tryPatch(patch, false)) {
      ended = true;
      break;
    }
  }

  let endedRow = ended ? await fetchCheckInRowForUser(checkInId, userId) : null;

  if (!endedRow?.ended_at) {
    endedRow = await fetchCheckInRowForUser(checkInId, userId);
  }

  if (!endedRow?.ended_at || !endedRow.started_at) {
    const {data: rpcData, error: rpcErr} = await supabase.rpc(
      'complete_my_active_check_in',
      {p_check_in_id: checkInId},
    );
    if (!rpcErr && rpcData && typeof rpcData === 'object') {
      const r = rpcData as Record<string, unknown>;
      if (r.ended_at && r.started_at) {
        endedRow = {
          id: r.id,
          gym_id: r.gym_id,
          gym_name: r.gym_name,
          workout_type: r.workout_type,
          started_at: r.started_at,
          ended_at: r.ended_at,
          is_active: false,
        };
      }
    } else if (rpcErr && !isOptionalCheckInColumnError(rpcErr.message)) {
      lastError = rpcErr.message;
    }
  }

  if (!endedRow?.ended_at || !endedRow.started_at) {
    if (__DEV__) {
      console.warn('[CheckInService] completeActiveTrainingSession failed', {
        checkInId,
        userId,
        lastError,
        existingIsActive: existingCheckIn.is_active,
      });
    }
    throw new Error(
      lastError ??
        'Kunne ikke afslutte træningen. Tjek forbindelsen og prøv igen.',
    );
  }

  const completed = completedTrainingFromCheckInRow({
    id: String(endedRow.id),
    gym_id: endedRow.gym_id as string | undefined,
    gym_name: String(endedRow.gym_name ?? existingCheckIn.gym_name),
    workout_type: (endedRow.workout_type as string | null) ?? null,
    started_at: String(endedRow.started_at),
    ended_at: String(endedRow.ended_at),
    duration_minutes: durationMinutes,
  });

  try {
    await updateUserStatsAfterSession(userId, {
      startedAt: completed.startedAt,
      endedAt: completed.endedAt,
      hasValidCheckIn: true,
    });
  } catch (statsErr) {
    console.warn('[CheckInService] stats update failed after checkout:', statsErr);
  }
  emitProfileStatsSelf(userId);
  void checkAndUnlockBadges(userId);

  return completed;
}

/** @deprecated Brug `completeActiveTrainingSession` — beholdt til auto-checkout m.m. */
export async function endActiveCheckInInSupabase(
  checkInId: string,
  userId: string,
  endReason?: CheckInEndReason,
  options?: {autoCheckoutReason?: AutoCheckoutKind},
): Promise<void> {
  await completeActiveTrainingSession(userId, {
    checkInId,
    endReason,
    autoCheckoutReason: options?.autoCheckoutReason,
  });
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
      geofence_grace_kind: patch.away_started_at ? 'outside' : null,
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
