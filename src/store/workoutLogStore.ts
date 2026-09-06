/**
 * Live workout log store — optimistic UI for aktiv session.
 */

import {create} from 'zustand';
import type {
  ExerciseLibraryItem,
  WorkoutExercise,
  WorkoutSet,
} from '@/types/workoutLog.types';
import {
  addWorkoutExercise,
  addWorkoutSet,
  deleteWorkoutSet,
  fetchWorkoutLogForSession,
  updateWorkoutSet,
} from '@/services/supabase/workoutLogService';
import {computeWorkoutVolumeKg} from '@/utils/workoutLogMath';
import {checkAndUnlockBadges} from '@/store/badgeStore';

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
  totals: () => {exerciseCount: number; setCount: number; volumeKg: number};
};

function withSetsOnly(exercises: WorkoutExercise[]): WorkoutExercise[] {
  return exercises.filter(e => e.sets.length > 0);
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
    set({loading: true, error: null, sessionId});
    try {
      const exercises = await fetchWorkoutLogForSession(sessionId);
      set({exercises, loading: false});
    } catch (e: any) {
      set({
        loading: false,
        error: e?.message ?? 'Kunne ikke hente træningslog',
      });
    }
  },

  totals: () => {
    const exercises = withSetsOnly(get().exercises);
    return {
      exerciseCount: exercises.length,
      setCount: exercises.reduce((n, e) => n + e.sets.length, 0),
      volumeKg: computeWorkoutVolumeKg(exercises),
    };
  },

  addExerciseWithFirstSet: async params => {
    const {sessionId, userId, exercise, weightKg, reps, clientKey} = params;
    set({saving: true, error: null});

    // Avoid duplicate if same clientKey already pending
    const existing = get().exercises.flatMap(e => e.sets).find(s => s.clientKey === clientKey);
    if (existing && !existing.pending) {
      set({saving: false});
      return existing;
    }

    const tempExId = `temp-ex-${clientKey}`;
    const tempSetId = `temp-set-${clientKey}`;
    const now = new Date().toISOString();
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
      sets: [
        {
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
          clientKey,
        },
      ],
    };

    set(s => ({
      exercises: [...s.exercises.filter(e => e.id !== tempExId), optimisticEx],
    }));

    try {
      const createdEx = await addWorkoutExercise({
        sessionId,
        userId,
        exercise,
      });
      const createdSet = await addWorkoutSet({
        workoutExerciseId: createdEx.id,
        sessionId,
        userId,
        weightKg,
        reps,
        setNumber: 1,
      });
      createdSet.clientKey = clientKey;

      set(s => ({
        saving: false,
        exercises: s.exercises.map(e =>
          e.id === tempExId
            ? {...createdEx, sets: [{...createdSet, pending: false, clientKey}]}
            : e,
        ),
      }));
      void checkAndUnlockBadges(userId);
      return createdSet;
    } catch (e: any) {
      set(s => ({
        saving: false,
        error: e?.message ?? 'Kunne ikke gemme sættet',
        exercises: s.exercises.filter(ex => ex.id !== tempExId),
      }));
      throw e;
    }
  },

  addSetOptimistic: async params => {
    const {workoutExerciseId, sessionId, userId, weightKg, reps, clientKey} =
      params;
    set({saving: true, error: null});

    const dup = get()
      .exercises.flatMap(e => e.sets)
      .find(s => s.clientKey === clientKey && !s.pending);
    if (dup) {
      set({saving: false});
      return dup;
    }

    const ex = get().exercises.find(e => e.id === workoutExerciseId);
    if (!ex) {
      set({saving: false, error: 'Øvelse ikke fundet'});
      throw new Error('Øvelse ikke fundet');
    }

    const nextNum = (ex.sets[ex.sets.length - 1]?.setNumber ?? 0) + 1;
    const tempSetId = `temp-set-${clientKey}`;
    const now = new Date().toISOString();
    const optimistic: WorkoutSet = {
      id: tempSetId,
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
      clientKey,
    };

    set(s => ({
      exercises: s.exercises.map(e =>
        e.id === workoutExerciseId
          ? {...e, sets: [...e.sets, optimistic], updatedAt: now}
          : e,
      ),
    }));

    try {
      const created = await addWorkoutSet({
        workoutExerciseId,
        sessionId,
        userId,
        weightKg,
        reps,
        setNumber: nextNum,
      });
      created.clientKey = clientKey;
      set(s => ({
        saving: false,
        exercises: s.exercises.map(e =>
          e.id === workoutExerciseId
            ? {
                ...e,
                sets: e.sets.map(st =>
                  st.id === tempSetId
                    ? {...created, pending: false, clientKey}
                    : st,
                ),
              }
            : e,
        ),
      }));
      void checkAndUnlockBadges(userId);
      return created;
    } catch (e: any) {
      set(s => ({
        saving: false,
        error: e?.message ?? 'Kunne ikke gemme sættet',
        exercises: s.exercises.map(exRow =>
          exRow.id === workoutExerciseId
            ? {
                ...exRow,
                sets: exRow.sets.filter(st => st.id !== tempSetId),
              }
            : exRow,
        ),
      }));
      throw e;
    }
  },

  editSetOptimistic: async ({setId, weightKg, reps}) => {
    const prev = get().exercises;
    set(s => ({
      saving: true,
      error: null,
      exercises: s.exercises.map(e => ({
        ...e,
        sets: e.sets.map(st =>
          st.id === setId ? {...st, weightKg, reps, pending: true} : st,
        ),
      })),
    }));
    try {
      const updated = await updateWorkoutSet({setId, weightKg, reps});
      set(s => ({
        saving: false,
        exercises: s.exercises.map(e => ({
          ...e,
          sets: e.sets.map(st =>
            st.id === setId ? {...updated, pending: false} : st,
          ),
        })),
      }));
    } catch (e: any) {
      set({
        saving: false,
        error: e?.message ?? 'Kunne ikke opdatere sættet',
        exercises: prev,
      });
      throw e;
    }
  },

  deleteSetOptimistic: async setId => {
    const prev = get().exercises;
    set(s => ({
      saving: true,
      error: null,
      exercises: s.exercises
        .map(e => ({
          ...e,
          sets: e.sets.filter(st => st.id !== setId),
        }))
        .filter(e => e.sets.length > 0 || !e.id.startsWith('temp-')),
    }));
    try {
      await deleteWorkoutSet(setId);
      // Reload to drop empty exercises cleanly
      const sessionId = get().sessionId;
      if (sessionId) {
        const exercises = await fetchWorkoutLogForSession(sessionId);
        set({exercises, saving: false});
      } else {
        set({saving: false});
      }
    } catch (e: any) {
      set({
        saving: false,
        error: e?.message ?? 'Kunne ikke slette sættet',
        exercises: prev,
      });
      throw e;
    }
  },
}));
