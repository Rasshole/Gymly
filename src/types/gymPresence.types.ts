/**
 * Gym presence UI types (aktive gyms / brugerliste).
 */

export type UserPresenceStatus =
  | 'training_now'       // træner nu
  | 'active_minutes'     // aktiv for X min siden
  | 'checked_in_minutes'; // checkede ind for X min siden

export interface UserPresence {
  id: string;
  name: string;
  avatar?: string | null;
  /** Aktiv sessions workout_type (til Live i centret) */
  workoutType?: string | null;
  status: UserPresenceStatus;
  lastActivity: Date;
  /** Minutes ago when status is active_minutes or checked_in_minutes */
  minutesAgo?: number;
}

export interface GymPresence {
  gymId: string;
  gymName: string;
  activeUsers: number;
  userList: UserPresence[];
}
