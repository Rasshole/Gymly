import {useCallback, useEffect} from 'react';
import {AppState} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {activeSessionFromSupabaseRow, useSessionStore} from '@/store/sessionStore';
import {getActiveCheckInForUser} from '@/services/supabase/checkInService';
import {
  deleteMyLiveWorkoutSession,
  upsertLiveWorkoutSession,
} from '@/services/supabase/liveWorkoutSessionService';
import {
  startWorkoutLiveActivity,
  cleanupAllGymlyLiveActivities,
} from '@/services/ios/workoutLiveActivity';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {fetchWorkoutNeedingReview} from '@/services/session/workoutReviewService';

/**
 * Genopret aktiv træning fra Supabase ved app-start / resume.
 * Afslutter lokal session hvis server allerede har tjekket ud (fx baggrund/auto).
 */
export function useRestoreActiveCheckInSession(): void {
  const userId = useAppStore(s => s.user?.id);
  const displayName = useAppStore(s => s.user?.displayName);

  const restore = useCallback(async () => {
    if (!userId) {
      return;
    }
    try {
      const row = await getActiveCheckInForUser(userId);
      if (!row?.started_at) {
        const local = useSessionStore.getState().activeSession;
        if (local?.checkInId) {
          useSessionStore.getState().endSession();
          useCheckInUIStore.getState().setShowAwayZoneWarning(false);
        }
        await deleteMyLiveWorkoutSession(userId).catch(() => {});
        await cleanupAllGymlyLiveActivities('auto').catch(() => {});

        const pending = await fetchWorkoutNeedingReview(userId).catch(() => null);
        if (pending) {
          useCheckInUIStore.getState().notifyImmediateAutoCheckoutReview(pending);
        }
        return;
      }
      const session = activeSessionFromSupabaseRow(row);
      const cur = useSessionStore.getState().activeSession;
      if (cur?.checkInId === session.checkInId) {
        return;
      }
      useSessionStore.getState().startSession(session);
      void startWorkoutLiveActivity(
        formatWorkoutTypeDisplay(session.workoutType || ''),
        session.gymName,
        session.startTime,
      );
      try {
        await upsertLiveWorkoutSession({
          userId,
          gymId: session.gymId,
          gymName: session.gymName,
          city: session.city ?? null,
          workoutType: session.workoutType,
          displayName: displayName?.trim() || 'Bruger',
        });
      } catch {
        /* offline / RLS */
      }
    } catch {
      /* offline — behold evt. lokal state */
    }
  }, [userId, displayName]);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void restore();
      }
    });
    return () => sub.remove();
  }, [restore]);
}
