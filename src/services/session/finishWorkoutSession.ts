import {
  completeActiveTrainingSession,
  getActiveCheckInForUser,
  type AutoCheckoutKind,
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
import type {CheckInEndReason} from '@/types/checkIn.types';

type FinishReason = 'manual' | 'auto' | 'logout' | 'stale';

function mapReasonToEndReason(reason: FinishReason): CheckInEndReason {
  if (reason === 'manual') {
    return 'user';
  }
  if (reason === 'auto') {
    return 'inactivity';
  }
  if (reason === 'stale') {
    return 'inactivity';
  }
  return 'user';
}

export async function finishWorkoutSession(params: {
  reason: FinishReason;
  userId: string;
  checkInId?: string | null;
  alertBody?: string;
  skipSupabaseEnd?: boolean;
  endReason?: CheckInEndReason;
  autoCheckoutReason?: AutoCheckoutKind;
}): Promise<CompletedTrainingSession | null> {
  const {
    reason,
    userId,
    checkInId,
    alertBody,
    skipSupabaseEnd,
    endReason,
    autoCheckoutReason,
  } = params;
  const storeCheckInId = useSessionStore.getState().activeSession?.checkInId ?? null;
  let resolvedCheckInId = checkInId ?? storeCheckInId;
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
      endReason: endReason ?? mapReasonToEndReason(reason),
      autoCheckoutReason,
      });
      if (completed) {
        applyOptimisticCompletedTraining(userId, completed);
        await useTrainingStatsStore.getState().load(userId);
      }
    }
  }

  await deleteMyLiveWorkoutSession(userId).catch(() => {});
  await cleanupAllGymlyLiveActivities(
    reason === 'manual'
      ? 'manual'
      : reason === 'auto'
        ? 'auto'
        : reason === 'logout'
          ? 'logout'
          : 'stale',
  ).catch(() => {});

  useSessionStore.getState().endSession();
  useCheckInUIStore.getState().setShowAwayZoneWarning(false);
  notifyCheckInsPresenceSubscribers();
  requestUserTrainingStatsRefresh(userId);

  if (__DEV__) {
    console.log('[LiveActivity] session finished', {reason, checkInId: resolvedCheckInId});
  }
  if (alertBody && __DEV__) {
    console.log('[LiveActivity] finish alert body', alertBody);
  }

  return completed;
}
