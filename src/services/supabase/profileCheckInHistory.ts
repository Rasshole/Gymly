/**
 * Afsluttede tjek-ind sessioner til profil (kilde: public.check_ins), ikke feed.
 */

import {supabase} from '@/services/supabase/supabaseClient';
import type {Workout} from '@/types/workout.types';
import {formatGymNameWithBrand} from '@/utils/gymDisplay';
import {detectGymChain} from '@/services/gymLogoService';

export type ProfileCompletedSession = {
  id: string;
  gymName: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  workoutType: string | null;
  /** Sættes når session er koblet til planlagt træning med en anden deltager */
  partnerDisplayName: string | null;
};

const DEFAULT_LIMIT = 80;

/** Dato uden klokkeslæt + varighed, fx "23. apr. 2026 · 1t 24m" */
export function formatSessionDateAndDurationDa(
  startedAt: Date,
  durationMinutes: number,
): string {
  const dateStr = startedAt.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${dateStr} · ${formatDurationShortDa(durationMinutes)}`;
}

export function formatDurationShortDa(totalMinutes: number): string {
  const m = Math.max(1, Math.round(totalMinutes));
  if (m < 60) {
    return `${m} min`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) {
    return `${h}t`;
  }
  return `${h}t ${rest}m`;
}

function mapRowToSession(
  row: {
    id: string;
    gym_name: string;
    workout_type: string | null;
    started_at: string | null;
    ended_at: string | null;
    planned_workout_id: string | null;
  },
  partnerName: string | null,
): ProfileCompletedSession | null {
  if (!row.started_at || !row.ended_at) {
    return null;
  }
  const startedAt = new Date(row.started_at);
  const endedAt = new Date(row.ended_at);
  const durationMs = endedAt.getTime() - startedAt.getTime();
  if (durationMs <= 0) {
    return null;
  }
  const durationMinutes = Math.max(1, Math.round(durationMs / 60_000));
  const gymRaw = row.gym_name?.trim() || 'Center';
  const inferredBrand = detectGymChain(undefined, gymRaw).displayName;
  return {
    id: row.id,
    gymName: formatGymNameWithBrand(gymRaw, inferredBrand),
    startedAt,
    endedAt,
    durationMinutes,
    workoutType: row.workout_type,
    partnerDisplayName: partnerName,
  };
}

/**
 * Henter afsluttede check_ins for en bruger (nyeste først).
 * Venner kan læse hinandens rækker via RLS.
 */
export async function fetchCompletedCheckInSessionsForUser(
  userId: string,
  limit = DEFAULT_LIMIT,
): Promise<ProfileCompletedSession[]> {
  const {data: rows, error} = await supabase
    .from('check_ins')
    .select(
      'id, gym_name, workout_type, started_at, ended_at, is_active, planned_workout_id',
    )
    .eq('user_id', userId)
    .eq('is_active', false)
    .not('ended_at', 'is', null)
    .not('started_at', 'is', null)
    .order('ended_at', {ascending: false})
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? 'Kunne ikke hente træningshistorik.');
  }

  const list = rows ?? [];
  const partnerUserIdByCheckInId = new Map<string, string>();

  const plannedByCheckIn = new Map<string, string>();
  for (const row of list) {
    const pw = row.planned_workout_id as string | null;
    if (pw) {
      plannedByCheckIn.set(row.id as string, pw);
    }
  }
  const uniquePlanned = [...new Set(plannedByCheckIn.values())];

  if (uniquePlanned.length > 0) {
    const buddyByPlanned = new Map<string, string>();
    const rpcFirst = await supabase.rpc('get_planned_workout_buddy_id_for_profile', {
      p_profile_user_id: userId,
      p_planned_workout_id: uniquePlanned[0]!,
    });
    const rpcUsable = !rpcFirst.error;
    if (rpcUsable) {
      if (uniquePlanned[0] && rpcFirst.data && typeof rpcFirst.data === 'string') {
        buddyByPlanned.set(uniquePlanned[0]!, rpcFirst.data);
      }
      const rest = uniquePlanned.slice(1);
      if (rest.length > 0) {
        const more = await Promise.all(
          rest.map(pid =>
            supabase.rpc('get_planned_workout_buddy_id_for_profile', {
              p_profile_user_id: userId,
              p_planned_workout_id: pid,
            }),
          ),
        );
        rest.forEach((pid, i) => {
          const d = more[i]?.data;
          if (d && typeof d === 'string') {
            buddyByPlanned.set(pid, d);
          }
        });
      }
    }
    if (buddyByPlanned.size > 0) {
      for (const [cid, pw] of plannedByCheckIn) {
        const b = buddyByPlanned.get(pw);
        if (b) {
          partnerUserIdByCheckInId.set(cid, b);
        }
      }
    } else {
      const {data: parts, error: pErr} = await supabase
        .from('planned_workout_participants')
        .select('planned_workout_id, user_id')
        .in('planned_workout_id', uniquePlanned);
      if (!pErr && parts) {
        for (const row of list) {
          const pw = row.planned_workout_id as string | null;
          if (!pw) {
            continue;
          }
          const other = parts.find(
            p =>
              p.planned_workout_id === pw &&
              (p.user_id as string) !== userId,
          );
          if (other?.user_id) {
            partnerUserIdByCheckInId.set(
              row.id as string,
              other.user_id as string,
            );
          }
        }
      }
    }
  }

  const otherIds = [...new Set(partnerUserIdByCheckInId.values())];
  const nameByUserId = new Map<string, string>();
  if (otherIds.length > 0) {
    const {data: profs} = await supabase
      .from('profiles')
      .select('id, display_name, username')
      .in('id', otherIds);
    (profs ?? []).forEach(p => {
      const id = p.id as string;
      const dn = (p.display_name as string)?.trim();
      const un = (p.username as string)?.trim();
      nameByUserId.set(id, dn || un || 'Ven');
    });
  }

  const out: ProfileCompletedSession[] = [];
  for (const row of list) {
    const oid = partnerUserIdByCheckInId.get(row.id as string);
    const partnerName = oid ? nameByUserId.get(oid) ?? null : null;
    const s = mapRowToSession(
      row as Parameters<typeof mapRowToSession>[0],
      partnerName,
    );
    if (s) {
      out.push(s);
    }
  }
  return out;
}

/** Til Data-fanen (periode-filter) — samme felter som lokale Workout */
export function completedSessionsToWorkouts(
  sessions: ProfileCompletedSession[],
  userId: string,
): Workout[] {
  return sessions.map(s => ({
    id: s.id,
    userId,
    gymName: s.gymName,
    startTime: s.startedAt,
    endTime: s.endedAt,
    duration: s.durationMinutes,
    workoutType: s.workoutType ?? undefined,
  }));
}
