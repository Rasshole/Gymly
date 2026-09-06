import {supabase} from '@/services/supabase/supabaseClient';
import {formatGroupDurationLabel} from '@/utils/groupSessionFormat';

export {formatGroupDurationLabel, formatWorkoutDuration} from '@/utils/groupSessionFormat';

export type GymlyGroupStats = {
  togetherSessionCount: number;
  totalDurationSeconds: number;
  memberCount: number;
};

export type GymlyActiveGroupSessionParticipant = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  checkInId: string;
};

export type GymlyActiveGroupSession = {
  id: string;
  groupId: string;
  gymId: string;
  gymName: string | null;
  startedBy: string;
  startedAt: string;
  status: string;
  participants: GymlyActiveGroupSessionParticipant[];
};

export type GymlyRecentGroupSession = {
  id: string;
  gymId: string;
  gymName: string | null;
  startedAt: string;
  endedAt: string | null;
  totalDurationSeconds: number;
  participantNames: string[];
};

export async function fetchGymlyGroupStats(
  groupId: string,
): Promise<GymlyGroupStats> {
  const {data, error} = await supabase.rpc('gymly_get_group_stats', {
    p_group_id: groupId,
  });
  if (error) {
    throw error;
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    togetherSessionCount: Number(row.togetherSessionCount ?? 0),
    totalDurationSeconds: Number(row.totalDurationSeconds ?? 0),
    memberCount: Number(row.memberCount ?? 0),
  };
}

export async function fetchActiveGymlyGroupSession(
  groupId: string,
): Promise<GymlyActiveGroupSession | null> {
  const {data, error} = await supabase.rpc('gymly_get_active_group_session', {
    p_group_id: groupId,
  });
  if (error) {
    throw error;
  }
  if (data == null) {
    return null;
  }
  const row = data as Record<string, unknown>;
  const rawParts = (row.participants as Array<Record<string, unknown>>) ?? [];
  return {
    id: String(row.id),
    groupId: String(row.groupId),
    gymId: String(row.gymId ?? ''),
    gymName: (row.gymName as string | null) ?? null,
    startedBy: String(row.startedBy),
    startedAt: String(row.startedAt),
    status: String(row.status),
    participants: rawParts.map(p => ({
      userId: String(p.userId),
      displayName: String(p.displayName ?? 'Bruger'),
      avatarUrl: (p.avatarUrl as string | null) ?? null,
      joinedAt: String(p.joinedAt),
      checkInId: String(p.checkInId),
    })),
  };
}

export async function startOrJoinGymlyGroupSession(
  groupId: string,
  checkInId: string,
): Promise<string> {
  const {data, error} = await supabase.rpc('gymly_start_or_join_group_session', {
    p_group_id: groupId,
    p_check_in_id: checkInId,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

export async function completeGymlyGroupParticipant(
  checkInId: string,
): Promise<void> {
  const {error} = await supabase.rpc('gymly_complete_group_participant', {
    p_check_in_id: checkInId,
  });
  if (error) {
    if (
      /does not exist|schema cache|gymly_complete_group/i.test(
        String(error.message),
      )
    ) {
      if (__DEV__) {
        console.warn('[groupSession] complete skipped', error.message);
      }
      return;
    }
    throw error;
  }
}

export async function fetchRecentGymlyGroupSessions(
  groupId: string,
  limit = 8,
): Promise<GymlyRecentGroupSession[]> {
  const {data, error} = await supabase.rpc('gymly_list_recent_group_sessions', {
    p_group_id: groupId,
    p_limit: limit,
  });
  if (error) {
    throw error;
  }
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  return rows.map(r => ({
    id: String(r.id),
    gymId: String(r.gymId ?? ''),
    gymName: (r.gymName as string | null) ?? null,
    startedAt: String(r.startedAt),
    endedAt: (r.endedAt as string | null) ?? null,
    totalDurationSeconds: Number(r.totalDurationSeconds ?? 0),
    participantNames: Array.isArray(r.participantNames)
      ? (r.participantNames as string[])
      : [],
  }));
}
