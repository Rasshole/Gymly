/**
 * CheckinService – Firestore check-in flow
 * Writes check-in + activity, used by CheckInScreen.
 * Supabase er auth + feed; Firestore check-in kræver konfigureret native Firebase.
 */

import firestore from '@react-native-firebase/firestore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {COLLECTIONS} from './firestoreConfig';

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

/**
 * Submit check-in to Firestore.
 * Creates: checkins doc + activities doc (for feed).
 * Throws on Firestore error.
 */
export async function submitCheckIn(params: SubmitCheckInParams): Promise<string> {
  if (!isFirebaseNativeAvailable()) {
    throw new Error(
      'Firebase er ikke konfigureret på denne build. Tjek-ind i skyen er ikke tilgængelig — tilføj native Firebase eller migrér tjek-ind til Supabase.',
    );
  }

  const {
    userId,
    gymId,
    gymName,
    city,
    workoutType,
    note,
    displayName,
    userInitials,
  } = params;

  const gymIdStr = String(gymId);
  const now = firestore.Timestamp.now();

  const checkInRef = firestore().collection(COLLECTIONS.checkins).doc();
  const activityRef = firestore().collection(COLLECTIONS.activities).doc();

  const batch = firestore().batch();

  // 1. Check-in document (userName for presence display)
  batch.set(checkInRef, {
    userId,
    userName: displayName,
    gymId: gymIdStr,
    gymName,
    city: city ?? null,
    workoutType: workoutType ?? null,
    note: note ?? null,
    createdAt: now,
  });

  // 2. Activity document (for feed)
  const activityText = `checkede ind i ${gymName}`;
  batch.set(activityRef, {
    type: 'check_in',
    userId,
    userName: displayName,
    userInitials: userInitials ?? displayName.charAt(0).toUpperCase(),
    gymId: gymIdStr,
    gymName,
    city: city ?? null,
    text: activityText,
    metadata: {workoutType: workoutType ?? null, note: note ?? null},
    createdAt: now,
  });

  await batch.commit();
  return checkInRef.id;
}
