/**
 * Venner ved check-in.
 * Supabase: venner får INSERT via Realtime (FriendCheckInRealtimeSync) + samme RLS som SELECT.
 * Native Firebase: kan udvides med FCM her.
 */

import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';

export type NotifyFriendsOfCheckInParams = {
  actorUserId: string;
  displayName: string;
  gymId: string;
  gymName: string;
  city?: string;
  workoutEncoded?: string;
};

export async function notifyFriendsOfCheckIn(
  _params: NotifyFriendsOfCheckInParams,
): Promise<void> {
  if (!isFirebaseNativeAvailable()) {
    return;
  }
  /* TODO: Firestore + FCM når native Firebase bruges til check-ins */
}
