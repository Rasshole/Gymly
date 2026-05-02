import {create} from 'zustand';
import {useGroupStore, type GymlyGroup, type GroupMember} from '@/store/groupStore';
import {
  fetchMyGymlyGroups,
  fetchPendingGymlyInvites,
} from '@/services/supabase/gymlyGroupsService';
import {getPublicProfilesByIds} from '@/services/supabase/friendService';
import type {GymlyGroupRow, GymlyGroupInviteRow} from '@/types/gymlyGroups.types';
import {supabase} from '@/services/supabase/supabaseClient';

export type EnrichedGymlyInvite = GymlyGroupInviteRow & {group: GymlyGroupRow};

type State = {
  /** Grupper inkl. medlemsoversigt til lister / NewMessage */
  groups: (GymlyGroupRow & {members: GroupMember[]})[];
  pendingInvites: EnrichedGymlyInvite[];
  loading: boolean;
  error: string | null;
  refresh: (userId: string) => Promise<void>;
  reset: () => void;
};

async function loadMembersMap(
  groupIds: string[],
): Promise<Map<string, GroupMember[]>> {
  if (groupIds.length === 0) {
    return new Map();
  }
  const {data, error} = await supabase
    .from('gymly_group_members')
    .select('group_id, user_id')
    .in('group_id', groupIds);
  if (error) {
    throw error;
  }
  const uids = [...new Set((data ?? []).map((r: {user_id: string}) => r.user_id))];
  const profs = uids.length ? await getPublicProfilesByIds(uids) : new Map();
  const byG = new Map<string, GroupMember[]>();
  for (const r of (data ?? []) as {group_id: string; user_id: string}[]) {
    const p = profs.get(r.user_id);
    const m: GroupMember = {
      id: r.user_id,
      name: p?.displayName?.trim() || p?.username || 'Bruger',
      avatar: p?.avatarUrl ?? undefined,
    };
    const list = byG.get(r.group_id) ?? [];
    list.push(m);
    byG.set(r.group_id, list);
  }
  return byG;
}

function syncToLegacyGroupStore(
  list: (GymlyGroupRow & {members: GroupMember[]})[],
) {
  const asGymly: GymlyGroup[] = list.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description ?? undefined,
    image: g.image_url ?? undefined,
    members: g.members,
  }));
  useGroupStore.setState({groups: asGymly});
}

export const useGymlyGroupsStore = create<State>((set, get) => ({
  groups: [],
  pendingInvites: [],
  loading: false,
  error: null,

  reset: () =>
    set({groups: [], pendingInvites: [], loading: false, error: null}),

  refresh: async (userId: string) => {
    if (!userId) {
      get().reset();
      syncToLegacyGroupStore([]);
      return;
    }
    set({loading: true, error: null});
    try {
      const [rows, invites] = await Promise.all([
        fetchMyGymlyGroups(userId),
        fetchPendingGymlyInvites(userId),
      ]);
      const memMap = await loadMembersMap(rows.map(r => r.id));
      const withMembers = rows.map(r => ({
        ...r,
        members: memMap.get(r.id) ?? [],
      }));
      set({
        groups: withMembers,
        pendingInvites: invites,
        loading: false,
      });
      syncToLegacyGroupStore(withMembers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('gymly_') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        set({groups: [], pendingInvites: [], loading: false, error: null});
        syncToLegacyGroupStore([]);
        return;
      }
      set({loading: false, error: msg});
    }
  },
}));
