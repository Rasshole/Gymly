import {
  completeWorkoutSession,
  type CheckoutReason,
} from '@/services/session/completeWorkoutSession';
import type {CompletedTrainingSession} from '@/services/training/completedTraining';
import type {CheckInEndReason} from '@/types/checkIn.types';
import type {AutoCheckoutKind} from '@/services/supabase/checkInService';

type LegacyFinishReason = 'manual' | 'auto' | 'logout' | 'stale';

function mapLegacyReason(reason: LegacyFinishReason): CheckoutReason {
  if (reason === 'auto') {
    return 'auto_distance';
  }
  if (reason === 'stale') {
    return 'system_recovery';
  }
  if (reason === 'logout') {
    return 'logout';
  }
  return 'manual';
}

/** @deprecated Brug `completeWorkoutSession` */
export async function finishWorkoutSession(params: {
  reason: LegacyFinishReason;
  userId: string;
  checkInId?: string | null;
  alertBody?: string;
  skipSupabaseEnd?: boolean;
  endReason?: CheckInEndReason;
  autoCheckoutReason?: AutoCheckoutKind;
}): Promise<CompletedTrainingSession | null> {
  return completeWorkoutSession({
    sessionId: params.checkInId,
    reason: mapLegacyReason(params.reason),
    userId: params.userId,
    skipSupabaseEnd: params.skipSupabaseEnd,
  });
}

export type {CheckoutReason};
