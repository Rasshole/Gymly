import {supabase} from '@/services/supabase/supabaseClient';
import type {AutoCheckoutReviewPayload} from '@/store/checkInUIStore';

const REVIEW_SELECT =
  'id, gym_id, gym_name, workout_type, started_at, ended_at, duration_minutes, workout_needs_review';

function isOptionalReviewColumnError(message: string | undefined): boolean {
  return !!message && /workout_needs_review|column|schema cache/i.test(message);
}

/**
 * Seneste afsluttede auto-checkout der mangler bruger-gennemgang (caption/deling).
 */
export async function fetchWorkoutNeedingReview(
  userId: string,
): Promise<AutoCheckoutReviewPayload | null> {
  const {data, error} = await supabase
    .from('check_ins')
    .select(REVIEW_SELECT)
    .eq('user_id', userId)
    .eq('workout_needs_review', true)
    .not('ended_at', 'is', null)
    .order('ended_at', {ascending: false})
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isOptionalReviewColumnError(error.message)) {
      return null;
    }
    throw new Error(error.message ?? 'Kunne ikke hente træning til gennemgang.');
  }

  if (!data?.id || !data.ended_at || !data.started_at) {
    return null;
  }

  const startedAt = String(data.started_at);
  const endedAt = String(data.ended_at);
  const durationMinutes =
    data.duration_minutes != null && data.duration_minutes > 0
      ? Number(data.duration_minutes)
      : Math.max(
          1,
          Math.floor(
            (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
              (60 * 1000),
          ),
        );

  return {
    checkInId: String(data.id),
    userId,
    gymId: String(data.gym_id ?? ''),
    gymName: String(data.gym_name ?? 'Center'),
    workoutType: String(data.workout_type ?? ''),
    durationMinutes,
    startedAt,
  };
}

export async function clearWorkoutNeedsReview(
  checkInId: string,
  userId: string,
): Promise<void> {
  const {error} = await supabase
    .from('check_ins')
    .update({workout_needs_review: false})
    .eq('id', checkInId)
    .eq('user_id', userId);

  if (error && !isOptionalReviewColumnError(error.message)) {
    throw new Error(error.message ?? 'Kunne ikke markere træning som gennemgået.');
  }
}
