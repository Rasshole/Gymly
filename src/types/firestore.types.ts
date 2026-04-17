/**
 * Firestore document types – Gymly collections
 * Aligns with Firestore security rules and indexes
 */

/** Firestore timestamp – seconds + nanoseconds or Date when read */
export type FirestoreTimestamp = Date | {seconds: number; nanoseconds: number};

/** users/{userId} */
export interface FirestoreUser {
  id: string;
  displayName: string;
  username: string;
  homeGym?: string;
  city?: string;
  streak: number;
  weeklyCheckins: number;
  weeklyMinutes: number;
  badgesCount: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/** checkins/{checkinId} */
export interface FirestoreCheckIn {
  id: string;
  userId: string;
  gymId: string;
  gymName: string;
  city?: string;
  workoutType?: string;
  note?: string;
  createdAt: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp; // For presence: createdAt + 90 min
}

/** activities/{activityId} */
export interface FirestoreActivity {
  id: string;
  type: 'check_in' | 'streak_milestone' | 'workout_completed' | 'joined_group' | 'leaderboard_movement' | 'badge_unlocked' | 'online_now';
  userId: string;
  userName: string;
  userInitials?: string;
  gymId?: string;
  gymName?: string;
  city?: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: FirestoreTimestamp;
}

/** gyms/{gymId} – presence cache */
export interface FirestoreGym {
  id: string;
  name: string;
  city?: string;
  activeUsersCount: number;
  updatedAt: FirestoreTimestamp;
}

/** notifications/{notificationId} */
export interface FirestoreNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: FirestoreTimestamp;
}
