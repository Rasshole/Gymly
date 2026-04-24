/**
 * CheckinService – tjek-ind i skyen.
 * Native Firebase: Firestore (checkins + activities).
 * Ellers: Supabase `check_ins` (kræver migration 20260328130000_check_ins.sql).
 */

import firestore from '@react-native-firebase/firestore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {submitCheckInSupabase} from '@/services/supabase/checkInService';
import type {CheckInSubmitResult, SubmitCheckInParams} from '@/types/checkIn.types';
import {COLLECTIONS} from './firestoreConfig';

export type {SubmitCheckInParams} from '@/types/checkIn.types';

async function submitCheckInFirestore(
  params: SubmitCheckInParams,
): Promise<CheckInSubmitResult> {
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
  return {id: checkInRef.id, startedAt: now.toDate()};
}

/**
 * Gemmer tjek-ind: Firestore hvis native Firebase findes, ellers Supabase.
 */
export async function submitCheckIn(
  params: SubmitCheckInParams,
): Promise<CheckInSubmitResult> {
  if (!isFirebaseNativeAvailable()) {
    return submitCheckInSupabase(params);
  }
  return submitCheckInFirestore(params);
}
