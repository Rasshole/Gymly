import {
  endActiveCheckInInSupabase,
  getActiveCheckInForUser,
  type AutoCheckoutKind,
} from '@/services/supabase/checkInService';
import {deleteMyLiveWorkoutSession} from '@/services/supabase/liveWorkoutSessionService';
import {cleanupAllGymlyLiveActivities} from '@/services/ios/workoutLiveActivity';
import {notifyCheckInsPresenceSubscribers} from '@/realtime/checkInsPresenceSubscription';
import {useSessionStore} from '@/store/sessionStore';
import {useCheckInUIStore} from '@/store/checkInUIStore';
import {runStaleActiveSessionCleanup} from '@/services/supabase/activeSessionsSync';
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
}): Promise<void> {
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
  if (!resolvedCheckInId && !skipSupabaseEnd) {
    const active = await getActiveCheckInForUser(userId).catch(() => null);
    resolvedCheckInId = active?.id ?? null;
  }

  if (!skipSupabaseEnd && resolvedCheckInId) {
    await endActiveCheckInInSupabase(
      resolvedCheckInId,
      userId,
      endReason ?? mapReasonToEndReason(reason),
      autoCheckoutReason ? {autoCheckoutReason} : undefined,
    ).catch(() => {});
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
  await runStaleActiveSessionCleanup().catch(() => {});

  if (__DEV__) {
    console.log('[LiveActivity] session finished', {reason, checkInId: resolvedCheckInId});
  }
  if (alertBody && __DEV__) {
    console.log('[LiveActivity] finish alert body', alertBody);
  }
}

