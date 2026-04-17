/**
 * UserService – profilfelter fra Firestore users/{userId}
 */

import firestore from '@react-native-firebase/firestore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {COLLECTIONS} from './firestoreConfig';

export interface UserStats {
  streak: number;
  weeklyCheckins: number;
  weeklyMinutes: number;
  badgesCount: number;
  homeGym?: string;
  city?: string;
  totalCheckIns?: number;
  longestStreak?: number;
  totalTrainingMinutes?: number;
  friendsCount?: number;
  followersCount?: number;
  followingCount?: number;
  bio?: string;
}

/**
 * Hent brugerstatistik. Returnerer null hvis dokument mangler eller ved fejl.
 */
export async function getUserStats(userId: string): Promise<UserStats | null> {
  if (!isFirebaseNativeAvailable()) {
    return null;
  }
  try {
    const doc = await firestore()
      .collection(COLLECTIONS.users)
      .doc(userId)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return {
      streak: data.streak ?? 0,
      weeklyCheckins: data.weeklyCheckins ?? 0,
      weeklyMinutes: data.weeklyMinutes ?? 0,
      badgesCount: data.badgesCount ?? 0,
      homeGym: data.homeGym,
      city: data.city,
      totalCheckIns: data.totalCheckIns ?? 0,
      longestStreak: data.longestStreak ?? data.streak ?? 0,
      totalTrainingMinutes: data.totalTrainingMinutes ?? 0,
      friendsCount: data.friendsCount ?? 0,
      followersCount: data.followersCount ?? 0,
      followingCount: data.followingCount ?? 0,
      bio: data.bio,
    };
  } catch (err) {
    console.warn('[UserService] getUserStats error:', err);
    return null;
  }
}
