/**
 * Auto-checkout: bekræftelse + Afslut træning-modal (samme som manuel).
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AppState, type AppStateStatus} from 'react-native';
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
import {
  buildSharedWorkoutSnapshot,
  evaluateSessionPersonalRecords,
  persistSessionPersonalRecords,
} from '@/services/supabase/personalRecordService';
import {fetchWorkoutLogForSession} from '@/services/supabase/workoutLogService';

function reviewTargetKey(
  target: AutoCheckoutReviewPayload | null | undefined,
): string | null {
  return target?.checkInId ?? null;
}

export function AutoCheckoutCompletionHost(): React.ReactElement {
  const {t} = useTranslation();
  const user = useAppStore(s => s.user);
  const immediate = useCheckInUIStore(s => s.immediateAutoCheckoutReview);
  const clearImmediate = useCheckInUIStore(s => s.clearImmediateAutoCheckoutReview);
  const {pendingReview, dismissForThisLaunch, refresh} = useWorkoutReviewPrompt();
  const alertShownFor = useRef<string | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<AutoCheckoutReviewPayload | null>(
    null,
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      setAppState(next);
      if (next === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (immediate) {
      setReviewTarget(immediate);
    } else if (pendingReview) {
      setReviewTarget(pendingReview);
    }
  }, [immediate, pendingReview]);

  const showAutoCheckoutAlert = useCallback(
    (target: AutoCheckoutReviewPayload) => {
      if (alertShownFor.current === target.checkInId) {
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
    },
    [t],
  );

  useEffect(() => {
    const target = immediate ?? pendingReview;
    if (!target || appState !== 'active') {
      return;
    }
    showAutoCheckoutAlert(target);
  }, [immediate, pendingReview, appState, showAutoCheckoutAlert]);

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

      let workoutSnapshot = null;
      try {
        const exercises = await fetchWorkoutLogForSession(reviewTarget.checkInId);
        const evaluated = await evaluateSessionPersonalRecords(
          user.id,
          reviewTarget.checkInId,
          exercises,
        );
        await persistSessionPersonalRecords(user.id, evaluated);
        if (exercises.some(e => e.sets.length > 0)) {
          workoutSnapshot = await buildSharedWorkoutSnapshot(
            reviewTarget.checkInId,
            reviewTarget.durationMinutes,
            evaluated.records,
            exercises,
          );
        }
      } catch {
        /* PR optional */
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
          checkInId: reviewTarget.checkInId,
          workoutSnapshot,
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
    alertShownFor.current = reviewTargetKey(reviewTarget);
  }, [clearImmediate, dismissForThisLaunch, reviewTarget]);

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
