/**
 * Check-in types – Firestore-ready
 * @see BACKEND_README.md for Firestore collection structure
 */

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
