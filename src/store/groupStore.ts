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

const addCurrentUserMember = (members: GroupMember[]): GroupMember[] => {
  const hasPlaceholder = members.some(member => member.id === CURRENT_USER_PLACEHOLDER_ID);
  if (hasPlaceholder) {
    return members;
  }
  return [
    {
      id: CURRENT_USER_PLACEHOLDER_ID,
      name: 'Dig',
    },
    ...members,
  ];
};

const mockGroups: GymlyGroup[] = [
  {
    id: 'group_weekend_warriors',
    name: 'Weekend Warriors',
    description: 'Vi træner sammen hver weekend og holder hinanden motiveret!',
    image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=600&q=80',
    members: addCurrentUserMember([
      {id: '1', name: 'Jeff'},
      {id: '2', name: 'Marie'},
      {id: '3', name: 'Lars'},
    ]),
  },
  {
    id: 'group_morning',
    name: 'Morgenmotionister',
    description: 'Træner hver morgen før arbejde. Kom og vær med!',
    image: 'https://images.unsplash.com/photo-1517832606294-1653eb4a8132?auto=format&fit=crop&w=600&q=80',
    members: addCurrentUserMember([
      {id: '4', name: 'Sofia'},
      {id: '5', name: 'Patti'},
      {id: '6', name: 'Thomas'},
      {id: '7', name: 'Emma'},
    ]),
  },
  {
    id: 'group_runner',
    name: 'Løbeklubben',
    description: 'Løbetræning og maratonforberedelse',
    image: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?auto=format&fit=crop&w=600&q=80',
    members: addCurrentUserMember([
      {id: '3', name: 'Lars'},
      {id: '8', name: 'Nicolai'},
      {id: '9', name: 'Amalie'},
    ]),
  },
];

export const useGroupStore = create<GroupState>(set => ({
  groups: mockGroups,
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


