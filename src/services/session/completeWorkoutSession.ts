import {
  completeActiveTrainingSession,
  getActiveCheckInForUser,
} from '@/services/supabase/checkInService';
import {deleteMyLiveWorkoutSession} from '@/services/supabase/liveWorkoutSessionService';
import {cleanupAllGymlyLiveActivities} from '@/services/ios/workoutLiveActivity';
import {notifyCheckInsPresenceSubscribers} from '@/realtime/checkInsPresenceSubscription';
import {useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {useTrainingStatsStore} from '@/store/trainingStatsStore';
import {
  requestUserTrainingStatsRefresh,
  applyOptimisticCompletedTraining,
} from '@/store/trainingStatsStore';
import type {CompletedTrainingSession} from '@/services/training/completedTraining';
import type {CheckInEndReason, CheckoutReason} from '@/types/checkIn.types';
import {syncLocalWorkoutHistoryFromCompleted} from '@/services/session/syncLocalWorkoutHistory';

export type {CheckoutReason};

function mapCheckoutToEndReason(reason: CheckoutReason): CheckInEndReason {
  switch (reason) {
    case 'manual':
      return 'user';
    case 'auto_distance':
      return 'geofence_outside';
    case 'system_recovery':
      return 'inactivity';
    case 'logout':
      return 'user';
    default:
      return 'user';
  }
}

function liveActivityCleanupTag(
  reason: CheckoutReason,
): 'manual' | 'auto' | 'logout' | 'stale' {
  if (reason === 'manual') {
    return 'manual';
  }
  if (reason === 'auto_distance') {
    return 'auto';
  }
  if (reason === 'logout') {
    return 'logout';
  }
  return 'stale';
}

/**
 * Eneste indgang til at afslutte aktiv træning (manuel, auto-afstand, recovery, logout).
 */
export async function completeWorkoutSession(params: {
  sessionId?: string | null;
  reason: CheckoutReason;
  userId: string;
  skipSupabaseEnd?: boolean;
}): Promise<CompletedTrainingSession | null> {
  const {reason, userId, skipSupabaseEnd} = params;
  const storeCheckInId = useSessionStore.getState().activeSession?.checkInId ?? null;
  let resolvedCheckInId = params.sessionId ?? storeCheckInId;
  let completed: CompletedTrainingSession | null = null;

  if (!skipSupabaseEnd) {
    if (!resolvedCheckInId) {
      const active = await getActiveCheckInForUser(userId).catch(() => null);
      resolvedCheckInId = active?.id ?? null;
    }
    if (!resolvedCheckInId) {
      if (reason === 'manual') {
        throw new Error('Ingen aktiv træning at afslutte.');
      }
    } else {
      completed = await completeActiveTrainingSession(userId, {
        checkInId: resolvedCheckInId,
        endReason: mapCheckoutToEndReason(reason),
        checkoutReason: reason,
        workoutNeedsReview: reason === 'auto_distance',
      });
      if (completed) {
        applyOptimisticCompletedTraining(userId, completed);
        await useTrainingStatsStore.getState().load(userId);
        if (reason === 'auto_distance') {
          syncLocalWorkoutHistoryFromCompleted(userId, completed);
        }
      }
    }
  }

  await deleteMyLiveWorkoutSession(userId).catch(() => {});
  await cleanupAllGymlyLiveActivities(liveActivityCleanupTag(reason)).catch(() => {});

  useSessionStore.getState().endSession();
  useCheckInUIStore.getState().setShowAwayZoneWarning(false);
  notifyCheckInsPresenceSubscribers();
  requestUserTrainingStatsRefresh(userId);

  if (__DEV__) {
    console.log('[WorkoutSession] completed', {reason, checkInId: resolvedCheckInId});
  }

  return completed;
}
