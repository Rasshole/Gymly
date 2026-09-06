/**
 * Unit tests for Share Workout formatters / template availability.
 */

import {
  formatShareDuration,
  formatShareMuscleGroups,
  formatShareMuscleGroupsList,
  formatSharePrLift,
  formatShareVolumeKg,
  formatTruncatedMuscleList,
  rankSharePrs,
} from '@/utils/shareWorkoutFormat';
import {availableShareTemplates} from '@/utils/shareWorkoutTemplates';
import type {ShareWorkoutPayload} from '@/types/shareWorkout.types';
import type {WorkoutExercise} from '@/types/workoutLog.types';

function basePayload(
  overrides: Partial<ShareWorkoutPayload> = {},
): ShareWorkoutPayload {
  return {
    sessionId: 'session-1',
    gymName: 'SATS Nørrebro',
    startedAt: '2026-08-13T10:00:00.000Z',
    durationMinutes: 84,
    exerciseCount: 6,
    setCount: 21,
    totalVolumeKg: 8420,
    muscleGroupsLabel: 'Chest · Triceps',
    streakDays: 12,
    prs: [],
    ...overrides,
  };
}

function exercise(
  muscleGroup: string,
  withSet = true,
): WorkoutExercise {
  return {
    id: 'ex-1',
    sessionId: 'session-1',
    userId: 'user-1',
    exerciseId: null,
    exerciseName: 'Bench Press',
    muscleGroup,
    trackingType: 'weight_reps',
    position: 0,
    createdAt: '',
    updatedAt: '',
    sets: withSet
      ? [
          {
            id: 'set-1',
            workoutExerciseId: 'ex-1',
            sessionId: 'session-1',
            userId: 'user-1',
            setNumber: 1,
            weightKg: 100,
            reps: 5,
            durationSeconds: null,
            distanceMeters: null,
            completedAt: '',
            createdAt: '',
            updatedAt: '',
          },
        ]
      : [],
  };
}

describe('shareWorkoutFormat', () => {
  it('formats duration for stories', () => {
    expect(formatShareDuration(84)).toBe('1h 24m');
    expect(formatShareDuration(45)).toBe('45m');
    expect(formatShareDuration(120)).toBe('2h');
    expect(formatShareDuration(NaN)).toBeNull();
  });

  it('formats volume with locale separators (metric/kg default)', () => {
    expect(formatShareVolumeKg(8420, 'en')).toBe('8,420 kg');
    expect(formatShareVolumeKg(8420, 'da')).toMatch(/8\.420 kg|8,420 kg/);
    expect(formatShareVolumeKg(8420, 'en', 'volume')).toBe('8,420 kg volume');
  });

  it('formats imperial volume when lb unit is requested', () => {
    expect(formatShareVolumeKg(100, 'en', undefined, 'lb')).toBe('220 lb');
  });

  it('hides invalid or zero volume', () => {
    expect(formatShareVolumeKg(0, 'en')).toBeNull();
    expect(formatShareVolumeKg(-10, 'en')).toBeNull();
    expect(formatShareVolumeKg(NaN, 'en')).toBeNull();
  });

  it('formats PR lift line', () => {
    expect(formatSharePrLift(110, 4)).toBe('110 KG × 4');
  });

  it('joins muscle groups with middle dot from workout type', () => {
    expect(formatShareMuscleGroups('bryst,triceps', 'en')).toBe(
      'Chest · Triceps',
    );
  });

  it('deduplicates muscle groups from exercises', () => {
    const label = formatShareMuscleGroupsList(
      [exercise('chest'), exercise('chest'), exercise('triceps')],
      '',
      'en',
    );
    expect(label).toBe('Chest · Triceps');
  });

  it('truncates muscle groups to four plus overflow count', () => {
    expect(
      formatTruncatedMuscleList([
        'Chest',
        'Back',
        'Shoulders',
        'Biceps',
        'Triceps',
        'Legs',
      ]),
    ).toBe('Chest · Back · Shoulders · Biceps · +2');
  });

  it('returns empty muscle label when no data', () => {
    expect(formatShareMuscleGroupsList([], '', 'en')).toBe('Cardio');
    expect(formatShareMuscleGroupsList([], null, 'en')).toBe('Cardio');
  });

  it('ranks PRs by strength score', () => {
    const ranked = rankSharePrs([
      {
        exerciseName: 'Curl',
        weightKg: 20,
        reps: 10,
        recordType: 'weight_pr',
        strengthScore: 200,
      },
      {
        exerciseName: 'Bench Press',
        weightKg: 110,
        reps: 4,
        recordType: 'weight_pr',
        strengthScore: 440,
      },
    ]);
    expect(ranked[0].exerciseName).toBe('Bench Press');
  });
});

describe('availableShareTemplates', () => {
  it('always includes summary', () => {
    expect(availableShareTemplates(basePayload({streakDays: 0, prs: []}))).toEqual([
      'summary',
    ]);
  });

  it('includes PR when session has PRs', () => {
    const t = availableShareTemplates(
      basePayload({
        streakDays: 0,
        prs: [
          {
            exerciseName: 'Bench',
            weightKg: 100,
            reps: 5,
            recordType: 'weight_pr',
            strengthScore: 500,
          },
        ],
      }),
    );
    expect(t).toEqual(['summary', 'pr']);
  });

  it('includes streak when active', () => {
    expect(
      availableShareTemplates(basePayload({streakDays: 3, prs: []})),
    ).toEqual(['summary', 'streak']);
  });
});
