import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import type {AutoCheckoutReviewPayload} from '@/store/checkInUIStore';
import {fetchWorkoutNeedingReview} from '@/services/session/workoutReviewService';

/**
 * Henter afsluttet auto-checkout der venter på gennemgang (DB: workout_needs_review).
 */
export function useWorkoutReviewPrompt(): {
  pendingReview: PendingAutoCheckoutSummary | null;
  refresh: () => void;
  dismissForThisLaunch: () => void;
  dismissedThisLaunch: boolean;
} {
  const userId = useAppStore(s => s.user?.id);
  const [pendingReview, setPendingReview] =
    useState<AutoCheckoutReviewPayload | null>(null);
  const dismissedIds = useRef<Set<string>>(new Set());
  const [dismissedThisLaunch, setDismissedThisLaunch] = useState(false);

  const refresh = useCallback(() => {
    if (!userId) {
      setPendingReview(null);
      return;
    }
    void fetchWorkoutNeedingReview(userId)
      .then(row => {
        if (!row || dismissedIds.current.has(row.checkInId)) {
          setPendingReview(null);
          return;
        }
        setPendingReview(row);
        setDismissedThisLaunch(false);
      })
      .catch(() => {
        setPendingReview(null);
      });
  }, [userId]);

  const dismissForThisLaunch = useCallback(() => {
    if (pendingReview) {
      dismissedIds.current.add(pendingReview.checkInId);
    }
    setPendingReview(null);
    setDismissedThisLaunch(true);
  }, [pendingReview]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [userId, refresh]);

  return {
    pendingReview,
    refresh,
    dismissForThisLaunch,
    dismissedThisLaunch,
  };
}
