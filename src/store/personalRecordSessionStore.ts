/**
 * Session-scoped PR baselines + live detections (cache for active workout).
 */

import {create} from 'zustand';
import type {
  DetectedPersonalRecord,
  ExercisePrBaseline,
} from '@/types/personalRecord.types';
import {fetchExercisePrBaseline} from '@/services/supabase/personalRecordService';
import {
  detectSetPersonalRecord,
  exercisePrKey,
  mergeSessionRecords,
  weightKey,
} from '@/utils/personalRecordEngine';

type SessionBest = {
  bestWeightKg: number | null;
  bestRepsByWeight: Record<string, number>;
};

type PersonalRecordSessionState = {
  sessionId: string | null;
  baselines: Record<string, ExercisePrBaseline>;
  loadingKeys: Record<string, boolean>;
  /** Set id → record shown on that set row */
  setRecords: Record<string, DetectedPersonalRecord>;
  /** Final-ish session list (deduped) */
  sessionRecords: DetectedPersonalRecord[];
  /** Toast payload when a meaningful new PR lands */
  toastRecord: DetectedPersonalRecord | null;
  /** Last toasted exercise+type to reduce spam */
  lastToastKey: string | null;
  sessionBestByExercise: Record<string, SessionBest>;

  reset: () => void;
  ensureBaseline: (params: {
    userId: string;
    sessionId: string;
    exerciseName: string;
    exerciseId?: string | null;
  }) => Promise<ExercisePrBaseline>;
  evaluateCompletedSet: (params: {
    userId: string;
    sessionId: string;
    setId: string;
    workoutExerciseId: string;
    exerciseName: string;
    exerciseId: string | null;
    weightKg: number;
    reps: number;
  }) => Promise<DetectedPersonalRecord | null>;
  /** Replay all sets for one exercise (after edits). */
  recomputeExercise: (params: {
    userId: string;
    sessionId: string;
    workoutExerciseId: string;
    exerciseName: string;
    exerciseId: string | null;
    sets: Array<{id: string; weightKg: number | null; reps: number | null; setNumber: number}>;
  }) => Promise<void>;
  clearToast: () => void;
  /** Mark set ids that currently hold a PR badge */
  isSetPr: (setId: string) => boolean;
  getSetRecord: (setId: string) => DetectedPersonalRecord | null;
};

const empty = {
  sessionId: null as string | null,
  baselines: {} as Record<string, ExercisePrBaseline>,
  loadingKeys: {} as Record<string, boolean>,
  setRecords: {} as Record<string, DetectedPersonalRecord>,
  sessionRecords: [] as DetectedPersonalRecord[],
  toastRecord: null as DetectedPersonalRecord | null,
  lastToastKey: null as string | null,
  sessionBestByExercise: {} as Record<string, SessionBest>,
};

function toastKey(r: DetectedPersonalRecord): string {
  return `${exercisePrKey(r.exerciseId, r.exerciseName)}:${r.recordType}`;
}

export const usePersonalRecordSessionStore = create<PersonalRecordSessionState>(
  (set, get) => ({
    ...empty,

    reset: () => set({...empty}),

    clearToast: () => set({toastRecord: null}),

    isSetPr: setId => Boolean(get().setRecords[setId]),

    getSetRecord: setId => get().setRecords[setId] ?? null,

    ensureBaseline: async ({userId, sessionId, exerciseName, exerciseId}) => {
      const key = exercisePrKey(exerciseId, exerciseName);
      const state = get();
      if (state.sessionId && state.sessionId !== sessionId) {
        set({
          ...empty,
          sessionId,
        });
      } else if (!state.sessionId) {
        set({sessionId});
      }

      const existing = get().baselines[key];
      if (existing) {
        return existing;
      }
      if (get().loadingKeys[key]) {
        // Wait briefly for in-flight
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 50));
          const b = get().baselines[key];
          if (b) {
            return b;
          }
        }
      }

      set(s => ({loadingKeys: {...s.loadingKeys, [key]: true}}));
      const baseline = await fetchExercisePrBaseline(userId, exerciseName, {
        excludeSessionId: sessionId,
        exerciseId,
      });
      set(s => ({
        baselines: {...s.baselines, [key]: baseline},
        loadingKeys: {...s.loadingKeys, [key]: false},
      }));
      return baseline;
    },

    evaluateCompletedSet: async params => {
      const {
        userId,
        sessionId,
        setId,
        workoutExerciseId,
        exerciseName,
        exerciseId,
        weightKg,
        reps,
      } = params;

      const key = exercisePrKey(exerciseId, exerciseName);
      const baseline = await get().ensureBaseline({
        userId,
        sessionId,
        exerciseName,
        exerciseId,
      });

      const best = get().sessionBestByExercise[key] ?? {
        bestWeightKg: null,
        bestRepsByWeight: {},
      };
      const wk = weightKey(weightKg);

      const detected = detectSetPersonalRecord({
        baseline,
        weightKg,
        reps,
        sessionBestWeightKg: best.bestWeightKg,
        sessionBestRepsAtWeight: best.bestRepsByWeight[wk] ?? null,
      });

      const nextBest: SessionBest = {
        bestWeightKg:
          best.bestWeightKg == null || weightKg > best.bestWeightKg
            ? weightKg
            : best.bestWeightKg,
        bestRepsByWeight: {
          ...best.bestRepsByWeight,
          [wk]:
            best.bestRepsByWeight[wk] == null || reps > best.bestRepsByWeight[wk]
              ? reps
              : best.bestRepsByWeight[wk],
        },
      };

      if (!detected) {
        set(s => ({
          sessionBestByExercise: {
            ...s.sessionBestByExercise,
            [key]: nextBest,
          },
        }));
        return null;
      }

      const enriched: DetectedPersonalRecord = {
        ...detected,
        workoutExerciseId,
        setId,
        exerciseId,
        exerciseName,
      };

      const prevToast = get().lastToastKey;
      const nextToastKey = toastKey(enriched);
      // Toast when new exercise PR type, or weight PR improves further
      const shouldToast =
        prevToast !== nextToastKey ||
        enriched.recordType === 'weight_pr';

      set(s => {
        // Clear old set badges for same exercise weight_pr when improved
        let setRecords = {...s.setRecords};
        if (enriched.recordType === 'weight_pr') {
          for (const [sid, rec] of Object.entries(setRecords)) {
            if (
              rec.recordType === 'weight_pr' &&
              exercisePrKey(rec.exerciseId, rec.exerciseName) === key
            ) {
              delete setRecords[sid];
            }
          }
        }
        setRecords[setId] = enriched;

        return {
          sessionBestByExercise: {
            ...s.sessionBestByExercise,
            [key]: nextBest,
          },
          setRecords,
          sessionRecords: mergeSessionRecords(s.sessionRecords, enriched),
          toastRecord: shouldToast ? enriched : s.toastRecord,
          lastToastKey: shouldToast ? nextToastKey : s.lastToastKey,
        };
      });

      return enriched;
    },

    recomputeExercise: async params => {
      const {
        userId,
        sessionId,
        workoutExerciseId,
        exerciseName,
        exerciseId,
        sets,
      } = params;
      const key = exercisePrKey(exerciseId, exerciseName);
      const baseline = await get().ensureBaseline({
        userId,
        sessionId,
        exerciseName,
        exerciseId,
      });

      set(s => {
        const setRecords = {...s.setRecords};
        for (const [sid, rec] of Object.entries(setRecords)) {
          if (
            exercisePrKey(rec.exerciseId, rec.exerciseName) === key
          ) {
            delete setRecords[sid];
          }
        }
        return {
          setRecords,
          sessionBestByExercise: {
            ...s.sessionBestByExercise,
            [key]: {bestWeightKg: null, bestRepsByWeight: {}},
          },
          sessionRecords: s.sessionRecords.filter(
            r => exercisePrKey(r.exerciseId, r.exerciseName) !== key,
          ),
        };
      });

      let sessionRecords = get().sessionRecords.filter(
        r => exercisePrKey(r.exerciseId, r.exerciseName) !== key,
      );
      let bestWeight: number | null = null;
      const bestReps: Record<string, number> = {};
      const setRecords: Record<string, DetectedPersonalRecord> = {
        ...get().setRecords,
      };
      let toast: DetectedPersonalRecord | null = null;

      for (const setRow of [...sets].sort((a, b) => a.setNumber - b.setNumber)) {
        if (setRow.weightKg == null || setRow.reps == null) {
          continue;
        }
        const wk = weightKey(setRow.weightKg);
        const detected = detectSetPersonalRecord({
          baseline,
          weightKg: setRow.weightKg,
          reps: setRow.reps,
          sessionBestWeightKg: bestWeight,
          sessionBestRepsAtWeight: bestReps[wk] ?? null,
        });
        if (bestWeight == null || setRow.weightKg > bestWeight) {
          bestWeight = setRow.weightKg;
        }
        if (bestReps[wk] == null || setRow.reps > bestReps[wk]) {
          bestReps[wk] = setRow.reps;
        }
        if (detected) {
          const enriched: DetectedPersonalRecord = {
            ...detected,
            workoutExerciseId,
            setId: setRow.id,
            exerciseId,
            exerciseName,
          };
          for (const [sid, rec] of Object.entries(setRecords)) {
            if (
              rec.recordType === 'weight_pr' &&
              exercisePrKey(rec.exerciseId, rec.exerciseName) === key &&
              enriched.recordType === 'weight_pr'
            ) {
              delete setRecords[sid];
            }
          }
          setRecords[setRow.id] = enriched;
          sessionRecords = mergeSessionRecords(sessionRecords, enriched);
          toast = enriched;
        }
      }

      set(s => ({
        setRecords: {...s.setRecords, ...setRecords},
        sessionBestByExercise: {
          ...s.sessionBestByExercise,
          [key]: {bestWeightKg: bestWeight, bestRepsByWeight: bestReps},
        },
        sessionRecords,
        toastRecord: toast ?? s.toastRecord,
        lastToastKey: toast ? toastKey(toast) : s.lastToastKey,
      }));
    },
  }),
);
