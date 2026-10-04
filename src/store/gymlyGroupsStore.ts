import {create} from 'zustand';
import {useGroupStore, type GymlyGroup, type GroupMember} from '@/store/groupStore';
import {
  fetchMyGymlyGroups,
  fetchPendingGymlyInvites,
  fetchActiveTrainingCountsByGroup,
} from '@/services/supabase/gymlyGroupsService';
import {getPublicProfilesByIds} from '@/services/supabase/friendService';
import type {GymlyGroupRow, GymlyGroupInviteRow} from '@/types/gymlyGroups.types';
import {supabase} from '@/services/supabase/supabaseClient';
import {safeDisplayName} from '@/utils/displayName';

export type EnrichedGymlyInvite = GymlyGroupInviteRow & {group: GymlyGroupRow};

export type EnrichedGymlyGroup = GymlyGroupRow & {
  members: GroupMember[];
  activeTrainingCount: number;
  /** Current user's role if known */
  myRole: 'admin' | 'member' | null;
};

type State = {
  groups: EnrichedGymlyGroup[];
  pendingInvites: EnrichedGymlyInvite[];
  loading: boolean;
  error: string | null;
  refresh: (userId: string) => Promise<void>;
  reset: () => void;
};

async function loadMembersMap(
  groupIds: string[],
  currentUserId: string,
): Promise<{
  byG: Map<string, GroupMember[]>;
  myRoleByG: Map<string, 'admin' | 'member'>;
}> {
  if (groupIds.length === 0) {
    return {byG: new Map(), myRoleByG: new Map()};
  }
  const {data, error} = await supabase
    .from('gymly_group_members')
    .select('group_id, user_id, role')
    .in('group_id', groupIds);
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as Array<{
    group_id: string;
    user_id: string;
    role: 'admin' | 'member';
  }>;
  const uids = [...new Set(rows.map(r => r.user_id))];
  const profs = uids.length ? await getPublicProfilesByIds(uids) : new Map();
  const byG = new Map<string, GroupMember[]>();
  const myRoleByG = new Map<string, 'admin' | 'member'>();
  for (const r of rows) {
    const p = profs.get(r.user_id);
    const m: GroupMember = {
      id: r.user_id,
      name: safeDisplayName(p?.displayName, p?.username),
      avatar: p?.avatarUrl ?? undefined,
    };
    const list = byG.get(r.group_id) ?? [];
    list.push(m);
    byG.set(r.group_id, list);
    if (r.user_id === currentUserId) {
      myRoleByG.set(r.group_id, r.role);
    }
  }
  return {byG, myRoleByG};
}

function syncToLegacyGroupStore(list: EnrichedGymlyGroup[]) {
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
      const {byG, myRoleByG} = await loadMembersMap(
        rows.map(r => r.id),
        userId,
      );
      const memberIdMap = new Map<string, string[]>();
      for (const [gid, mems] of byG) {
        memberIdMap.set(
          gid,
          mems.map(m => m.id),
        );
      }
      let activeCounts = new Map<string, number>();
      try {
        activeCounts = await fetchActiveTrainingCountsByGroup(memberIdMap);
      } catch {
        /* check_ins / RLS — ignore for list */
      }
      const withMembers: EnrichedGymlyGroup[] = rows.map(r => ({
        ...r,
        members: byG.get(r.id) ?? [],
        activeTrainingCount: activeCounts.get(r.id) ?? 0,
        myRole: myRoleByG.get(r.id) ?? null,
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
