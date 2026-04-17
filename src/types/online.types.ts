/**
 * Online/Active users types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export type OnlineUserStatus =
  | 'training_now'
  | 'active_minutes'
  | 'online_now';

export interface OnlineUser {
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  avatarInitials?: string;
  gymName?: string;
  gymId?: number;
  city?: string;
  lastActive: Date;
  status: OnlineUserStatus;
  activeMinutesAgo?: number;
  muscleGroup?: string;
  badge?: string;
  isFriend?: boolean;
}
