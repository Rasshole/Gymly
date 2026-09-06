/**
 * Cache last-time performance per exercise for the active workout session.
 * Fetches once per exercise key; does not refetch on set edits.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {LastExercisePerformance} from '@/types/workoutLog.types';
import {getLastExercisePerformance} from '@/services/supabase/workoutLogService';
import {normalizeExerciseName} from '@/utils/workoutLogHistory';

function cacheKey(
  userId: string,
  exerciseName: string,
  exerciseId: string | null | undefined,
): string {
  const id =
    exerciseId && !exerciseId.startsWith('ex-') && !exerciseId.startsWith('temp-')
      ? exerciseId
      : '';
  return `${userId}::${id}::${normalizeExerciseName(exerciseName)}`;
}

export function useLastExercisePerformanceCache(params: {
  userId: string | undefined;
  excludeSessionId: string | null;
  /** Exercises currently on screen — fetch last-time for each */
  items: Array<{exerciseName: string; exerciseId?: string | null}>;
}) {
  const {userId, excludeSessionId, items} = params;
  const [byKey, setByKey] = useState<
    Record<string, LastExercisePerformance | null>
  >({});
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});
  const inflight = useRef(new Set<string>());
  const cacheRef = useRef(byKey);
  cacheRef.current = byKey;

  const ensure = useCallback(
    async (exerciseName: string, exerciseId?: string | null) => {
      if (!userId || !exerciseName.trim()) {
        return null;
      }
      const key = cacheKey(userId, exerciseName, exerciseId);
      if (key in cacheRef.current) {
        return cacheRef.current[key];
      }
      if (inflight.current.has(key)) {
        return null;
      }
      inflight.current.add(key);
      setLoadingKeys(prev => ({...prev, [key]: true}));
      try {
        const perf = await getLastExercisePerformance(userId, exerciseName, {
          excludeSessionId,
          exerciseId,
        });
        setByKey(prev => ({...prev, [key]: perf}));
        return perf;
      } finally {
        inflight.current.delete(key);
        setLoadingKeys(prev => {
          const next = {...prev};
          delete next[key];
          return next;
        });
      }
    },
    [userId, excludeSessionId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    for (const item of items) {
      const key = cacheKey(userId, item.exerciseName, item.exerciseId);
      if (key in cacheRef.current || inflight.current.has(key)) {
        continue;
      }
      void ensure(item.exerciseName, item.exerciseId);
    }
  }, [userId, items, ensure]);

  const get = useCallback(
    (exerciseName: string, exerciseId?: string | null) => {
      if (!userId) {
        return undefined;
      }
      const key = cacheKey(userId, exerciseName, exerciseId);
      if (key in byKey) {
        return byKey[key];
      }
      return undefined;
    },
    [userId, byKey],
  );

  const isLoading = useCallback(
    (exerciseName: string, exerciseId?: string | null) => {
      if (!userId) {
        return false;
      }
      return Boolean(loadingKeys[cacheKey(userId, exerciseName, exerciseId)]);
    },
    [userId, loadingKeys],
  );

  return {get, ensure, isLoading};
}
