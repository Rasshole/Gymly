import {supabase} from '@/services/supabase/supabaseClient';
import {getPublicProfilesByIds} from '@/services/supabase/friendService';
import {fetchCheckInCountsByUserIdsInRange} from '@/services/supabase/weeklySummaryService';
import {
  buildWeeklyFriendLeaderboard,
  type WeeklyFriendLeaderboardEntry,
} from '@/utils/weeklySummary';
import type {
  GymlyGroupRow,
  GymlyGroupInviteRow,
  GymlyGroupMemberRow,
  GymlyGroupMessageRow,
} from '@/types/gymlyGroups.types';

const USER_ID_CHUNK = 80;

export type GymlyGroupActiveMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  gymName: string | null;
  startedAt: string;
  liveExerciseName?: string | null;
  liveSetCount?: number | null;
  liveExerciseCount?: number | null;
};

export async function fetchMyGymlyGroups(
  userId: string,
): Promise<GymlyGroupRow[]> {
  const {data: mem, error: e1} = await supabase
    .from('gymly_group_members')
    .select('group_id')
    .eq('user_id', userId);
  if (e1) {
    if (
      (e1 as {code?: string}).code === '42P01' ||
      e1.message?.includes('gymly_group') ||
      e1.message?.includes('does not exist')
    ) {
      return [];
    }
    throw e1;
  }
  const ids = [...new Set((mem ?? []).map((m: {group_id: string}) => m.group_id))];
  if (ids.length === 0) {
    return [];
  }
  const {data, error} = await supabase
    .from('gymly_groups')
    .select('*')
    .in('id', ids);
  if (error) {
    if (error.message?.includes('gymly_groups') || error.message?.includes('does not exist')) {
      return [];
    }
    throw error;
  }
  const out = (data ?? []) as GymlyGroupRow[];
  out.sort(
    (a, b) =>
      (b.last_message_at ?? b.updated_at).localeCompare(
        a.last_message_at ?? a.updated_at,
      ),
  );
  return out;
}

export async function fetchPendingGymlyInvites(
  userId: string,
): Promise<Array<GymlyGroupInviteRow & {group: GymlyGroupRow}>> {
  const {data, error} = await supabase
    .from('gymly_group_invites')
    .select('id, group_id, inviter_id, invitee_id, status, created_at, responded_at')
    .eq('invitee_id', userId)
    .eq('status', 'pending');
  if (error) {
    if (error.message?.includes('gymly_') || error.message?.includes('does not exist')) {
      return [];
    }
    throw error;
  }
  const invites = (data ?? []) as GymlyGroupInviteRow[];
  if (invites.length === 0) {
    return [];
  }
  const gids = [...new Set(invites.map(i => i.group_id))];
  const {data: groups, error: e2} = await supabase
    .from('gymly_groups')
    .select('*')
    .in('id', gids);
  if (e2) {
    throw e2;
  }
  const byId = new Map(
    (groups as GymlyGroupRow[] | null)?.map(g => [g.id, g]) ?? [],
  );
  return invites
    .map(inv => {
      const g = byId.get(inv.group_id);
      if (!g) {
        return null;
      }
      return {...inv, group: g};
    })
    .filter((x): x is GymlyGroupInviteRow & {group: GymlyGroupRow} => x != null);
}

export async function fetchGymlyGroup(
  groupId: string,
): Promise<GymlyGroupRow | null> {
  const {data, error} = await supabase
    .from('gymly_groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as GymlyGroupRow) ?? null;
}

export async function fetchGymlyGroupMembers(
  groupId: string,
): Promise<
  Array<
    GymlyGroupMemberRow & {displayName: string; avatarUrl: string | null}
  >
> {
  const {data, error} = await supabase
    .from('gymly_group_members')
    .select('group_id, user_id, role, joined_at')
    .eq('group_id', groupId);
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as GymlyGroupMemberRow[];
  const ids = rows.map(r => r.user_id);
  const profs = await getPublicProfilesByIds(ids);
  return rows.map(r => {
    const p = profs.get(r.user_id);
    return {
      ...r,
      displayName: p?.displayName?.trim() || p?.username || 'Bruger',
      avatarUrl: p?.avatarUrl ?? null,
    };
  });
}

export async function fetchGymlyGroupMessages(
  groupId: string,
  limit = 80,
): Promise<GymlyGroupMessageRow[]> {
  const {data, error} = await supabase
    .from('gymly_group_messages')
    .select('id, group_id, sender_id, body, message_type, metadata, created_at')
    .eq('group_id', groupId)
    .order('created_at', {ascending: false})
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data ?? []) as GymlyGroupMessageRow[];
}

/** Aktive check-ins for et sæt user ids. */
export async function fetchActiveCheckInsByUserIds(
  userIds: string[],
): Promise<
  Map<
    string,
    {
      gymName: string | null;
      startedAt: string;
      userDisplayName: string | null;
      liveExerciseName?: string | null;
      liveSetCount?: number | null;
      liveExerciseCount?: number | null;
    }
  >
> {
  const out = new Map<
    string,
    {
      gymName: string | null;
      startedAt: string;
      userDisplayName: string | null;
      liveExerciseName?: string | null;
      liveSetCount?: number | null;
      liveExerciseCount?: number | null;
    }
  >();
  if (userIds.length === 0) {
    return out;
  }
  for (let i = 0; i < userIds.length; i += USER_ID_CHUNK) {
    const chunk = userIds.slice(i, i + USER_ID_CHUNK);
    const {data, error} = await supabase
      .from('check_ins')
      .select(
        'user_id, gym_name, started_at, user_display_name, live_exercise_name, live_set_count, live_exercise_count',
      )
      .in('user_id', chunk)
      .eq('is_active', true)
      .is('ended_at', null);
    if (error) {
      throw error;
    }
    for (const row of data ?? []) {
      const r = row as {
        user_id: string;
        gym_name: string | null;
        started_at: string;
        user_display_name: string | null;
        live_exercise_name?: string | null;
        live_set_count?: number | null;
        live_exercise_count?: number | null;
      };
      if (!out.has(r.user_id)) {
        out.set(r.user_id, {
          gymName: r.gym_name,
          startedAt: r.started_at,
          userDisplayName: r.user_display_name,
          liveExerciseName: r.live_exercise_name ?? null,
          liveSetCount: r.live_set_count ?? null,
          liveExerciseCount: r.live_exercise_count ?? null,
        });
      }
    }
  }
  return out;
}

/** Antal aktive medlemmer pr. gruppe (én batch). */
export async function fetchActiveTrainingCountsByGroup(
  groupMemberMap: Map<string, string[]>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const allIds = [
    ...new Set([...groupMemberMap.values()].flat()),
  ];
  const active = await fetchActiveCheckInsByUserIds(allIds);
  for (const [groupId, memberIds] of groupMemberMap) {
    let n = 0;
    for (const uid of memberIds) {
      if (active.has(uid)) {
        n += 1;
      }
    }
    counts.set(groupId, n);
  }
  return counts;
}

export async function fetchGymlyGroupActiveMembers(
  groupId: string,
): Promise<GymlyGroupActiveMember[]> {
  const members = await fetchGymlyGroupMembers(groupId);
  const active = await fetchActiveCheckInsByUserIds(members.map(m => m.user_id));
  const list: GymlyGroupActiveMember[] = [];
  for (const m of members) {
    const a = active.get(m.user_id);
    if (!a) {
      continue;
    }
    list.push({
      userId: m.user_id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      gymName: a.gymName,
      startedAt: a.startedAt,
      liveExerciseName: a.liveExerciseName,
      liveSetCount: a.liveSetCount,
      liveExerciseCount: a.liveExerciseCount,
    });
  }
  list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return list;
}

/** Kalenderuge (man–søn) i lokal tid, slut = nu. */
export function getGroupWeekRange(now: Date = new Date()): {start: Date; end: Date} {
  const end = new Date(now);
  const start = new Date(now);
  const day = start.getDay(); // 0 søn
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  return {start, end};
}

export async function fetchGymlyGroupWeeklyLeaderboard(
  groupId: string,
  limit = 10,
): Promise<WeeklyFriendLeaderboardEntry[]> {
  const members = await fetchGymlyGroupMembers(groupId);
  if (members.length === 0) {
    return [];
  }
  const range = getGroupWeekRange();
  const counts = await fetchCheckInCountsByUserIdsInRange(
    members.map(m => m.user_id),
    range.start,
    range.end,
  );
  return buildWeeklyFriendLeaderboard(
    members.map(m => ({
      userId: m.user_id,
      name: m.displayName,
      checkInCount: counts.get(m.user_id) ?? 0,
    })),
    limit,
  );
}

export async function createGymlyGroupRpc(input: {
  name: string;
  description: string;
  isPrivate?: boolean;
  centerId?: string;
  city?: string;
  focus?: string;
  imageUrl: string | null;
}): Promise<string> {
  const {data, error} = await supabase.rpc('gymly_create_group', {
    p_name: input.name,
    p_description: input.description,
    p_is_private: input.isPrivate ?? true,
    p_center_id: input.centerId ?? '',
    p_city: input.city ?? '',
    p_focus: input.focus ?? '',
    p_image_url: input.imageUrl ?? null,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

export async function inviteToGymlyGroup(
  groupId: string,
  inviteeId: string,
): Promise<string | null> {
  const {data, error} = await supabase.rpc('gymly_invite_to_group', {
    p_group_id: groupId,
    p_invitee_id: inviteeId,
  });
  if (error) {
    throw error;
  }
  return (data as string) ?? null;
}

export async function inviteManyToGymlyGroup(
  groupId: string,
  inviteeIds: string[],
): Promise<{ok: string[]; failed: Array<{id: string; reason: string}>}> {
  const ok: string[] = [];
  const failed: Array<{id: string; reason: string}> = [];
  for (const id of inviteeIds) {
    try {
      await inviteToGymlyGroup(groupId, id);
      ok.push(id);
    } catch (e) {
      failed.push({
        id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return {ok, failed};
}

export async function acceptGymlyGroupInvite(
  inviteId: string,
): Promise<void> {
  const {error} = await supabase.rpc('gymly_accept_group_invite', {
    p_invite_id: inviteId,
  });
  if (error) {
    throw error;
  }
}

export async function declineGymlyGroupInvite(
  inviteId: string,
): Promise<void> {
  const {error} = await supabase.rpc('gymly_decline_group_invite', {
    p_invite_id: inviteId,
  });
  if (error) {
    throw error;
  }
}

export async function leaveGymlyGroup(groupId: string): Promise<void> {
  const {error} = await supabase.rpc('gymly_leave_group', {p_group_id: groupId});
  if (error) {
    throw error;
  }
}

export async function deleteGymlyGroup(groupId: string): Promise<void> {
  const {error} = await supabase.rpc('gymly_delete_group', {
    p_group_id: groupId,
  });
  if (error) {
    throw error;
  }
}

export async function removeGymlyGroupMember(
  groupId: string,
  memberId: string,
): Promise<void> {
  const {error} = await supabase.rpc('gymly_remove_group_member', {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error) {
    throw error;
  }
}

export async function updateGymlyGroup(
  groupId: string,
  patch: {
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    isPrivate?: boolean;
  },
): Promise<void> {
  const row: Record<string, unknown> = {updated_at: new Date().toISOString()};
  if (patch.name !== undefined) {
    row.name = patch.name.trim();
  }
  if (patch.description !== undefined) {
    row.description = patch.description?.trim() || null;
  }
  if (patch.imageUrl !== undefined) {
    row.image_url = patch.imageUrl?.trim() || null;
  }
  if (patch.isPrivate !== undefined) {
    row.is_private = patch.isPrivate;
  }
  const {error} = await supabase.from('gymly_groups').update(row).eq('id', groupId);
  if (error) {
    throw error;
  }
}

export async function uploadGymlyGroupImage(
  userId: string,
  localUri: string,
): Promise<string> {
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('could_not_read_image');
  }
  const body = await response.arrayBuffer();
  const path = `${userId}/group-${Date.now()}.jpg`;
  const {error: uploadError} = await supabase.storage
    .from('workout-images')
    .upload(path, body, {contentType: 'image/jpeg', upsert: true});
  if (uploadError) {
    throw uploadError;
  }
  const {data: pub} = supabase.storage.from('workout-images').getPublicUrl(path);
  if (!pub?.publicUrl) {
    throw new Error('could_not_get_public_url');
  }
  return pub.publicUrl;
}

export async function sendGymlyGroupMessage(
  groupId: string,
  body: string,
  messageType: 'text' | 'system' | 'planned_workout' | 'check_in' = 'text',
): Promise<string> {
  const {data, error} = await supabase.rpc('gymly_send_group_message', {
    p_group_id: groupId,
    p_body: body,
    p_message_type: messageType,
  });
  if (error) {
    throw error;
  }
  return data as string;
}
