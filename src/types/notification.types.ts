/**
 * Notification types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export type NotificationType =
  | 'friend_checkin'
  | 'friend_request'
  | 'message'
  | 'workout_invite'
  | 'invite_response'
  | 'streak_milestone'
  | 'group_invite'
  | 'leaderboard_movement'
  | 'badge_unlocked';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  friendName?: string;
  gymName?: string;
  timestamp: Date;
  read: boolean;
  checkInTime?: Date;
  isActive?: boolean;
  checkOutTime?: Date;
  workoutInviteId?: string;
  planId?: string;
  gymId?: number;
  muscles?: string[];
  scheduledAt?: Date;
  joined?: boolean;
  streakCount?: number;
  groupName?: string;
  groupId?: string;
  rankChange?: number;
  newRank?: number;
  badgeName?: string;
}
