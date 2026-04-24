/**
 * Planlagte træninger med venner (Supabase RPC + tabeller)
 */

import {supabase} from '@/services/supabase/supabaseClient';

export type PlannedWorkoutRow = {
  id: string;
  creator_user_id: string;
  center_id: string;
  center_name: string;
  scheduled_at: string;
  training_types: string[];
  note: string | null;
  status: 'active' | 'cancelled' | 'completed';
  thread_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type PlannedParticipantRow = {
  id: string;
  planned_workout_id: string;
  user_id: string;
  role: 'creator' | 'invitee';
  response_status: 'pending' | 'accepted' | 'declined';
  responded_at: string | null;
};

function rpcError(msg: string): string {
  if (/not_friends/i.test(msg)) {
    return 'I skal være venner for at planlægge sammen.';
  }
  if (/not_invitee/i.test(msg)) {
    return 'Du er ikke modtager af denne invitation.';
  }
  if (/not_found|not active/i.test(msg)) {
    return 'Træningen findes ikke længere.';
  }
  return msg || 'Kunne ikke opdatere';
}

export async function createPlannedWorkoutInvite(params: {
  inviteeId: string;
  centerId: string;
  centerName: string;
  scheduledAt: Date;
  trainingTypes: string[];
  note?: string | null;
  threadId: string | null;
}): Promise<string> {
  const {data, error} = await supabase.rpc('create_planned_workout_invite', {
    p_invitee_id: params.inviteeId,
    p_center_id: params.centerId,
    p_center_name: params.centerName,
    p_scheduled_at: params.scheduledAt.toISOString(),
    p_training_types: params.trainingTypes,
    p_note: params.note ?? null,
    p_thread_id: params.threadId,
  });
  if (error) {
    throw new Error(rpcError(error.message));
  }
  if (typeof data !== 'string') {
    throw new Error('Uventet svar');
  }
  return data;
}

export async function respondPlannedWorkoutInvite(
  plannedWorkoutId: string,
  accept: boolean,
): Promise<void> {
  const {error} = await supabase.rpc('respond_planned_workout_invite', {
    p_planned_workout_id: plannedWorkoutId,
    p_accept: accept,
  });
  if (error) {
    throw new Error(rpcError(error.message));
  }
}

export async function fetchPlannedWorkoutByThread(
  threadId: string,
): Promise<{workout: PlannedWorkoutRow; participants: PlannedParticipantRow[]} | null> {
  const {data: pw, error} = await supabase
    .from('planned_workouts')
    .select(
      'id, creator_user_id, center_id, center_name, scheduled_at, training_types, note, status, thread_id, created_at, completed_at',
    )
    .eq('thread_id', threadId)
    .in('status', ['active'])
    .order('scheduled_at', {ascending: false})
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!pw) {
    return null;
  }

  const {data: parts, error: pErr} = await supabase
    .from('planned_workout_participants')
    .select('id, planned_workout_id, user_id, role, response_status, responded_at')
    .eq('planned_workout_id', pw.id);

  if (pErr) {
    throw new Error(pErr.message);
  }

  return {
    workout: pw as PlannedWorkoutRow,
    participants: (parts ?? []) as PlannedParticipantRow[],
  };
}

export async function fetchPlannedWorkoutsForUser(
  userId: string,
  fromIso?: string,
): Promise<
  {workout: PlannedWorkoutRow; participants: PlannedParticipantRow[]}[]
> {
  const {data: partRows, error} = await supabase
    .from('planned_workout_participants')
    .select('planned_workout_id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
  const ids = [...new Set((partRows ?? []).map(r => r.planned_workout_id))];
  if (ids.length === 0) {
    return [];
  }

  let q = supabase
    .from('planned_workouts')
    .select(
      'id, creator_user_id, center_id, center_name, scheduled_at, training_types, note, status, thread_id, created_at, completed_at',
    )
    .in('id', ids)
    .in('status', ['active', 'completed'])
    .order('scheduled_at', {ascending: true});

  if (fromIso) {
    q = q.gte('scheduled_at', fromIso);
  }

  const {data: pws, error: wErr} = await q;
  if (wErr) {
    throw new Error(wErr.message);
  }
  if (!pws?.length) {
    return [];
  }

  const {data: allParts, error: apErr} = await supabase
    .from('planned_workout_participants')
    .select('id, planned_workout_id, user_id, role, response_status, responded_at')
    .in(
      'planned_workout_id',
      pws.map(p => p.id),
    );

  if (apErr) {
    throw new Error(apErr.message);
  }

  const byPw: Record<string, PlannedParticipantRow[]> = {};
  (allParts ?? []).forEach((r: PlannedParticipantRow) => {
    if (!byPw[r.planned_workout_id]) {
      byPw[r.planned_workout_id] = [];
    }
    byPw[r.planned_workout_id]!.push(r);
  });

  return (pws as PlannedWorkoutRow[]).map(w => ({
    workout: w,
    participants: byPw[w.id] ?? [],
  }));
}

/** Tidsvindue til fælles tjek-ind (minutter før/efter planlagt tid) */
export const PLANNED_CHECKIN_WINDOW_BEFORE_MIN = 60;
export const PLANNED_CHECKIN_WINDOW_AFTER_MIN = 90;

export function findLinkablePlannedWorkoutId(params: {
  rows: {workout: PlannedWorkoutRow; participants: PlannedParticipantRow[]}[];
  userId: string;
  gymId: string;
  at: Date;
}): string | null {
  const t = params.at.getTime();
  for (const {workout, participants} of params.rows) {
    if (workout.status !== 'active') {
      continue;
    }
    if (String(workout.center_id) !== String(params.gymId)) {
      continue;
    }
    const me = participants.find(p => p.user_id === params.userId);
    if (!me || me.response_status !== 'accepted') {
      continue;
    }
    const sched = new Date(workout.scheduled_at).getTime();
    const before = PLANNED_CHECKIN_WINDOW_BEFORE_MIN * 60 * 1000;
    const after = PLANNED_CHECKIN_WINDOW_AFTER_MIN * 60 * 1000;
    if (t >= sched - before && t <= sched + after) {
      return workout.id;
    }
  }
  return null;
}
