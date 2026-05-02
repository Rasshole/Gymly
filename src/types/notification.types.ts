/**
 * Notification types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

export type NotificationType =
  | 'friend_checkin'
  | 'friend_request'
  | 'friend_request_accepted'
  | 'message'
  | 'workout_invite'
  | 'invite_response'
  | 'streak_milestone'
  | 'group_invite'
  | 'leaderboard_movement'
  | 'badge_unlocked'
  | 'badge_progress'
  | 'planned_workout_invite'
  | 'planned_workout_accepted'
  | 'planned_workout_declined'
  | 'planned_workout_reminder'
  | 'workout_reaction'
  | 'biceps_reaction';

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
  gymId?: string;
  muscles?: string[];
  scheduledAt?: Date;
  joined?: boolean;
  streakCount?: number;
  groupName?: string;
  groupId?: string;
  rankChange?: number;
  newRank?: number;
  badgeName?: string;
  /** Fra public.notifications.data (badge_unlocked / badge_progress / streak_milestone) */
  badgeId?: string;
  /** Ulæst besked: bruges til at navigere og rydde notifikationer når chat åbnes */
  chatId?: string;
  friendId?: string;
  /** Venneanmodning (undgå dubletter når Realtime udsendes igen) */
  friendRequestId?: string;
  /** planlagt træning (Supabase) */
  plannedWorkoutId?: string;
  threadId?: string;
  /** check_ins.id fra friend_checked_in data (biceps-reaktion) */
  checkInId?: string;
  /** Rå type fra public.notifications hvis kilden er Supabase */
  dbType?: string;
  dataPayload?: Record<string, unknown>;
  /** Oprettet i Supabase (public.notifications) */
  isFromServer?: boolean;
  /** Lokalt efter accept/afvis (ingen serverfelt) */
  friendRequestUiState?: 'pending' | 'accepted' | 'declined';
}
