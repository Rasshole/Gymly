import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {supabase} from '@/services/supabase/supabaseClient';
import {subscribeProfileStatsSelf} from '@/realtime/profileStatsSelfBridge';
import {fetchUserBadges} from '@/services/supabase/userBadgesService';
import {
  getUserStats as fetchUserStatsFromProfile,
  subscribeUserStats,
} from '@/services/supabase/userStatsService';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';

type TrainingStats = {
  totalCheckIns: number;
  totalTrainingMinutes: number;
  currentStreakDays: number;
  unlockedBadgesCount: number;
  friendsCount: number;
  groupsCount: number;
  recentSessions: ProfileCompletedSession[];
  activeSessionMinutes: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type CheckInRow = {
  id: string;
  gym_name: string;
  started_at: string | null;
  ended_at: string | null;
  workout_type: string | null;
  is_active: boolean;
};

const EMPTY: Omit<TrainingStats, 'loading' | 'error' | 'refresh'> = {
  totalCheckIns: 0,
  totalTrainingMinutes: 0,
  currentStreakDays: 0,
  unlockedBadgesCount: 0,
  friendsCount: 0,
  groupsCount: 0,
  recentSessions: [],
  activeSessionMinutes: 0,
};

function rowToCompletedSession(row: CheckInRow): ProfileCompletedSession | null {
  if (!row.started_at || !row.ended_at) {
    return null;
  }
  const startedAt = new Date(row.started_at);
  const endedAt = new Date(row.ended_at);
  const durationMinutes = Math.max(
    1,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
  );
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }
  return {
    id: row.id,
    gymName: row.gym_name?.trim() || 'Center',
    startedAt,
    endedAt,
    durationMinutes,
    workoutType: row.workout_type ?? null,
    partnerDisplayName: null,
  };
}

export function useUserTrainingStats(userId: string | undefined): TrainingStats {
  const [state, setState] = useState<TrainingStats>({
    ...EMPTY,
    loading: !!userId,
    error: null,
    refresh: async () => {},
  });
  const refreshLockRef = useRef(false);

  const load = useCallback(async () => {
    if (!userId) {
      setState(prev => ({...prev, ...EMPTY, loading: false, error: null}));
      return;
    }
    if (refreshLockRef.current) {
      return;
    }
    refreshLockRef.current = true;
    setState(prev => ({...prev, loading: true, error: null}));
    try {
      const [{data: checkIns, error: checkErr}, badges, friendsRes, groupsRes] =
        await Promise.all([
          supabase
            .from('check_ins')
            .select('id, gym_name, started_at, ended_at, workout_type, is_active')
            .eq('user_id', userId)
            .order('started_at', {ascending: false})
            .limit(5000),
          fetchUserBadges(userId),
          supabase
            .from('friendships')
            .select('user_a', {count: 'exact', head: true})
            .or(`user_a.eq.${userId},user_b.eq.${userId}`),
          supabase
            .from('gymly_group_members')
            .select('group_id', {count: 'exact', head: true})
            .eq('user_id', userId),
        ]);

      if (checkErr) {
        throw checkErr;
      }
      const rows = (checkIns ?? []) as CheckInRow[];
      const completedRows = rows.filter(
        r => r.is_active === false && r.started_at != null && r.ended_at != null,
      );
      const recentSessions = completedRows
        .map(rowToCompletedSession)
        .filter((x): x is ProfileCompletedSession => x != null);
      const activeSessionMinutes = rows
        .filter(r => r.is_active && r.started_at && !r.ended_at)
        .reduce((mx, r) => {
          const mins = Math.max(
            0,
            Math.floor((Date.now() - new Date(r.started_at as string).getTime()) / 60000),
          );
          return Math.max(mx, mins);
        }, 0);
      const unlockedBadgesCount = badges.filter(b => Boolean(b.unlocked_at)).length;
      const friendsCount = friendsRes.error ? 0 : friendsRes.count ?? 0;
      const groupsCount = groupsRes.error ? 0 : groupsRes.count ?? 0;
      const stats = await fetchUserStatsFromProfile(userId);
      const currentStreakDays = stats.currentStreak;

      setState(prev => ({
        ...prev,
        totalCheckIns: stats.totalCheckIns,
        totalTrainingMinutes: stats.totalTrainingMinutes,
        currentStreakDays,
        unlockedBadgesCount,
        friendsCount,
        groupsCount,
        recentSessions,
        activeSessionMinutes,
        loading: false,
        error: null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState(prev => ({...prev, loading: false, error: msg}));
    } finally {
      refreshLockRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    setState(prev => ({...prev, refresh: load}));
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const run = () => {
      void load();
    };
    const unsubBridge = subscribeProfileStatsSelf(userId, run);
    const unsubStats = subscribeUserStats(userId, run);
    const appSub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        void load();
      }
    });
    return () => {
      unsubBridge();
      unsubStats();
      appSub.remove();
    };
  }, [userId, load]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const t = setInterval(() => {
      if (state.activeSessionMinutes > 0) {
        void load();
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [userId, state.activeSessionMinutes, load]);

  return state;
}

