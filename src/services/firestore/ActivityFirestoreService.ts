/**
 * Activity Firestore Service – realtime activity feed (Firestore).
 * Uden native Firebase: tom feed, ingen onSnapshot.
 */

import firestore from '@react-native-firebase/firestore';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {COLLECTIONS} from './firestoreConfig';
import type {ActivityEvent} from '@/types/activity.types';

function toDate(t: unknown): Date {
  if (t instanceof Date) return t;
  if (t && typeof t === 'object' && 'seconds' in t) {
    const {seconds, nanoseconds} = t as {seconds: number; nanoseconds: number};
    return new Date(seconds * 1000 + nanoseconds / 1e6);
  }
  return new Date();
}

function docToActivityEvent(doc: {id: string; data: () => Record<string, unknown> | undefined}): ActivityEvent {
  const data = doc.data();
  const id = doc.id;
  const createdAt = data?.createdAt ? toDate(data.createdAt) : new Date();

  return {
    id,
    type: (data?.type as ActivityEvent['type']) ?? 'check_in',
    userId: data?.userId ?? '',
    displayName: data?.userName ?? 'Bruger',
    userName: data?.userName,
    userInitials: data?.userInitials,
    profileImageUrl: data?.profileImageUrl,
    message: data?.text ?? '',
    text: data?.text,
    secondaryInfo: data?.metadata ? JSON.stringify(data.metadata) : undefined,
    timestamp: createdAt,
    gymName: data?.gymName,
    gym: data?.gymName,
    city: data?.city,
    scope: 'friends',
  };
}

export interface SubscribeToActivitiesOptions {
  limit?: number;
}

/**
 * Subscribe to activities collection – realtime updates.
 * Returns unsubscribe function.
 */
export function subscribeToActivities(
  _userId: string,
  onUpdate: (events: ActivityEvent[]) => void,
  onError?: (err: Error) => void,
  options: SubscribeToActivitiesOptions = {}
): () => void {
  if (!isFirebaseNativeAvailable()) {
    queueMicrotask(() => onUpdate([]));
    return () => {};
  }

  const limit = options.limit ?? 50;

  const unsubscribe = firestore()
    .collection(COLLECTIONS.activities)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .onSnapshot(
      snapshot => {
        const events = snapshot.docs.map(doc => docToActivityEvent(doc));
        onUpdate(events);
      },
      err => {
        console.warn('[ActivityFirestore] onSnapshot error:', err);
        onError?.(err);
        onUpdate([]);
      }
    );

  return unsubscribe;
}
