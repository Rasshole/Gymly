/**
 * Auto-checkout: bekræftelse + Afslut træning-modal (samme som manuel).
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
import WorkoutSummaryModal from '@/components/checkin/WorkoutSummaryModal';
import {useAppStore} from '@/store/appStore';
import {useTranslation} from '@/i18n';
import {applyWorkoutSummaryShare} from '@/services/session/applyWorkoutSummaryShare';
import {clearWorkoutNeedsReview} from '@/services/session/workoutReviewService';
import {useWorkoutReviewPrompt} from '@/hooks/useWorkoutReviewPrompt';
import {
  useCheckInUIStore,
  type AutoCheckoutReviewPayload,
} from '@/store/checkInUIStore';

export function AutoCheckoutCompletionHost(): React.ReactElement {
  const {t} = useTranslation();
  const user = useAppStore(s => s.user);
  const immediate = useCheckInUIStore(s => s.immediateAutoCheckoutReview);
  const clearImmediate = useCheckInUIStore(s => s.clearImmediateAutoCheckoutReview);
  const {pendingReview, dismissForThisLaunch, refresh} = useWorkoutReviewPrompt();
  const alertShownFor = useRef<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<AutoCheckoutReviewPayload | null>(
    null,
  );

  useEffect(() => {
    if (immediate) {
      setReviewTarget(immediate);
    } else if (pendingReview) {
      setReviewTarget(pendingReview);
    }
  }, [immediate, pendingReview]);

  useEffect(() => {
    const target = immediate ?? pendingReview;
    if (!target || alertShownFor.current === target.checkInId) {
      return;
    }
    alertShownFor.current = target.checkInId;
    Alert.alert(
      t('checkIn.autoCheckoutTitle'),
      '',
      [
        {
          text: t('common.ok'),
          onPress: () => setSummaryVisible(true),
        },
      ],
      {cancelable: false},
    );
  }, [immediate, pendingReview, t]);

  const finishReview = useCallback(
    async (data: {
      mediaUri?: string;
      caption: string;
      mood: string;
      shareToFeed: boolean;
    }) => {
      if (!reviewTarget || !user?.id) {
        return;
      }
      setSummaryVisible(false);

      try {
        await clearWorkoutNeedsReview(reviewTarget.checkInId, user.id);
      } catch {
        /* already saved */
      }

      if (data.shareToFeed) {
        await applyWorkoutSummaryShare({
          userId: user.id,
          authorDisplayName: user.displayName ?? '',
          gymName: reviewTarget.gymName,
          workoutType: reviewTarget.workoutType,
          durationMinutes: reviewTarget.durationMinutes,
          mediaUri: data.mediaUri,
          caption: data.caption,
          mood: data.mood,
          shareToFeed: true,
          t,
        });
      }

      clearImmediate();
      dismissForThisLaunch();
      setReviewTarget(null);
      alertShownFor.current = null;
      refresh();
    },
    [reviewTarget, user, clearImmediate, dismissForThisLaunch, refresh, t],
  );

  const handleClose = useCallback(() => {
    setSummaryVisible(false);
    clearImmediate();
    dismissForThisLaunch();
  }, [clearImmediate, dismissForThisLaunch]);

  const modalTarget = reviewTarget ?? immediate ?? pendingReview;

  return (
    <WorkoutSummaryModal
      visible={summaryVisible && modalTarget != null}
      summary={{
        gymName: modalTarget?.gymName ?? '',
        durationMinutes: modalTarget?.durationMinutes ?? 1,
        workoutType: modalTarget?.workoutType ?? '',
      }}
      onClose={handleClose}
      onComplete={finishReview}
    />
  );
}
