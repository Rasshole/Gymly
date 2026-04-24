/**
 * Check-in types (Firestore legacy + Supabase)
 * @see BACKEND_README.md for Firestore collection structure
 */

export type CheckInEndReason =
  | 'user'
  | 'inactivity'
  | 'geofence_buffer'
  | 'geofence_outside';

/** Række fra public.check_ins (session-lifecycle) */
export interface SupabaseCheckInRow {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string;
  city: string | null;
  workout_type: string | null;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  last_seen_at?: string | null;
  geofence_grace_started_at?: string | null;
  geofence_grace_kind?: 'buffer' | 'outside' | null;
  end_reason?: string | null;
  planned_workout_id?: string | null;
}

export interface CheckInSubmitResult {
  id: string;
  startedAt: Date;
}

/** Payload til submitCheckIn (Firestore eller Supabase) */
export interface SubmitCheckInParams {
  userId: string;
  gymId: string;
  gymName: string;
  city?: string;
  workoutType?: string;
  note?: string;
  displayName: string;
  userInitials?: string;
  /** Når tjek-ind matcher en accepteret planlagt træning (venne-invitation) */
  plannedWorkoutId?: string | null;
}

export interface CheckIn {
  id: string;
  userId: string;
  gymId: string;
  gymName: string;
  timestamp: Date;
  workoutType?: string;
  note?: string;
  durationMinutes?: number;
}

/** Payload for submitting a check-in */
export interface CheckInPayload {
  userId: string;
  gymId: string;
  gymName: string;
  checkInTime: Date;
  workoutType?: string;
  note?: string;
}
