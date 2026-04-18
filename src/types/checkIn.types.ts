/**
 * Check-in types (Firestore legacy + Supabase)
 * @see BACKEND_README.md for Firestore collection structure
 */

/** Payload til submitCheckIn (Firestore eller Supabase) */
export interface SubmitCheckInParams {
  userId: string;
  gymId: number;
  gymName: string;
  city?: string;
  workoutType?: string;
  note?: string;
  displayName: string;
  userInitials?: string;
}

export interface CheckIn {
  id: string;
  userId: string;
  gymId: number;
  gymName: string;
  timestamp: Date;
  workoutType?: string;
  note?: string;
  durationMinutes?: number;
}

/** Payload for submitting a check-in */
export interface CheckInPayload {
  userId: string;
  gymId: number;
  gymName: string;
  checkInTime: Date;
  workoutType?: string;
  note?: string;
}
