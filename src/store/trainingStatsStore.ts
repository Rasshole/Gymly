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

type TrainingStatsStoreState = {
  byUserId: Record<string, TrainingStatsSnapshot>;
  loadLocks: Set<string>;
  pendingReload: Set<string>;
  getSnapshot: (userId: string | undefined) => TrainingStatsSnapshot;
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

  getSnapshot: userId => {
    if (!userId) {
      return EMPTY_SNAPSHOT;
    }
    return get().byUserId[userId] ?? {...EMPTY_SNAPSHOT, loading: true};
  },

  applyCompleted: (userId, completed) => {
    const session = toProfileCompletedSession(completed);
    set(state => {
      const prev = state.byUserId[userId] ?? {...EMPTY_SNAPSHOT, loading: false};
      const withoutDup = prev.recentSessions.filter(s => s.id !== session.id);
      const sessions = [session, ...withoutDup];
      const derived = deriveFromSessions(sessions);
      return {
        byUserId: {
          ...state.byUserId,
          [userId]: {
            ...prev,
            ...derived,
            loading: false,
            error: null,
          },
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
      set(state => ({
        byUserId: {
          ...state.byUserId,
          [userId]: {
            ...EMPTY_SNAPSHOT,
            ...n,
            recentSessions: getDemoRecentSessions(),
            loading: false,
            error: null,
          },
        },
      }));
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
      const [completedRows, badges, friendsRes, groupsRes, activeRes, profileStats] =
        await Promise.all([
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

      const serverSessions = completedRows.map(rowToSession);
      const derived = deriveFromSessions(serverSessions);
      const activeSessionMinutes = activeRes.data?.started_at
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(activeRes.data.started_at as string).getTime()) / 60000,
            ),
          )
        : 0;

      set(state => ({
        byUserId: {
          ...state.byUserId,
          [userId]: {
            totalCheckIns: Math.max(derived.totalCheckIns, profileStats.totalCheckIns),
            totalTrainingMinutes: Math.max(
              derived.totalTrainingMinutes,
              profileStats.totalTrainingMinutes,
            ),
            currentStreakDays: Math.max(
              derived.currentStreakDays,
              profileStats.currentStreak,
            ),
            longestStreakDays: Math.max(
              derived.longestStreakDays,
              profileStats.longestStreak,
            ),
            unlockedBadgesCount: badges.filter(b => Boolean(b.unlocked_at)).length,
            friendsCount: friendsRes.error ? 0 : friendsRes.count ?? 0,
            groupsCount: groupsRes.error ? 0 : groupsRes.count ?? 0,
            recentSessions: derived.recentSessions,
            activeSessionMinutes,
            loading: false,
            error: null,
          },
        },
      }));
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
