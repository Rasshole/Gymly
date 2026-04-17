/**
 * Activity types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export type ActivityEventType =
  | 'check_in'
  | 'streak_milestone'
  | 'workout_completed'
  | 'joined_group'
  | 'leaderboard_movement'
  | 'badge_unlocked'
  | 'online_now';

export type ActivityScope = 'friends' | 'groups' | 'local' | 'trending';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  userId: string;
  displayName: string;
  userName?: string;
  userInitials?: string;
  profileImageUrl?: string;
  message: string;
  text?: string;
  secondaryInfo?: string;
  timestamp: Date;
  gymName?: string;
  gym?: string;
  city?: string;
  groupName?: string;
  streakCount?: number;
  streak?: number;
  minutes?: number;
  rank?: number;
  rankChange?: number;
  badgeName?: string;
  badge?: string;
  scope?: ActivityScope;
  isFriend?: boolean;
}
