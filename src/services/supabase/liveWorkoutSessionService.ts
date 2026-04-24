import {supabase} from '@/services/supabase/supabaseClient';

/** Hvis heartbeat ikke er modtaget inden da, tælles man ikke som live (app i baggrund / session slut). */
export const LIVE_SESSION_STALE_MINUTES = 4;

/** Send mens ActiveSession kører (skal være < LIVE_SESSION_STALE_MINUTES) */
export const LIVE_HEARTBEAT_INTERVAL_MS = 45_000;

export type LiveWorkoutSessionRow = {
  user_id: string;
  gym_id: string;
  gym_name: string;
  city: string | null;
  workout_type: string | null;
  user_display_name: string;
  started_at: string;
  updated_at: string;
};

export async function upsertLiveWorkoutSession(params: {
  userId: string;
  gymId: string;
  gymName: string;
  city?: string | null;
  workoutType: string;
  displayName: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const {error} = await supabase.from('workout_live_sessions').upsert(
    {
      user_id: params.userId,
      gym_id: String(params.gymId),
      gym_name: params.gymName,
      city: params.city ?? null,
      workout_type: params.workoutType,
      user_display_name: params.displayName.trim() || 'Bruger',
      started_at: now,
      updated_at: now,
    },
    {onConflict: 'user_id'},
  );
  if (error) {
    throw error;
  }
}

export async function touchMyLiveWorkoutSession(userId: string): Promise<void> {
  const {error} = await supabase
    .from('workout_live_sessions')
    .update({updated_at: new Date().toISOString()})
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
}

export async function deleteMyLiveWorkoutSession(userId: string): Promise<void> {
  const {error} = await supabase
    .from('workout_live_sessions')
    .delete()
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
}

export function liveSessionsStaleBeforeIso(): string {
  return new Date(
    Date.now() - LIVE_SESSION_STALE_MINUTES * 60_000,
  ).toISOString();
}

/**
 * Rækker synlige via RLS (egne + venners live sessioner), kun frisk heartbeat.
 */
export async function fetchVisibleLiveSessions(): Promise<LiveWorkoutSessionRow[]> {
  const {data, error} = await supabase
    .from('workout_live_sessions')
    .select('user_id, gym_id, gym_name, city, workout_type, user_display_name, started_at, updated_at')
    .gte('updated_at', liveSessionsStaleBeforeIso())
    .order('updated_at', {ascending: false});

  if (error) {
    throw error;
  }
  return (data ?? []) as LiveWorkoutSessionRow[];
}

export async function fetchGymLiveSessionTotals(): Promise<Map<string, number>> {
  const {data, error} = await supabase.rpc('gym_live_session_counts', {
    p_stale_mins: LIVE_SESSION_STALE_MINUTES,
  });
  if (error) {
    throw error;
  }
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const r = row as {gym_id: string; user_count: number | string};
    map.set(String(r.gym_id), Number(r.user_count) || 0);
  }
  return map;
}
