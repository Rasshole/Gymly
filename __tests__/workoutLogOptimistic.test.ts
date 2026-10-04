jest.mock('@/services/supabase/workoutLogService', () => ({
  addWorkoutExercise: jest.fn(),
  addWorkoutSet: jest.fn(),
  updateWorkoutSet: jest.fn(),
  deleteWorkoutSet: jest.fn(),
  deleteWorkoutExercise: jest.fn(),
  fetchWorkoutLogForSession: jest.fn(),
}));

jest.mock('@/store/badgeStore', () => ({
  checkAndUnlockBadges: jest.fn(),
}));

jest.mock('@/store/personalRecordSessionStore', () => ({
  usePersonalRecordSessionStore: {
    getState: () => ({
      evaluateCompletedSet: jest.fn(async () => null),
      recomputeExercise: jest.fn(async () => undefined),
    }),
  },
}));

import {
  addWorkoutExercise,
  addWorkoutSet,
  updateWorkoutSet,
  deleteWorkoutSet,
} from '@/services/supabase/workoutLogService';
import type {ExerciseLibraryItem, WorkoutExercise, WorkoutSet} from '@/types/workoutLog.types';
import {useWorkoutLogStore} from '@/store/workoutLogStore';

const exercise: ExerciseLibraryItem = {
  id: 'ex-squat',
  name: 'Squat',
  muscleGroup: 'quads',
  trackingType: 'weight_reps',
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function savedSet(partial: Partial<WorkoutSet> & Pick<WorkoutSet, 'id' | 'setNumber'>): WorkoutSet {
  return {
    workoutExerciseId: 'real-ex',
    sessionId: 'session-1',
    userId: 'user-1',
    weightKg: 100,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
    completedAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

function savedExercise(sets: WorkoutSet[] = []): WorkoutExercise {
  return {
    id: 'real-ex',
    sessionId: 'session-1',
    userId: 'user-1',
    exerciseId: 'ex-squat',
    exerciseName: 'Squat',
    muscleGroup: 'quads',
    trackingType: 'weight_reps',
    position: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    sets,
  };
}

describe('workout log optimistic saves', () => {
  beforeEach(() => {
    useWorkoutLogStore.getState().reset();
    jest.mocked(addWorkoutExercise).mockReset();
    jest.mocked(addWorkoutSet).mockReset();
    jest.mocked(updateWorkoutSet).mockReset();
    jest.mocked(deleteWorkoutSet).mockReset();
  });

  it('shows a new exercise before the database responds, then keeps one row', async () => {
    let releaseExercise: () => void = () => {};
    const exerciseGate = new Promise<void>(resolve => {
      releaseExercise = resolve;
    });
    jest.mocked(addWorkoutExercise).mockImplementation(async () => {
      await exerciseGate;
      return savedExercise();
    });
    jest.mocked(addWorkoutSet).mockImplementation(async () => savedSet({id: 'set-1', setNumber: 1}));

    const started = performance.now();
    const visible = await useWorkoutLogStore.getState().addExerciseWithFirstSet({
      sessionId: 'session-1',
      userId: 'user-1',
      exercise,
      weightKg: 100,
      reps: 8,
      clientKey: 'c1',
    });
    const uiMs = performance.now() - started;

    const rows = useWorkoutLogStore.getState().exercises;
    expect(visible.pending).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].sets[0].reps).toBe(8);
    expect(uiMs).toBeLessThan(30);
    // Debug/Jest timing for the optimistic commit. Not a release-build measurement.
    // eslint-disable-next-line no-console
    console.log(`optimistic-ui-ms ${uiMs.toFixed(2)}`);

    releaseExercise();
    await useWorkoutLogStore.getState().flush();

    const saved = useWorkoutLogStore.getState().exercises;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('real-ex');
    expect(saved[0].sets.map(s => s.setNumber)).toEqual([1]);
    expect(saved[0].sets[0].pending).toBe(false);
    expect(saved[0].sets[0].failed).toBe(false);
    expect(jest.mocked(addWorkoutExercise)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(addWorkoutSet)).toHaveBeenCalledTimes(1);
  });

  it('keeps set order when several sets are added before the database answers', async () => {
    useWorkoutLogStore.setState({
      sessionId: 'session-1',
      exercises: [savedExercise()],
    });
    jest.mocked(addWorkoutSet).mockImplementation(async params => {
      await delay(20);
      return savedSet({
        id: `set-${params.setNumber}`,
        setNumber: params.setNumber ?? 1,
        reps: params.reps,
        weightKg: params.weightKg,
      });
    });

    await useWorkoutLogStore.getState().addSetOptimistic({
      workoutExerciseId: 'real-ex',
      sessionId: 'session-1',
      userId: 'user-1',
      weightKg: 80,
      reps: 6,
      clientKey: 'a',
    });
    await useWorkoutLogStore.getState().addSetOptimistic({
      workoutExerciseId: 'real-ex',
      sessionId: 'session-1',
      userId: 'user-1',
      weightKg: 80,
      reps: 8,
      clientKey: 'b',
    });

    const optimistic = useWorkoutLogStore.getState().exercises[0].sets;
    expect(optimistic.map(s => s.setNumber)).toEqual([1, 2]);
    expect(optimistic.map(s => s.reps)).toEqual([6, 8]);

    await useWorkoutLogStore.getState().flush();

    const sets = useWorkoutLogStore.getState().exercises[0].sets;
    expect(sets.map(s => s.setNumber)).toEqual([1, 2]);
    expect(sets.every(s => !s.pending && !s.failed)).toBe(true);
    expect(jest.mocked(addWorkoutSet)).toHaveBeenCalledTimes(2);
  });

  it('does not count a failed save, and retry stores it once', async () => {
    useWorkoutLogStore.setState({
      sessionId: 'session-1',
      exercises: [savedExercise()],
    });
    jest.mocked(addWorkoutSet).mockRejectedValueOnce(new Error('offline'));
    await useWorkoutLogStore.getState().addSetOptimistic({
      workoutExerciseId: 'real-ex',
      sessionId: 'session-1',
      userId: 'user-1',
      weightKg: 50,
      reps: 5,
      clientKey: 'fail-1',
    });
    await useWorkoutLogStore.getState().flush();

    const failed = useWorkoutLogStore.getState().exercises[0].sets[0];
    expect(failed.failed).toBe(true);
    expect(failed.pending).toBe(false);
    expect(useWorkoutLogStore.getState().totals().setCount).toBe(0);
    expect(useWorkoutLogStore.getState().error).toBe('offline');

    jest.mocked(addWorkoutSet).mockResolvedValueOnce(
      savedSet({id: 'set-ok', setNumber: 1, weightKg: 50, reps: 5}),
    );
    useWorkoutLogStore.getState().retrySave('fail-1');
    await useWorkoutLogStore.getState().flush();

    const restored = useWorkoutLogStore.getState().exercises[0].sets;
    expect(restored).toHaveLength(1);
    expect(restored[0].failed).toBe(false);
    expect(restored[0].id).toBe('set-ok');
    expect(useWorkoutLogStore.getState().totals()).toEqual({
      exerciseCount: 1,
      setCount: 1,
      volumeKg: 250,
    });
  });

  it('legacy save blocked the UI for every database round trip', async () => {
    const rttMs = 40;
    const legacyRoundTrips = 6;
    const started = performance.now();
    for (let i = 0; i < legacyRoundTrips; i++) {
      await delay(rttMs);
    }
    const blockedMs = performance.now() - started;
    expect(blockedMs).toBeGreaterThan(rttMs * legacyRoundTrips - 30);
    // eslint-disable-next-line no-console
    console.log(`legacy-blocked-ms ${blockedMs.toFixed(2)}`);
  });

  it('keeps a failed edit visible and retries the same set once', async () => {
    const existing = savedSet({id: 'set-real', setNumber: 1, weightKg: 40, reps: 8});
    useWorkoutLogStore.setState({
      sessionId: 'session-1',
      exercises: [savedExercise([existing])],
    });
    jest.mocked(updateWorkoutSet).mockRejectedValueOnce(new Error('offline'));

    await useWorkoutLogStore.getState().editSetOptimistic({
      setId: 'set-real',
      weightKg: 60,
      reps: 5,
    });
    await useWorkoutLogStore.getState().flush();

    const failed = useWorkoutLogStore.getState().exercises[0].sets[0];
    expect(failed.weightKg).toBe(60);
    expect(failed.reps).toBe(5);
    expect(failed.failed).toBe(true);
    expect(failed.id).toBe('set-real');
    expect(useWorkoutLogStore.getState().totals().volumeKg).toBe(0);

    jest.mocked(updateWorkoutSet).mockResolvedValueOnce(
      savedSet({id: 'set-real', setNumber: 1, weightKg: 60, reps: 5}),
    );
    useWorkoutLogStore.getState().retrySave(failed.clientKey!);
    await useWorkoutLogStore.getState().flush();

    const restored = useWorkoutLogStore.getState().exercises[0].sets[0];
    expect(restored.failed).toBe(false);
    expect(restored.weightKg).toBe(60);
    expect(restored.reps).toBe(5);
    expect(jest.mocked(updateWorkoutSet)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(addWorkoutSet)).not.toHaveBeenCalled();
  });
});
