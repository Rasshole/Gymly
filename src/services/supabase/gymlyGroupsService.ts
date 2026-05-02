import {supabase} from '@/services/supabase/supabaseClient';
import {getPublicProfilesByIds} from '@/services/supabase/friendService';
import type {
  GymlyGroupRow,
  GymlyGroupInviteRow,
  GymlyGroupMemberRow,
  GymlyGroupMessageRow,
} from '@/types/gymlyGroups.types';

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

export async function createGymlyGroupRpc(input: {
  name: string;
  description: string;
  isPrivate: boolean;
  centerId: string;
  city: string;
  focus: string;
  imageUrl: string | null;
}): Promise<string> {
  const {data, error} = await supabase.rpc('gymly_create_group', {
    p_name: input.name,
    p_description: input.description,
    p_is_private: input.isPrivate,
    p_center_id: input.centerId,
    p_city: input.city,
    p_focus: input.focus,
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
