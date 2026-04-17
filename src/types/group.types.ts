/**
 * Group types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export interface GroupMember {
  id: string;
  name: string;
  avatar?: string;
  isOnline?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  members?: GroupMember[];
  imageUrl?: string;
  isJoined?: boolean;
  isPrivate?: boolean;
  adminId?: string;
  location?: string;
  focus?: string;
  activityCount?: number;
  totalCheckIns?: number;
  createdAt?: Date;
}

export interface GroupActivity {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  type: 'check_in' | 'streak' | 'joined';
  message: string;
  timestamp: Date;
  gymName?: string;
}
