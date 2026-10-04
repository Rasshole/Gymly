/**
 * Build Share Workout payload from a completed session ID (check_ins.id).
 * Does not use active session or nearest-gym fallbacks.
 */

import {fetchCompletedWorkoutDetail} from '@/services/supabase/workoutHistoryService';
import {fetchSessionPersonalRecordsForShare} from '@/services/supabase/personalRecordService';
import type {ShareWorkoutPayload, ShareWorkoutPrItem} from '@/types/shareWorkout.types';
import type {AppLanguage} from '@/i18n/types';
import {formatShareMuscleGroupsList, rankSharePrs} from '@/utils/shareWorkoutFormat';
import {useTrainingStatsStore} from '@/store/trainingStatsStore';

export {availableShareTemplates} from '@/utils/shareWorkoutTemplates';

export async function buildShareWorkoutPayload(params: {
  sessionId: string;
  userId: string;
  language: AppLanguage;
  /** Optional streak override (tests); default = current active streak */
  streakDays?: number;
}): Promise<ShareWorkoutPayload> {
  const {sessionId, userId, language} = params;
  if (!sessionId?.trim() || !userId?.trim()) {
    throw new Error('Missing session or user for share workout.');
  }

  const [detail, prRows] = await Promise.all([
    fetchCompletedWorkoutDetail(sessionId, userId),
    fetchSessionPersonalRecordsForShare(userId, sessionId),
  ]);

  if (!detail?.session || detail.session.id !== sessionId) {
    throw new Error('Share workout could not load the completed session.');
  }

  const streakDays =
    params.streakDays ??
    Math.max(0, useTrainingStatsStore.getState().getSnapshot(userId).currentStreakDays);

  const prs: ShareWorkoutPrItem[] = rankSharePrs(
    prRows.map(pr => ({
      exerciseName: pr.exerciseName,
      weightKg: pr.weightKg,
      reps: pr.reps,
      recordType: pr.recordType,
      strengthScore: pr.weightKg * Math.max(1, pr.reps),
    })),
  );

  return {
    sessionId: detail.session.id,
    gymName: detail.session.gymName,
    startedAt:
      detail.session.startedAt instanceof Date
        ? detail.session.startedAt.toISOString()
        : String(detail.session.startedAt),
    durationMinutes: detail.session.durationMinutes,
    exerciseCount: detail.summary.exerciseCount,
    setCount: detail.summary.setCount,
    totalVolumeKg: detail.summary.totalVolumeKg,
    muscleGroupsLabel: formatShareMuscleGroupsList(
      detail.exercises,
      detail.session.workoutType,
      language,
    ),
    streakDays,
    prs,
    exercises: detail.exercises,
  };
}
