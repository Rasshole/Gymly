import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {AppState} from 'react-native';
import {supabase} from '@/services/supabase/supabaseClient';
import {
  emitProfileStatsSelf,
  subscribeProfileStatsSelf,
} from '@/realtime/profileStatsSelfBridge';
import {fetchUserBadges} from '@/services/supabase/userBadgesService';
import {
  getUserStats as fetchUserStatsFromProfile,
  subscribeUserStats,
} from '@/services/supabase/userStatsService';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {fetchCompletedCheckInsForStats} from '@/services/supabase/trainingStatsQuery';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {getDemoRecentSessions, getDemoTrainingStatsNumbers} from '@/demo/demoTrainingStatsSeed';
import {useFriendStore} from '@/store/friendStore';
import {
  collectTrainingDayKeys,
  computeCurrentStreakFromTrainingDays,
  computeLongestStreakFromTrainingDays,
  sessionDurationMinutes,
} from '@/utils/trainingStatsFromCheckIns';
import {
  toProfileCompletedSession,
  type CompletedTrainingSession,
} from '@/services/training/completedTraining';

const STORAGE_KEY = 'gymly_training_stats_v1';

export type TrainingStatsSnapshot = {
  totalCheckIns: number;
  totalTrainingMinutes: number;
  currentStreakDays: number;
  longestStreakDays: number;
  unlockedBadgesCount: number;
  friendsCount: number;
  groupsCount: number;
  recentSessions: ProfileCompletedSession[];
  activeSessionMinutes: number;
  loading: boolean;
  error: string | null;
};

/** Persisted fields (no Date objects / loading flags). */
type PersistedTrainingStats = {
  totalCheckIns: number;
  totalTrainingMinutes: number;
  currentStreakDays: number;
  longestStreakDays: number;
  unlockedBadgesCount: number;
  friendsCount: number;
  groupsCount: number;
};

type PersistedByUser = Record<string, PersistedTrainingStats>;

const EMPTY_SNAPSHOT: TrainingStatsSnapshot = {
  totalCheckIns: 0,
  totalTrainingMinutes: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
  unlockedBadgesCount: 0,
  friendsCount: 0,
  groupsCount: 0,
  recentSessions: [],
  activeSessionMinutes: 0,
  loading: false,
  error: null,
};

function toPersisted(snapshot: TrainingStatsSnapshot): PersistedTrainingStats {
  return {
    totalCheckIns: snapshot.totalCheckIns,
    totalTrainingMinutes: snapshot.totalTrainingMinutes,
    currentStreakDays: snapshot.currentStreakDays,
    longestStreakDays: snapshot.longestStreakDays,
    unlockedBadgesCount: snapshot.unlockedBadgesCount,
    friendsCount: snapshot.friendsCount,
    groupsCount: snapshot.groupsCount,
  };
}

function rowToSession(row: {
  id: string;
  gym_name: string;
  started_at: string;
  ended_at: string;
  workout_type: string | null;
}): ProfileCompletedSession {
  const startedAt = new Date(row.started_at);
  const endedAt = new Date(row.ended_at);
  return {
    id: row.id,
    gymName: row.gym_name?.trim() || 'Center',
    startedAt,
    endedAt,
    durationMinutes: sessionDurationMinutes(startedAt, endedAt),
    workoutType: row.workout_type ?? null,
    partnerDisplayName: null,
  };
}

function deriveFromSessions(sessions: ProfileCompletedSession[]): Omit<
  TrainingStatsSnapshot,
  'unlockedBadgesCount' | 'friendsCount' | 'groupsCount' | 'loading' | 'error' | 'activeSessionMinutes'
> {
  const dayKeys = collectTrainingDayKeys(
    sessions.map(s => ({
      started_at: s.startedAt.toISOString(),
      ended_at: s.endedAt.toISOString(),
      is_active: false,
    })),
  );
  const currentStreakDays = computeCurrentStreakFromTrainingDays(dayKeys);
  const longestStreakDays = Math.max(
    computeLongestStreakFromTrainingDays(dayKeys),
    currentStreakDays,
  );
  return {
    totalCheckIns: sessions.length,
    totalTrainingMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
    currentStreakDays,
    longestStreakDays,
    recentSessions: [...sessions].sort(
      (a, b) => b.endedAt.getTime() - a.endedAt.getTime(),
    ),
  };
}

async function readPersistedMap(): Promise<PersistedByUser> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PersistedByUser;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writePersistedUser(
  userId: string,
  stats: PersistedTrainingStats,
): Promise<void> {
  try {
    const map = await readPersistedMap();
    map[userId] = stats;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore persist errors */
  }
}

type TrainingStatsStoreState = {
  byUserId: Record<string, TrainingStatsSnapshot>;
  loadLocks: Set<string>;
  pendingReload: Set<string>;
  hydrated: boolean;
  getSnapshot: (userId: string | undefined) => TrainingStatsSnapshot;
  hydrate: () => Promise<void>;
  clear: () => void;
  load: (userId: string) => Promise<void>;
  applyCompleted: (userId: string, completed: CompletedTrainingSession) => void;
  ensureSubscribed: (userId: string) => () => void;
};

const subscriptionCleanups = new Map<string, () => void>();
const subscriptionRefCount = new Map<string, number>();

export const useTrainingStatsStore = create<TrainingStatsStoreState>((set, get) => ({
  byUserId: {},
  loadLocks: new Set(),
  pendingReload: new Set(),
  hydrated: false,

  getSnapshot: userId => {
    if (!userId) {
      return EMPTY_SNAPSHOT;
    }
    return get().byUserId[userId] ?? {...EMPTY_SNAPSHOT, loading: true};
  },

  hydrate: async () => {
    const map = await readPersistedMap();
    set(state => {
      const next = {...state.byUserId};
      for (const [userId, persisted] of Object.entries(map)) {
        const prev = next[userId];
        const hasLive =
          prev &&
          !prev.loading &&
          (prev.totalCheckIns > 0 ||
            prev.totalTrainingMinutes > 0 ||
            prev.currentStreakDays > 0);
        if (hasLive) {
          continue;
        }
        next[userId] = {
          ...EMPTY_SNAPSHOT,
          ...persisted,
          recentSessions: prev?.recentSessions ?? [],
          activeSessionMinutes: prev?.activeSessionMinutes ?? 0,
          loading: false,
          error: null,
        };
      }
      return {hydrated: true, byUserId: next};
    });
  },

  clear: () => {
    set({byUserId: {}, loadLocks: new Set(), pendingReload: new Set(), hydrated: false});
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  applyCompleted: (userId, completed) => {
    const session = toProfileCompletedSession(completed);
    set(state => {
      const prev = state.byUserId[userId] ?? {...EMPTY_SNAPSHOT, loading: false};
      const withoutDup = prev.recentSessions.filter(s => s.id !== session.id);
      const sessions = [session, ...withoutDup];
      const derived = deriveFromSessions(sessions);
      const next: TrainingStatsSnapshot = {
        ...prev,
        ...derived,
        loading: false,
        error: null,
      };
      void writePersistedUser(userId, toPersisted(next));
      return {
        byUserId: {
          ...state.byUserId,
          [userId]: next,
        },
      };
    });
    emitProfileStatsSelf(userId);
  },

  load: async userId => {
    if (!userId) {
      return;
    }
    if (isDemoContentMode()) {
      const fc = Math.max(28, useFriendStore.getState().friends.length);
      const n = getDemoTrainingStatsNumbers(fc);
      const next: TrainingStatsSnapshot = {
        ...EMPTY_SNAPSHOT,
        ...n,
        recentSessions: getDemoRecentSessions(),
        loading: false,
        error: null,
      };
      set(state => ({
        byUserId: {
          ...state.byUserId,
          [userId]: next,
        },
      }));
      void writePersistedUser(userId, toPersisted(next));
      return;
    }

    const {loadLocks, pendingReload} = get();
    if (loadLocks.has(userId)) {
      pendingReload.add(userId);
      set({pendingReload: new Set(pendingReload)});
      return;
    }

    const nextLocks = new Set(loadLocks);
    nextLocks.add(userId);
    set({
      loadLocks: nextLocks,
      byUserId: {
        ...get().byUserId,
        [userId]: {
          ...(get().byUserId[userId] ?? EMPTY_SNAPSHOT),
          loading: true,
          error: null,
        },
      },
    });

    try {
      const settled = await Promise.allSettled([
        fetchCompletedCheckInsForStats(userId),
        fetchUserBadges(userId),
        supabase
          .from('friendships')
          .select('user_a', {count: 'exact', head: true})
          .or(`user_a.eq.${userId},user_b.eq.${userId}`),
        supabase
          .from('gymly_group_members')
          .select('group_id', {count: 'exact', head: true})
          .eq('user_id', userId),
        supabase
          .from('check_ins')
          .select('started_at')
          .eq('user_id', userId)
          .eq('is_active', true)
          .is('ended_at', null)
          .maybeSingle(),
        fetchUserStatsFromProfile(userId),
      ]);

      const prev = get().byUserId[userId] ?? EMPTY_SNAPSHOT;

      const completedRows =
        settled[0].status === 'fulfilled' ? settled[0].value : null;
      const badges = settled[1].status === 'fulfilled' ? settled[1].value : null;
      const friendsRes = settled[2].status === 'fulfilled' ? settled[2].value : null;
      const groupsRes = settled[3].status === 'fulfilled' ? settled[3].value : null;
      const activeRes = settled[4].status === 'fulfilled' ? settled[4].value : null;
      const profileStats =
        settled[5].status === 'fulfilled' ? settled[5].value : null;

      const primaryFailed =
        settled[0].status === 'rejected' && settled[5].status === 'rejected';

      const derived =
        completedRows != null
          ? deriveFromSessions(completedRows.map(rowToSession))
          : {
              totalCheckIns: prev.totalCheckIns,
              totalTrainingMinutes: prev.totalTrainingMinutes,
              currentStreakDays: prev.currentStreakDays,
              longestStreakDays: prev.longestStreakDays,
              recentSessions: prev.recentSessions,
            };

      const activeSessionMinutes = activeRes?.data?.started_at
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(activeRes.data.started_at as string).getTime()) /
                60000,
            ),
          )
        : 0;

      const next: TrainingStatsSnapshot = {
        totalCheckIns: Math.max(
          derived.totalCheckIns,
          profileStats?.totalCheckIns ?? 0,
          prev.totalCheckIns,
        ),
        totalTrainingMinutes: Math.max(
          derived.totalTrainingMinutes,
          profileStats?.totalTrainingMinutes ?? 0,
          prev.totalTrainingMinutes,
        ),
        currentStreakDays: Math.max(
          derived.currentStreakDays,
          profileStats?.currentStreak ?? 0,
          prev.currentStreakDays,
        ),
        longestStreakDays: Math.max(
          derived.longestStreakDays,
          profileStats?.longestStreak ?? 0,
          prev.longestStreakDays,
        ),
        unlockedBadgesCount:
          badges != null
            ? badges.filter(b => Boolean(b.unlocked_at)).length
            : prev.unlockedBadgesCount,
        friendsCount:
          friendsRes && !friendsRes.error
            ? friendsRes.count ?? 0
            : prev.friendsCount,
        groupsCount:
          groupsRes && !groupsRes.error ? groupsRes.count ?? 0 : prev.groupsCount,
        recentSessions: derived.recentSessions,
        activeSessionMinutes,
        loading: false,
        error: primaryFailed
          ? settled[0].status === 'rejected'
            ? settled[0].reason instanceof Error
              ? settled[0].reason.message
              : String(settled[0].reason)
            : 'Kunne ikke hente træningsstatistik'
          : null,
      };

      set(state => ({
        byUserId: {
          ...state.byUserId,
          [userId]: next,
        },
      }));
      void writePersistedUser(userId, toPersisted(next));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set(state => ({
        byUserId: {
          ...state.byUserId,
          [userId]: {
            ...(state.byUserId[userId] ?? EMPTY_SNAPSHOT),
            loading: false,
            error: msg,
          },
        },
      }));
    } finally {
      const locks = new Set(get().loadLocks);
      locks.delete(userId);
      const pending = new Set(get().pendingReload);
      const shouldReload = pending.has(userId);
      pending.delete(userId);
      set({loadLocks: locks, pendingReload: pending});
      if (shouldReload) {
        void get().load(userId);
      }
    }
  },

  ensureSubscribed: userId => {
    const refs = (subscriptionRefCount.get(userId) ?? 0) + 1;
    subscriptionRefCount.set(userId, refs);

    if (!subscriptionCleanups.has(userId)) {
      const run = () => {
        void get().load(userId);
      };
      const unsubBridge = subscribeProfileStatsSelf(userId, run);
      const unsubStats = subscribeUserStats(userId, run);
      const checkInsChannel = supabase
        .channel(`training-stats-store-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'check_ins',
            filter: `user_id=eq.${userId}`,
          },
          run,
        )
        .subscribe();
      const appSub = AppState.addEventListener('change', next => {
        if (next === 'active') {
          run();
        }
      });

      subscriptionCleanups.set(userId, () => {
        unsubBridge();
        unsubStats();
        void supabase.removeChannel(checkInsChannel);
        appSub.remove();
        subscriptionCleanups.delete(userId);
      });
    }

    return () => {
      const next = (subscriptionRefCount.get(userId) ?? 1) - 1;
      if (next <= 0) {
        subscriptionRefCount.delete(userId);
        subscriptionCleanups.get(userId)?.();
      } else {
        subscriptionRefCount.set(userId, next);
      }
    };
  },
}));

export function requestUserTrainingStatsRefresh(userId: string): void {
  emitProfileStatsSelf(userId);
}

export function applyOptimisticCompletedTraining(
  userId: string,
  completed: CompletedTrainingSession,
): void {
  useTrainingStatsStore.getState().applyCompleted(userId, completed);
}
