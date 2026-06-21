import type {CompletedTrainingSession} from '@/services/training/completedTraining';
import {useWorkoutStore} from '@/store/workoutStore';

/** Lokal træningshistorik (Supabase er sandhed; dette holder UI i sync). */
export function syncLocalWorkoutHistoryFromCompleted(
  userId: string,
  completed: CompletedTrainingSession,
): void {
  useWorkoutStore.getState().addWorkout({
    userId,
    gymId: completed.gymId,
    gymName: completed.gymName,
    startTime: completed.startedAt,
    duration: completed.durationMinutes,
    workoutType: completed.workoutType ?? '',
  });
}
