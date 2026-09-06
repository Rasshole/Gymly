import {Alert} from 'react-native';
import {
  createWorkoutPost,
  refreshWorkoutFeedFromServer,
} from '@/services/supabase/workoutPostService';
import {formatWorkoutTypeDisplay} from '@/utils/muscleGroupLabels';
import {getRuntimeLanguage, rt} from '@/i18n';
import type {SharedWorkoutSnapshot} from '@/types/personalRecord.types';
import {pickSharedWorkoutHeadline} from '@/utils/personalRecordCopy';

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
  checkInId?: string | null;
  workoutSnapshot?: SharedWorkoutSnapshot | null;
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
    checkInId,
    workoutSnapshot,
    t,
  } = input;

  if (!shareToFeed) {
    return;
  }

  try {
    const lang = getRuntimeLanguage();
    const firstName = authorDisplayName.trim().split(/\s+/)[0] || authorDisplayName;
    const autoHeadline = pickSharedWorkoutHeadline({
      authorFirstName: firstName,
      prs: workoutSnapshot?.prs ?? [],
      lang,
    });
    const finalCaption = caption.trim() || autoHeadline;

    await createWorkoutPost({
      userId,
      authorDisplayName: authorDisplayName.trim() || rt('prCopy.someone'),
      mediaUri,
      caption: finalCaption,
      durationMinutes,
      centerName: gymName,
      workoutTypeLabel: formatWorkoutTypeDisplay(
        workoutType,
        getRuntimeLanguage(),
      ),
      moodRating: MOOD_TO_RATING[mood] ?? null,
      checkInId,
      workoutSnapshot,
    });
    await refreshWorkoutFeedFromServer();
  } catch {
    Alert.alert(t('checkIn.couldNotShare'), t('checkIn.shareFailedBody'));
  }
}
