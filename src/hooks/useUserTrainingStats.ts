import {useCallback, useEffect} from 'react';
import {
  useTrainingStatsStore,
  requestUserTrainingStatsRefresh,
  applyOptimisticCompletedTraining,
} from '@/store/trainingStatsStore';
import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import type {CompletedTrainingSession} from '@/services/training/completedTraining';

export {requestUserTrainingStatsRefresh, applyOptimisticCompletedTraining};

type TrainingStats = {
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
  refresh: () => Promise<void>;
};

export function useUserTrainingStats(userId: string | undefined): TrainingStats {
  const snapshot = useTrainingStatsStore(s =>
    userId ? s.byUserId[userId] : undefined,
  );
  const load = useTrainingStatsStore(s => s.load);
  const ensureSubscribed = useTrainingStatsStore(s => s.ensureSubscribed);

  const refresh = useCallback(async () => {
    if (!userId) {
      return;
    }
    await load(userId);
  }, [load, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void load(userId);
    return ensureSubscribed(userId);
  }, [userId, load, ensureSubscribed]);

  const data = snapshot ?? {
    totalCheckIns: 0,
    totalTrainingMinutes: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    unlockedBadgesCount: 0,
    friendsCount: 0,
    groupsCount: 0,
    recentSessions: [],
    activeSessionMinutes: 0,
    loading: !!userId,
    error: null,
  };

  return {
    ...data,
    refresh,
  };
}
