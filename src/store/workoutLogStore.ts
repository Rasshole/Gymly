/**
 * Live workout log store — optimistic UI for aktiv session.
 */

import {create} from 'zustand';
import type {
  ExerciseLibraryItem,
  WorkoutExercise,
  WorkoutMuscleGroup,
  WorkoutSet,
} from '@/types/workoutLog.types';
import {
  addWorkoutExercise,
  addWorkoutSet,
  deleteWorkoutExercise,
  deleteWorkoutSet,
  fetchWorkoutLogForSession,
  updateWorkoutSet,
} from '@/services/supabase/workoutLogService';
import {computeWorkoutVolumeKg} from '@/utils/workoutLogMath';
import {checkAndUnlockBadges} from '@/store/badgeStore';
import {usePersonalRecordSessionStore} from '@/store/personalRecordSessionStore';

type WorkoutLogState = {
  sessionId: string | null;
  exercises: WorkoutExercise[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: (sessionId: string) => Promise<void>;
  reset: () => void;
  addExerciseWithFirstSet: (params: {
    sessionId: string;
    userId: string;
    exercise: ExerciseLibraryItem;
    weightKg: number | null;
    reps: number | null;
    clientKey: string;
  }) => Promise<WorkoutSet>;
  addSetOptimistic: (params: {
    workoutExerciseId: string;
    sessionId: string;
    userId: string;
    weightKg: number | null;
    reps: number | null;
    clientKey: string;
  }) => Promise<WorkoutSet>;
  editSetOptimistic: (params: {
    setId: string;
    weightKg: number | null;
    reps: number | null;
  }) => Promise<void>;
  deleteSetOptimistic: (setId: string) => Promise<void>;
  retrySave: (clientKey: string) => void;
  /** Wait until background writes have finished. Used before the workout summary. */
  flush: () => Promise<void>;
  totals: () => {exerciseCount: number; setCount: number; volumeKg: number};
};

const cancelledKeys = new Set<string>();
const inflightKeys = new Set<string>();
const dirtyKeys = new Set<string>();
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): void {
  writeQueue = writeQueue.then(task, task);
}

function savedExercises(exercises: WorkoutExercise[]): WorkoutExercise[] {
  return exercises
    .map(e => ({...e, sets: e.sets.filter(s => !s.failed)}))
    .filter(e => e.sets.length > 0);
}

function findByClientKey(
  exercises: WorkoutExercise[],
  clientKey: string,
): {exercise: WorkoutExercise; set: WorkoutSet} | null {
  for (const exercise of exercises) {
    const set = exercise.sets.find(s => s.clientKey === clientKey);
    if (set) {
      return {exercise, set};
    }
  }
  return null;
}

function libraryItemFromExercise(exercise: WorkoutExercise): ExerciseLibraryItem {
  return {
    id: exercise.exerciseId ?? `ex-${exercise.id}`,
    name: exercise.exerciseName,
    muscleGroup: (exercise.muscleGroup ?? 'full_body') as WorkoutMuscleGroup,
    trackingType: exercise.trackingType,
  };
}

function mergeUnsaved(
  remote: WorkoutExercise[],
  unsaved: Array<{exercise: WorkoutExercise; set: WorkoutSet}>,
): WorkoutExercise[] {
  if (unsaved.length === 0) {
    return remote;
  }
  const exercises = remote.map(e => ({...e, sets: [...e.sets]}));
  for (const {exercise, set} of unsaved) {
    const host =
      exercises.find(e => e.id === set.workoutExerciseId) ??
      exercises.find(e => e.id === exercise.id) ??
      exercises.find(
        e =>
          e.exerciseName === exercise.exerciseName &&
          e.position === exercise.position,
      );
    if (!host) {
      exercises.push({
        ...exercise,
        sets: [set],
      });
      continue;
    }
    if (!host.sets.some(s => s.clientKey === set.clientKey || s.id === set.id)) {
      host.sets.push({...set, workoutExerciseId: host.id});
    }
  }
  return exercises;
}

export const useWorkoutLogStore = create<WorkoutLogState>((set, get) => ({
  sessionId: null,
  exercises: [],
  loading: false,
  saving: false,
  error: null,

  reset: () =>
    set({
      sessionId: null,
      exercises: [],
      loading: false,
      saving: false,
      error: null,
    }),

  load: async sessionId => {
    const unsaved = get().exercises.flatMap(exercise =>
      exercise.sets
        .filter(s => s.pending || s.failed)
        .map(s => ({exercise, set: s})),
    );
    set({loading: true, error: null, sessionId});
    try {
      const remote = await fetchWorkoutLogForSession(sessionId);
      const exercises = mergeUnsaved(remote, unsaved);
      set({exercises, loading: false});
    } catch (e: any) {
      set({
        loading: false,
        error: e?.message ?? 'Kunne ikke hente træningslog',
      });
    }
  },

  totals: () => {
    const exercises = savedExercises(get().exercises);
    return {
      exerciseCount: exercises.length,
      setCount: exercises.reduce((n, e) => n + e.sets.length, 0),
      volumeKg: computeWorkoutVolumeKg(exercises),
    };
  },

  addExerciseWithFirstSet: params => {
    const {sessionId, userId, exercise, weightKg, reps, clientKey} = params;
    const existing = get().exercises.flatMap(e => e.sets).find(s => s.clientKey === clientKey);
    if (existing) {
      return Promise.resolve(existing);
    }

    const tempExId = `temp-ex-${clientKey}`;
    const tempSetId = `temp-set-${clientKey}`;
    const now = new Date().toISOString();
    const optimisticSet: WorkoutSet = {
      id: tempSetId,
      workoutExerciseId: tempExId,
      sessionId,
      userId,
      setNumber: 1,
      weightKg,
      reps,
      durationSeconds: null,
      distanceMeters: null,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      pending: true,
      failed: false,
      clientKey,
    };
    const optimisticEx: WorkoutExercise = {
      id: tempExId,
      sessionId,
      userId,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      trackingType: exercise.trackingType,
      position: get().exercises.length,
      createdAt: now,
      updatedAt: now,
      sets: [optimisticSet],
    };
    set(s => ({
      error: null,
      exercises: [...s.exercises.filter(e => e.id !== tempExId), optimisticEx],
    }));
    schedulePersist(clientKey);
    return Promise.resolve(optimisticSet);
  },

  addSetOptimistic: params => {
    const {workoutExerciseId, sessionId, userId, weightKg, reps, clientKey} = params;
    const dup = get().exercises.flatMap(e => e.sets).find(s => s.clientKey === clientKey);
    if (dup) {
      return Promise.resolve(dup);
    }
    const ex = get().exercises.find(e => e.id === workoutExerciseId);
    if (!ex) {
      set({error: 'Øvelse ikke fundet'});
      return Promise.reject(new Error('Øvelse ikke fundet'));
    }
    const nextNum = (ex.sets[ex.sets.length - 1]?.setNumber ?? 0) + 1;
    const now = new Date().toISOString();
    const optimistic: WorkoutSet = {
      id: `temp-set-${clientKey}`,
      workoutExerciseId,
      sessionId,
      userId,
      setNumber: nextNum,
      weightKg,
      reps,
      durationSeconds: null,
      distanceMeters: null,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      pending: true,
      failed: false,
      clientKey,
    };
    set(s => ({
      error: null,
      exercises: s.exercises.map(e =>
        e.id === workoutExerciseId
          ? {...e, sets: [...e.sets, optimistic], updatedAt: now}
          : e,
      ),
    }));
    schedulePersist(clientKey);
    return Promise.resolve(optimistic);
  },

  editSetOptimistic: ({setId, weightKg, reps}) => {
    const current = get().exercises.flatMap(e => e.sets).find(s => s.id === setId);
    if (!current) {
      return Promise.resolve();
    }
    const clientKey = current.clientKey ?? `edit-${setId}`;
    set(s => ({
      error: null,
      exercises: s.exercises.map(e => ({
        ...e,
        sets: e.sets.map(st =>
          st.id === setId
            ? {...st, weightKg, reps, pending: true, failed: false, clientKey}
            : st,
        ),
      })),
    }));
    schedulePersist(clientKey);
    return Promise.resolve();
  },

  deleteSetOptimistic: setId => {
    const exercises = get().exercises;
    let target: WorkoutSet | null = null;
    let host: WorkoutExercise | null = null;
    for (const exercise of exercises) {
      const found = exercise.sets.find(s => s.id === setId);
      if (found) {
        target = found;
        host = exercise;
        break;
      }
    }
    if (!target || !host) {
      return Promise.resolve();
    }
    if (target.clientKey && (target.pending || target.failed || target.id.startsWith('temp-'))) {
      cancelledKeys.add(target.clientKey);
    }
    const previous = exercises;
    const exerciseId = host.id;
    const serverSetId = target.id.startsWith('temp-') ? null : target.id;
    set(s => ({
      error: null,
      exercises: s.exercises
        .map(e => ({...e, sets: e.sets.filter(st => st.id !== setId)}))
        .filter(e => e.sets.length > 0),
    }));
    if (!serverSetId) {
      return Promise.resolve();
    }
    enqueueWrite(async () => {
      try {
        await deleteWorkoutSet(serverSetId);
        const stillThere = useWorkoutLogStore
          .getState()
          .exercises.find(e => e.id === exerciseId);
        if (!stillThere && !exerciseId.startsWith('temp-')) {
          await deleteWorkoutExercise(exerciseId);
        }
      } catch (e: any) {
        useWorkoutLogStore.setState({
          error: e?.message ?? 'Kunne ikke slette sættet',
          exercises: previous,
        });
      }
    });
    return Promise.resolve();
  },

  retrySave: clientKey => {
    const found = findByClientKey(get().exercises, clientKey);
    if (!found) {
      return;
    }
    cancelledKeys.delete(clientKey);
    set(s => ({
      error: null,
      exercises: s.exercises.map(e => ({
        ...e,
        sets: e.sets.map(st =>
          st.clientKey === clientKey ? {...st, pending: true, failed: false} : st,
        ),
      })),
    }));
    schedulePersist(clientKey);
  },

  flush: () => writeQueue,
}));

function schedulePersist(clientKey: string): void {
  if (inflightKeys.has(clientKey)) {
    dirtyKeys.add(clientKey);
    return;
  }
  inflightKeys.add(clientKey);
  enqueueWrite(async () => {
    try {
      await persistClientKey(clientKey);
    } finally {
      inflightKeys.delete(clientKey);
      if (!dirtyKeys.has(clientKey)) {
        return;
      }
      dirtyKeys.delete(clientKey);
      const still = findByClientKey(useWorkoutLogStore.getState().exercises, clientKey);
      if (still && !still.set.failed && !cancelledKeys.has(clientKey)) {
        schedulePersist(clientKey);
      }
    }
  });
}

function markSetFailed(clientKey: string, message: string): void {
  useWorkoutLogStore.setState(s => ({
    error: message,
    exercises: s.exercises.map(e => ({
      ...e,
      sets: e.sets.map(st =>
        st.clientKey === clientKey ? {...st, pending: false, failed: true} : st,
      ),
    })),
  }));
}

async function persistClientKey(clientKey: string): Promise<void> {
  if (cancelledKeys.has(clientKey)) {
    cancelledKeys.delete(clientKey);
    return;
  }
  const initial = findByClientKey(useWorkoutLogStore.getState().exercises, clientKey);
  if (!initial || initial.set.failed) {
    return;
  }

  try {
    let exerciseId = initial.exercise.id;
    if (exerciseId.startsWith('temp-')) {
      const createdEx = await addWorkoutExercise({
        sessionId: initial.exercise.sessionId,
        userId: initial.exercise.userId,
        exercise: libraryItemFromExercise(initial.exercise),
        position: initial.exercise.position,
      });
      if (cancelledKeys.has(clientKey)) {
        await deleteWorkoutExercise(createdEx.id);
        cancelledKeys.delete(clientKey);
        return;
      }
      exerciseId = createdEx.id;
      useWorkoutLogStore.setState(s => ({
        exercises: s.exercises.map(e =>
          e.id === initial.exercise.id
            ? {
                ...createdEx,
                sets: e.sets.map(st => ({...st, workoutExerciseId: createdEx.id})),
              }
            : e,
        ),
      }));
    }

    const latest = findByClientKey(useWorkoutLogStore.getState().exercises, clientKey);
    if (!latest || cancelledKeys.has(clientKey)) {
      if (cancelledKeys.has(clientKey)) {
        cancelledKeys.delete(clientKey);
      }
      return;
    }
    if (!latest.set.id.startsWith('temp-')) {
      const updated = await updateWorkoutSet({
        setId: latest.set.id,
        weightKg: latest.set.weightKg,
        reps: latest.set.reps,
      });
      useWorkoutLogStore.setState(s => ({
        error: s.exercises.some(e => e.sets.some(st => st.failed && st.clientKey !== clientKey))
          ? s.error
          : null,
        exercises: s.exercises.map(e => ({
          ...e,
          sets: e.sets.map(st =>
            st.clientKey === clientKey
              ? {...updated, pending: false, failed: false, clientKey}
              : st,
          ),
        })),
      }));
      const host = useWorkoutLogStore
        .getState()
        .exercises.find(e => e.sets.some(s => s.clientKey === clientKey));
      if (host) {
        void usePersonalRecordSessionStore.getState().recomputeExercise({
          userId: host.userId,
          sessionId: host.sessionId,
          workoutExerciseId: host.id,
          exerciseName: host.exerciseName,
          exerciseId: host.exerciseId,
          sets: host.sets
            .filter(s => !s.failed && !s.id.startsWith('temp-'))
            .map(s => ({
              id: s.id,
              weightKg: s.weightKg,
              reps: s.reps,
              setNumber: s.setNumber,
            })),
        });
      }
      return;
    }

    const createdSet = await addWorkoutSet({
      workoutExerciseId: latest.set.workoutExerciseId,
      sessionId: latest.set.sessionId,
      userId: latest.set.userId,
      weightKg: latest.set.weightKg,
      reps: latest.set.reps,
      setNumber: latest.set.setNumber,
    });
    createdSet.clientKey = clientKey;

    if (cancelledKeys.has(clientKey)) {
      await deleteWorkoutSet(createdSet.id);
      const hostLeft = useWorkoutLogStore
        .getState()
        .exercises.find(e => e.id === latest.set.workoutExerciseId);
      if (!hostLeft) {
        await deleteWorkoutExercise(latest.set.workoutExerciseId);
      }
      cancelledKeys.delete(clientKey);
      return;
    }

    const after = findByClientKey(useWorkoutLogStore.getState().exercises, clientKey);
    const drifted =
      after != null &&
      (after.set.weightKg !== createdSet.weightKg || after.set.reps !== createdSet.reps);

    useWorkoutLogStore.setState(s => ({
      error: s.exercises.some(e => e.sets.some(st => st.failed && st.clientKey !== clientKey))
        ? s.error
        : null,
      exercises: s.exercises.map(e => ({
        ...e,
        sets: e.sets.map(st =>
          st.clientKey === clientKey
            ? {
                ...createdSet,
                weightKg: after?.set.weightKg ?? createdSet.weightKg,
                reps: after?.set.reps ?? createdSet.reps,
                pending: drifted,
                failed: false,
                clientKey,
              }
            : st,
        ),
      })),
    }));

    if (drifted && after) {
      const updated = await updateWorkoutSet({
        setId: createdSet.id,
        weightKg: after.set.weightKg,
        reps: after.set.reps,
      });
      useWorkoutLogStore.setState(s => ({
        exercises: s.exercises.map(e => ({
          ...e,
          sets: e.sets.map(st =>
            st.id === createdSet.id
              ? {...updated, pending: false, failed: false, clientKey}
              : st,
          ),
        })),
      }));
    }

    const host = useWorkoutLogStore
      .getState()
      .exercises.find(e => e.sets.some(s => s.clientKey === clientKey || s.id === createdSet.id));
    const saved = host?.sets.find(s => s.id === createdSet.id);
    if (host && saved && saved.weightKg != null && saved.reps != null) {
      void usePersonalRecordSessionStore.getState().evaluateCompletedSet({
        userId: host.userId,
        sessionId: host.sessionId,
        setId: saved.id,
        workoutExerciseId: host.id,
        exerciseName: host.exerciseName,
        exerciseId: host.exerciseId,
        weightKg: saved.weightKg,
        reps: saved.reps,
      });
      void checkAndUnlockBadges(host.userId);
    }
  } catch (e: any) {
    markSetFailed(clientKey, e?.message ?? 'Kunne ikke gemme sættet');
  }
}
