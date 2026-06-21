import {Alert} from 'react-native';
import {
  createWorkoutPost,
  refreshWorkoutFeedFromServer,
} from '@/services/supabase/workoutPostService';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {getRuntimeLanguage} from '@/i18n';

const MOOD_TO_RATING: Record<string, number> = {
  angry: 1,
  neutral: 2,
  ok: 3,
  good: 4,
  amazing: 5,
};

export type WorkoutSummaryShareInput = {
  userId: string;
  authorDisplayName: string;
  gymName: string;
  workoutType: string;
  durationMinutes: number;
  mediaUri?: string;
  caption: string;
  mood: string;
  shareToFeed: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export async function applyWorkoutSummaryShare(
  input: WorkoutSummaryShareInput,
): Promise<void> {
  const {
    userId,
    authorDisplayName,
    gymName,
    workoutType,
    durationMinutes,
    mediaUri,
    caption,
    mood,
    shareToFeed,
    t,
  } = input;

  if (!shareToFeed) {
    return;
  }

  try {
    await createWorkoutPost({
      userId,
      authorDisplayName: authorDisplayName.trim() || 'Bruger',
      mediaUri,
      caption: caption.trim(),
      durationMinutes,
      centerName: gymName,
      workoutTypeLabel: formatWorkoutTypeDisplay(
        workoutType,
        getRuntimeLanguage(),
      ),
      moodRating: MOOD_TO_RATING[mood] ?? null,
    });
    await refreshWorkoutFeedFromServer();
  } catch {
    Alert.alert(t('checkIn.couldNotShare'), t('checkIn.shareFailedBody'));
  }
}
