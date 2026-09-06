jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

import {
  parseWeightInput,
  parseRepsInput,
  computeWorkoutVolumeKg,
  summarizeWorkoutLog,
} from '@/utils/workoutLogMath';
import {
  computeSetProgression,
  exerciseNamesMatch,
  prefillFromLastPerformance,
  formatProgressionBadge,
} from '@/utils/workoutLogHistory';
import type {
  LastExercisePerformance,
  WorkoutExercise,
} from '@/types/workoutLog.types';

describe('workoutLogService parsers', () => {
  it('parses decimal weight with comma and dot', () => {
    expect(parseWeightInput('82,5')).toBe(82.5);
    expect(parseWeightInput('82.5')).toBe(82.5);
    expect(parseWeightInput('0')).toBe(0);
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput('-1')).toBeNull();
  });

  it('parses reps from 1 up', () => {
    expect(parseRepsInput('8')).toBe(8);
    expect(parseRepsInput('1')).toBe(1);
    expect(parseRepsInput('0')).toBeNull();
    expect(parseRepsInput('')).toBeNull();
  });
});

describe('workout volume', () => {
  const sample: WorkoutExercise[] = [
    {
      id: 'e1',
      sessionId: 's1',
      userId: 'u1',
      exerciseId: null,
      exerciseName: 'Bench Press',
      muscleGroup: 'chest',
      trackingType: 'weight_reps',
      position: 0,
      createdAt: '',
      updatedAt: '',
      sets: [
        {
          id: 'a',
          workoutExerciseId: 'e1',
          sessionId: 's1',
          userId: 'u1',
          setNumber: 1,
          weightKg: 80,
          reps: 8,
          durationSeconds: null,
          distanceMeters: null,
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b',
          workoutExerciseId: 'e1',
          sessionId: 's1',
          userId: 'u1',
          setNumber: 2,
          weightKg: 82.5,
          reps: 6,
          durationSeconds: null,
          distanceMeters: null,
          completedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ],
    },
  ];

  it('computes volume as weight × reps', () => {
    // 80*8 + 82.5*6 = 640 + 495 = 1135
    expect(computeWorkoutVolumeKg(sample)).toBe(1135);
  });

  it('summarizes workout log', () => {
    const summary = summarizeWorkoutLog('s1', sample, 42);
    expect(summary.exerciseCount).toBe(1);
    expect(summary.setCount).toBe(2);
    expect(summary.totalVolumeKg).toBe(1135);
    expect(summary.durationMinutes).toBe(42);
  });
});

describe('workout log history helpers', () => {
  const last: LastExercisePerformance = {
    workoutExerciseId: 'we1',
    sessionId: 's-prev',
    exerciseId: null,
    exerciseName: 'Lat Pulldown',
    trackingType: 'weight_reps',
    performedAt: '2026-08-05T10:00:00.000Z',
    sets: [
      {
        setNumber: 1,
        weightKg: 45,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
      },
      {
        setNumber: 2,
        weightKg: 45,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
      },
      {
        setNumber: 3,
        weightKg: 45,
        reps: 8,
        durationSeconds: null,
        distanceMeters: null,
      },
    ],
  };

  it('matches exercise names case-insensitively', () => {
    expect(exerciseNamesMatch('Lat Pulldown', 'lat pulldown')).toBe(true);
    expect(exerciseNamesMatch('Lat Pulldown', 'Bench Press')).toBe(false);
  });

  it('prefills set N from last performance, else last known set', () => {
    expect(prefillFromLastPerformance(last, 1)).toEqual({
      weightKg: 45,
      reps: 8,
    });
    expect(prefillFromLastPerformance(last, 3)).toEqual({
      weightKg: 45,
      reps: 8,
    });
    expect(prefillFromLastPerformance(last, 5)).toEqual({
      weightKg: 45,
      reps: 8,
    });
    expect(prefillFromLastPerformance(null, 1)).toEqual({
      weightKg: null,
      reps: null,
    });
  });

  it('shows positive weight or reps progression only', () => {
    expect(
      computeSetProgression(
        {setNumber: 1, weightKg: 47.5, reps: 8},
        last.sets,
      ),
    ).toEqual({kind: 'weight', deltaKg: 2.5});
    expect(
      computeSetProgression({setNumber: 1, weightKg: 45, reps: 10}, last.sets),
    ).toEqual({kind: 'reps', deltaReps: 2});
    expect(
      computeSetProgression({setNumber: 1, weightKg: 40, reps: 8}, last.sets),
    ).toBeNull();
    expect(formatProgressionBadge({kind: 'weight', deltaKg: 2.5})).toBe(
      '↑ +2,5 kg',
    );
  });
});
