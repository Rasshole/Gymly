/**
 * Leaderboard Service
 * Abstraktionslag: Mock (Zustand) eller Firestore
 */

import firestore from '@react-native-firebase/firestore';
import {USE_FIRESTORE_LEADERBOARD, LEADERBOARD_PAGE_SIZE} from '@/config/leaderboardConfig';
import {useLeaderboardStore} from '@/store/leaderboardStore';
import {
  CATEGORY_TO_FIRESTORE_FIELD,
  PERIOD_TO_FIRESTORE_KEY,
} from './firestoreLeaderboardTypes';
import type {
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardPeriod,
  WeeklyChampion,
} from '@/types/leaderboard.types';

const COLLECTION_STATS = 'leaderboardStats';
const COLLECTION_GYMS = 'gyms';
const FRIEND_IDS = new Set(['1', '2', '3', '4', '5']);

function getOrderByFieldPath(
  category: LeaderboardCategory,
  period: LeaderboardPeriod
): string {
  const base = CATEGORY_TO_FIRESTORE_FIELD[category as keyof typeof CATEGORY_TO_FIRESTORE_FIELD];
  if (!base) return 'activityScore.allTime';
  const periodKey = PERIOD_TO_FIRESTORE_KEY[period];
  if (category === 'streak' || category === 'discipline') {
    return String(base);
  }
  if (category.startsWith('strength') || ['benchPress', 'squat', 'deadlift'].includes(category)) {
    return String(base);
  }
  return `${base}.${periodKey}`;
}

function formatValueForCategory(category: LeaderboardCategory, value: number): string {
  const format = (n: number, s: string) => (n === 1 ? `1 ${s}` : `${n} ${s}`);
  switch (category) {
    case 'checkIns': return format(value, 'check-in');
    case 'prs': return format(value, 'PR');
    case 'trainingTime': return `${value} min`;
    case 'socialTraining': return format(value, 'træning med venner');
    case 'streak': return format(value, 'dags stribe');
    case 'discipline': return format(value, 'muskelgruppe');
    case 'benchPress': return `Bænkpres: ${value} kg`;
    case 'squat': return `Squat: ${value} kg`;
    case 'deadlift': return `Dødløft: ${value} kg`;
    case 'globalActivity':
    case 'friendsActivity': return `${value} point`;
    default: return `${value}`;
  }
}

function docToEntry(
  doc: any,
  rank: number,
  currentUserId: string,
  category: LeaderboardCategory
): LeaderboardEntry {
  const data = doc.data();
  const userId = doc.id;
  const value = getValueFromDoc(data, category, 'all');
  return {
    rank,
    userId,
    displayName: data.displayName || 'Bruger',
    profileImageUrl: data.photoURL,
    value,
    valueLabel: formatValueForCategory(category, value),
    isCurrentUser: userId === currentUserId,
    isFriend: FRIEND_IDS.has(userId),
  };
}

function getValueFromDoc(docData: any, category: LeaderboardCategory, period: LeaderboardPeriod): number {
  const periodKey = PERIOD_TO_FIRESTORE_KEY[period];
  switch (category) {
    case 'checkIns': return docData?.checkIns?.[periodKey] ?? 0;
    case 'prs': return docData?.prs?.[periodKey] ?? 0;
    case 'trainingTime': return docData?.trainingMinutes?.[periodKey] ?? 0;
    case 'socialTraining': return docData?.socialWorkouts?.[periodKey] ?? 0;
    case 'streak': return docData?.streak ?? 0;
    case 'discipline': return docData?.muscleGroupsTrained?.[periodKey] ?? docData?.muscleGroupsTrained ?? 0;
    case 'benchPress': return docData?.strengthPRs?.bench ?? 0;
    case 'squat': return docData?.strengthPRs?.squat ?? 0;
    case 'deadlift': return docData?.strengthPRs?.deadlift ?? 0;
    case 'globalActivity':
    case 'friendsActivity': return docData?.activityScore?.[periodKey] ?? 0;
    default: return 0;
  }
}

async function fallbackToMock<T>(fn: () => Promise<T>, mockFn: () => T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('[Leaderboard] Firestore fejl, bruger mock:', err);
    return mockFn();
  }
}

export interface FetchLeaderboardResult {
  entries: LeaderboardEntry[];
  hasMore: boolean;
  lastDoc: unknown;
}

export async function fetchGlobalLeaderboard(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  currentUserId: string,
  limit = LEADERBOARD_PAGE_SIZE
): Promise<FetchLeaderboardResult> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    const entries = store.getGlobalLeaderboard(category, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  }

  return fallbackToMock(async () => {
    const orderByPath = getOrderByFieldPath(category, period);
    const snapshot = await firestore()
      .collection(COLLECTION_STATS)
      .orderBy(orderByPath, 'desc')
      .limit(limit + 1)
      .get();

    const entries: LeaderboardEntry[] = [];
    snapshot.docs.slice(0, limit).forEach((doc, idx) => {
      entries.push(docToEntry(doc, idx + 1, currentUserId, category));
    });

    return {
      entries,
      hasMore: snapshot.docs.length > limit,
      lastDoc: snapshot.docs[limit - 1]?.ref ?? null,
    };
  }, () => {
    const store = useLeaderboardStore.getState();
    const entries = store.getGlobalLeaderboard(category, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  });
}

export async function fetchFriendsLeaderboard(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  currentUserId: string,
  limit = LEADERBOARD_PAGE_SIZE
): Promise<FetchLeaderboardResult> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    const entries = store.getFriendsLeaderboard(category, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  }

  return fallbackToMock(async () => {
    const friendIds = Array.from(FRIEND_IDS);
    const idsToFetch = friendIds.includes(currentUserId) ? friendIds : [...friendIds, currentUserId];
    if (idsToFetch.length === 0) return {entries: [], hasMore: false, lastDoc: null};

    const db = firestore();
    const docs = await Promise.all(
      idsToFetch.map(id => db.collection(COLLECTION_STATS).doc(id).get())
    );
    const validDocs = docs.filter(d => d.exists);
    const periodKey = PERIOD_TO_FIRESTORE_KEY[period];
    validDocs.sort((a, b) => {
      const va = a.data()?.activityScore?.[periodKey] ?? 0;
      const vb = b.data()?.activityScore?.[periodKey] ?? 0;
      return vb - va;
    });

    const entries: LeaderboardEntry[] = validDocs.map((doc, idx) =>
      docToEntry(doc, idx + 1, currentUserId, 'friendsActivity')
    );

    return {entries, hasMore: false, lastDoc: null};
  }, () => {
    const store = useLeaderboardStore.getState();
    const entries = store.getFriendsLeaderboard(category, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  });
}

export async function fetchGymLeaderboard(
  gymId: number,
  gymName: string,
  period: LeaderboardPeriod,
  currentUserId: string,
  limit = LEADERBOARD_PAGE_SIZE
): Promise<FetchLeaderboardResult> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    const entries = store.getGymLeaderboard(gymId, gymName, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  }

  return fallbackToMock(async () => {
    const snapshot = await firestore()
      .collection(COLLECTION_GYMS)
      .doc(String(gymId))
      .collection('leaderboardEntries')
      .orderBy('score', 'desc')
      .limit(limit)
      .get();

    const champion = await fetchWeeklyChampionFromFirestore(gymId);
    const entries: LeaderboardEntry[] = snapshot.docs.map((doc, idx) => {
      const d = doc.data();
      const userId = doc.id;
      return {
        rank: idx + 1,
        userId,
        displayName: d.displayName || 'Bruger',
        profileImageUrl: d.photoURL,
        value: d.checkIns ?? d.score ?? 0,
        valueLabel: `${d.checkIns ?? 0} besøg`,
        gymName,
        gymId,
        isCurrentUser: userId === currentUserId,
        isFriend: FRIEND_IDS.has(userId),
        isWeeklyChampion: champion?.userId === userId,
      };
    });

    return {entries, hasMore: snapshot.docs.length >= limit, lastDoc: snapshot.docs[snapshot.docs.length - 1]?.ref ?? null};
  }, () => {
    const store = useLeaderboardStore.getState();
    const entries = store.getGymLeaderboard(gymId, gymName, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  });
}

export async function fetchWeeklyChampion(gymId: number): Promise<WeeklyChampion | null> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    return store.getWeeklyChampion(gymId) ?? null;
  }
  return fallbackToMock(
    () => fetchWeeklyChampionFromFirestore(gymId),
    () => useLeaderboardStore.getState().getWeeklyChampion(gymId) ?? null
  );
}

export async function fetchWeeklyChampions(): Promise<WeeklyChampion[]> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    return useLeaderboardStore.getState().getWeeklyChampions();
  }
  return fallbackToMock(
    fetchWeeklyChampionsFromFirestore,
    () => useLeaderboardStore.getState().getWeeklyChampions()
  );
}

async function fetchWeeklyChampionFromFirestore(gymId: number): Promise<WeeklyChampion | null> {
  const doc = await firestore()
    .collection(COLLECTION_GYMS)
    .doc(String(gymId))
    .collection('meta')
    .doc('weeklyChampion')
    .get();

  if (!doc.exists) return null;
  const d = doc.data();
  return {
    gymId,
    gymName: d?.gymName || `Center ${gymId}`,
    userId: d?.userId || '',
    displayName: d?.displayName || 'Ukendt',
    profileImageUrl: d?.photoURL,
    activityScore: d?.activityScore ?? 0,
  };
}

async function fetchWeeklyChampionsFromFirestore(): Promise<WeeklyChampion[]> {
  const gymsSnapshot = await firestore().collection(COLLECTION_GYMS).limit(50).get();
  const champions: WeeklyChampion[] = [];
  for (const gymDoc of gymsSnapshot.docs) {
    const gymId = parseInt(gymDoc.id, 10) || gymDoc.id;
    const champ = await fetchWeeklyChampionFromFirestore(gymId);
    if (champ) champions.push(champ);
  }
  return champions;
}
