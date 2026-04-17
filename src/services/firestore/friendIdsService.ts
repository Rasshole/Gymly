/**
 * Friend IDs for the current user — users/{userId}/friends/{friendId}
 */

import firestore from '@react-native-firebase/firestore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {COLLECTIONS} from './firestoreConfig';

export async function getFriendIdsForUser(userId: string): Promise<string[]> {
  if (!userId) {
    return [];
  }
  if (!isFirebaseNativeAvailable()) {
    return [];
  }
  try {
    const snap = await firestore()
      .collection(COLLECTIONS.users)
      .doc(userId)
      .collection('friends')
      .get();
    return snap.docs.map(d => d.id);
  } catch (err) {
    console.warn('[friendIdsService] getFriendIdsForUser:', err);
    return [];
  }
}
