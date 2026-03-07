import {create} from 'zustand';

export const CURRENT_USER_PLACEHOLDER_ID = 'current_user';

export type GroupMember = {
  id: string;
  name: string;
  avatar?: string;
};

export type GymlyGroup = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  members: GroupMember[];
};

interface GroupState {
  groups: GymlyGroup[];
  addGroup: (group: GymlyGroup) => void;
  updateGroupMembers: (groupId: string, members: GroupMember[]) => void;
}

export const useGroupStore = create<GroupState>(set => ({
  groups: [],
  addGroup: group =>
    set(state => ({
      groups: [group, ...state.groups],
    })),
  updateGroupMembers: (groupId, members) =>
    set(state => ({
      groups: state.groups.map(group =>
        group.id === groupId ? {...group, members} : group,
      ),
    })),
}));


