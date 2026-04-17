/**
 * Leaderboard Service — Firestore leaderboardStats / gym underlister
 */

import firestore from '@react-native-firebase/firestore';
import {USE_FIRESTORE_LEADERBOARD, LEADERBOARD_PAGE_SIZE} from '@/config/leaderboardConfig';
import {isFirebaseNativeAvailable} from '@/services/firebase/nativeAvailability';
import {getFriendIdsForUser} from '@/services/firestore/friendIdsService';
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

const emptyResult: FetchLeaderboardResult = {
  entries: [],
  hasMore: false,
  lastDoc: null,
};

function getOrderByFieldPath(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
): string {
  const base = CATEGORY_TO_FIRESTORE_FIELD[category as keyof typeof CATEGORY_TO_FIRESTORE_FIELD];
  if (!base) {
    return 'activityScore.allTime';
  }
  const periodKey = PERIOD_TO_FIRESTORE_KEY[period];
  if (category === 'streak' || category === 'discipline') {
    return String(base);
  }
  if (
    category.startsWith('strength') ||
    ['benchPress', 'squat', 'deadlift'].includes(category)
  ) {
    return String(base);
  }
  return `${base}.${periodKey}`;
}

function formatValueForCategory(category: LeaderboardCategory, value: number): string {
  const format = (n: number, s: string) => (n === 1 ? `1 ${s}` : `${n} ${s}`);
  switch (category) {
    case 'checkIns':
      return format(value, 'check-in');
    case 'prs':
      return format(value, 'PR');
    case 'trainingTime':
      return `${value} min`;
    case 'socialTraining':
      return format(value, 'træning med venner');
    case 'streak':
      return format(value, 'dags stribe');
    case 'discipline':
      return format(value, 'muskelgruppe');
    case 'benchPress':
      return `Bænkpres: ${value} kg`;
    case 'squat':
      return `Squat: ${value} kg`;
    case 'deadlift':
      return `Dødløft: ${value} kg`;
    case 'globalActivity':
    case 'friendsActivity':
      return `${value} point`;
    default:
      return `${value}`;
  }
}

function getValueFromDoc(
  docData: Record<string, unknown> | undefined,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
): number {
  if (!docData) {
    return 0;
  }
  const periodKey = PERIOD_TO_FIRESTORE_KEY[period];
  switch (category) {
    case 'checkIns':
      return (docData.checkIns as {weekly?: number; monthly?: number; allTime?: number} | undefined)?.[
        periodKey
      ] ?? 0;
    case 'prs':
      return (docData.prs as {weekly?: number; monthly?: number; allTime?: number} | undefined)?.[
        periodKey
      ] ?? 0;
    case 'trainingTime':
      return (
        (docData.trainingMinutes as {weekly?: number; monthly?: number; allTime?: number} | undefined)?.[
          periodKey
        ] ?? 0
      );
    case 'socialTraining':
      return (
        (docData.socialWorkouts as {weekly?: number; monthly?: number; allTime?: number} | undefined)?.[
          periodKey
        ] ?? 0
      );
    case 'streak':
      return (docData.streak as number) ?? 0;
    case 'discipline':
      return (
        (docData.muscleGroupsTrained as {weekly?: number; monthly?: number; allTime?: number} | undefined)?.[
          periodKey
        ] ??
        (docData.muscleGroupsTrained as number) ??
        0
      );
    case 'benchPress':
      return (docData.strengthPRs as {bench?: number} | undefined)?.bench ?? 0;
    case 'squat':
      return (docData.strengthPRs as {squat?: number} | undefined)?.squat ?? 0;
    case 'deadlift':
      return (docData.strengthPRs as {deadlift?: number} | undefined)?.deadlift ?? 0;
    case 'globalActivity':
    case 'friendsActivity':
      return (
        (docData.activityScore as {weekly?: number; monthly?: number; allTime?: number} | undefined)?.[
          periodKey
        ] ?? 0
      );
    default:
      return 0;
  }
}

type StatsDoc = {
  id: string;
  data: () => Record<string, unknown> | undefined;
};

function docToEntry(
  doc: StatsDoc,
  rank: number,
  currentUserId: string,
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  friendIds: Set<string>,
): LeaderboardEntry {
  const data = doc.data() ?? {};
  const userId = doc.id;
  const value = getValueFromDoc(data, category, period);
  return {
    rank,
    userId,
    displayName: (data.displayName as string) || 'Bruger',
    profileImageUrl: data.photoURL as string | undefined,
    value,
    valueLabel: formatValueForCategory(category, value),
    isCurrentUser: userId === currentUserId,
    isFriend: friendIds.has(userId),
  };
}

async function safeFirestore<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('[Leaderboard] Firestore:', err);
    return fallback;
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
  limit = LEADERBOARD_PAGE_SIZE,
): Promise<FetchLeaderboardResult> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    const entries = store.getGlobalLeaderboard(category, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  }

  if (!isFirebaseNativeAvailable()) {
    return emptyResult;
  }

  const friendIds = new Set(await getFriendIdsForUser(currentUserId));

  return safeFirestore(async () => {
    const orderByPath = getOrderByFieldPath(category, period);
    const snapshot = await firestore()
      .collection(COLLECTION_STATS)
      .orderBy(orderByPath, 'desc')
      .limit(limit + 1)
      .get();

    const entries: LeaderboardEntry[] = [];
    snapshot.docs.slice(0, limit).forEach((doc, idx) => {
      entries.push(
        docToEntry(doc, idx + 1, currentUserId, category, period, friendIds),
      );
    });

    return {
      entries,
      hasMore: snapshot.docs.length > limit,
      lastDoc: snapshot.docs[limit - 1]?.ref ?? null,
    };
  }, emptyResult);
}

export async function fetchFriendsLeaderboard(
  category: LeaderboardCategory,
  period: LeaderboardPeriod,
  currentUserId: string,
  limit = LEADERBOARD_PAGE_SIZE,
): Promise<FetchLeaderboardResult> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    const entries = store.getFriendsLeaderboard(category, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  }

  if (!isFirebaseNativeAvailable()) {
    return emptyResult;
  }

  return safeFirestore(async () => {
    const friends = await getFriendIdsForUser(currentUserId);
    const idsToFetch = [...new Set([...friends, currentUserId])];
    if (idsToFetch.length === 0) {
      return emptyResult;
    }

    const db = firestore();
    const docs = await Promise.all(
      idsToFetch.map(id => db.collection(COLLECTION_STATS).doc(id).get()),
    );
    const validDocs = docs.filter(d => d.exists) as StatsDoc[];
    const friendSet = new Set(friends);

    validDocs.sort((a, b) => {
      const va = getValueFromDoc(a.data(), category, period);
      const vb = getValueFromDoc(b.data(), category, period);
      return vb - va;
    });

    const sliced = validDocs.slice(0, limit);
    const entries: LeaderboardEntry[] = sliced.map((doc, idx) =>
      docToEntry(doc, idx + 1, currentUserId, category, period, friendSet),
    );

    return {entries, hasMore: validDocs.length > limit, lastDoc: null};
  }, emptyResult);
}

export async function fetchGymLeaderboard(
  gymId: number,
  gymName: string,
  period: LeaderboardPeriod,
  currentUserId: string,
  limit = LEADERBOARD_PAGE_SIZE,
): Promise<FetchLeaderboardResult> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    const entries = store.getGymLeaderboard(gymId, gymName, period, currentUserId);
    return {entries: entries.slice(0, limit), hasMore: entries.length > limit, lastDoc: null};
  }

  if (!isFirebaseNativeAvailable()) {
    return emptyResult;
  }

  const friendIds = new Set(await getFriendIdsForUser(currentUserId));

  return safeFirestore(async () => {
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
        isFriend: friendIds.has(userId),
        isWeeklyChampion: champion?.userId === userId,
      };
    });

    return {
      entries,
      hasMore: snapshot.docs.length >= limit,
      lastDoc: snapshot.docs[snapshot.docs.length - 1]?.ref ?? null,
    };
  }, emptyResult);
}

export async function fetchWeeklyChampion(gymId: number): Promise<WeeklyChampion | null> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    const store = useLeaderboardStore.getState();
    return store.getWeeklyChampion(gymId) ?? null;
  }
  if (!isFirebaseNativeAvailable()) {
    return null;
  }
  return safeFirestore(() => fetchWeeklyChampionFromFirestore(gymId), null);
}

export async function fetchWeeklyChampions(): Promise<WeeklyChampion[]> {
  if (!USE_FIRESTORE_LEADERBOARD) {
    return useLeaderboardStore.getState().getWeeklyChampions();
  }
  if (!isFirebaseNativeAvailable()) {
    return [];
  }
  return safeFirestore(fetchWeeklyChampionsFromFirestore, []);
}

async function fetchWeeklyChampionFromFirestore(gymId: number): Promise<WeeklyChampion | null> {
  const doc = await firestore()
    .collection(COLLECTION_GYMS)
    .doc(String(gymId))
    .collection('meta')
    .doc('weeklyChampion')
    .get();

  if (!doc.exists) {
    return null;
  }
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
    const champ = await fetchWeeklyChampionFromFirestore(gymId as number);
    if (champ) {
      champions.push(champ);
    }
  }
  return champions;
}
