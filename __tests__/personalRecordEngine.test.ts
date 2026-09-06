import {
  detectSetPersonalRecord,
  emptyBaseline,
  mergeSessionRecords,
  weightKey,
} from '../src/utils/personalRecordEngine';
import type {
  DetectedPersonalRecord,
  ExercisePrBaseline,
} from '../src/types/personalRecord.types';

function baselineWith(
  partial: Partial<ExercisePrBaseline> & {exerciseName?: string},
): ExercisePrBaseline {
  const base = emptyBaseline(partial.exerciseName ?? 'Bench Press', null);
  return {
    ...base,
    ...partial,
    hasPriorSessions: partial.hasPriorSessions ?? true,
  };
}

describe('personalRecordEngine', () => {
  test('weight key handles decimals', () => {
    expect(weightKey(82.5)).toBe('82.5');
    expect(weightKey(100)).toBe('100');
  });

  test('1) heavier weight is Weight PR', () => {
    const baseline = baselineWith({
      maxWeightKg: 100,
      repsByWeight: {'100': 8},
    });
    const pr = detectSetPersonalRecord({
      baseline,
      weightKg: 105,
      reps: 5,
    });
    expect(pr?.recordType).toBe('weight_pr');
    expect(pr?.weightKg).toBe(105);
  });

  test('2) more reps at same weight is Rep PR', () => {
    const baseline = baselineWith({
      maxWeightKg: 100,
      repsByWeight: {'100': 8},
    });
    const pr = detectSetPersonalRecord({
      baseline,
      weightKg: 100,
      reps: 10,
    });
    expect(pr?.recordType).toBe('rep_pr');
    expect(pr?.reps).toBe(10);
    expect(pr?.previousReps).toBe(8);
  });

  test('3) equaling record is not a PR', () => {
    const baseline = baselineWith({
      maxWeightKg: 100,
      repsByWeight: {'100': 8},
    });
    expect(
      detectSetPersonalRecord({baseline, weightKg: 100, reps: 8}),
    ).toBeNull();
  });

  test('4) first-ever exercise creates no PR spam', () => {
    const baseline = baselineWith({
      hasPriorSessions: false,
      maxWeightKg: null,
    });
    expect(
      detectSetPersonalRecord({baseline, weightKg: 100, reps: 3}),
    ).toBeNull();
    expect(
      detectSetPersonalRecord({baseline, weightKg: 90, reps: 5}),
    ).toBeNull();
  });

  test('5) improving weight PRs in session keep final best', () => {
    const baseline = baselineWith({
      maxWeightKg: 100,
      repsByWeight: {'100': 8},
    });
    let sessionBest: number | null = null;
    let records: DetectedPersonalRecord[] = [];

    for (const [w, r] of [
      [105, 5],
      [107.5, 4],
      [110, 3],
    ] as const) {
      const detected = detectSetPersonalRecord({
        baseline,
        weightKg: w,
        reps: r,
        sessionBestWeightKg: sessionBest,
      });
      if (sessionBest == null || w > sessionBest) {
        sessionBest = w;
      }
      if (detected) {
        records = mergeSessionRecords(records, {
          ...detected,
          exerciseName: 'Bench Press',
          exerciseId: null,
        });
      }
    }

    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe('weight_pr');
    expect(records[0].weightKg).toBe(110);
  });

  test('11) rep PR is weight-specific', () => {
    const baseline = baselineWith({
      maxWeightKg: 100,
      repsByWeight: {'100': 8, '90': 12},
    });
    const at100 = detectSetPersonalRecord({
      baseline,
      weightKg: 100,
      reps: 10,
    });
    expect(at100?.recordType).toBe('rep_pr');

    expect(
      detectSetPersonalRecord({baseline, weightKg: 80, reps: 15}),
    ).toBeNull();
  });

  test('12) weight PR preferred over rep PR at new max weight', () => {
    const baseline = baselineWith({
      maxWeightKg: 100,
      repsByWeight: {'100': 8},
    });
    const pr = detectSetPersonalRecord({
      baseline,
      weightKg: 110,
      reps: 4,
    });
    expect(pr?.recordType).toBe('weight_pr');
  });
});
