import type {ProfileCompletedSession} from '@/services/supabase/profileCheckInHistory';
import {sessionDurationMinutes} from '@/utils/trainingStatsFromCheckIns';

export type CompletedTrainingSession = {
  checkInId: string;
  gymId: string;
  gymName: string;
  workoutType: string | null;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
};

export function toProfileCompletedSession(
  row: CompletedTrainingSession,
): ProfileCompletedSession {
  return {
    id: row.checkInId,
    gymName: row.gymName?.trim() || 'Center',
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMinutes: row.durationMinutes,
    workoutType: row.workoutType,
    partnerDisplayName: null,
  };
}

export function completedTrainingFromCheckInRow(row: {
  id: string;
  gym_id?: string;
  gym_name: string;
  workout_type?: string | null;
  started_at: string;
  ended_at: string;
  duration_minutes?: number | null;
}): CompletedTrainingSession {
  const startedAt = new Date(row.started_at);
  const endedAt = new Date(row.ended_at);
  const durationMinutes =
    row.duration_minutes != null && row.duration_minutes > 0
      ? row.duration_minutes
      : sessionDurationMinutes(startedAt, endedAt);
  return {
    checkInId: row.id,
    gymId: String(row.gym_id ?? ''),
    gymName: row.gym_name,
    workoutType: row.workout_type ?? null,
    startedAt,
    endedAt,
    durationMinutes,
  };
}
