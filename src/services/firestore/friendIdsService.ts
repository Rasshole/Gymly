/**
 * Venne-ID'er til ranglister: primært Supabase, ellers users/{id}/friends (legacy).
 */

import firestore from '@react-native-firebase/firestore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {getMyFriendIds} from '@/services/supabase/friendService';
import {COLLECTIONS} from './firestoreConfig';

export async function getFriendIdsForUser(userId: string): Promise<string[]> {
  if (!userId) {
    return [];
  }
  try {
    const supa = await getMyFriendIds(userId);
    return [...supa];
  } catch {
    /* Supabase utilgængelig — legacy */
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
