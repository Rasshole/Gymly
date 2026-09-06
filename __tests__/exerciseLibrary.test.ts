import {
  EXERCISE_LIBRARY,
  EXERCISE_LIBRARY_COUNT,
  isLocalExerciseId,
  searchExerciseLibrary,
} from '@/data/exerciseLibrary';

describe('exercise library catalog', () => {
  it('preserves the original 33 seed exercise ids', () => {
    const legacyIds = [
      'ex-bench-press',
      'ex-incline-bench',
      'ex-chest-press',
      'ex-cable-fly',
      'ex-push-up',
      'ex-lat-pulldown',
      'ex-pull-up',
      'ex-barbell-row',
      'ex-seated-row',
      'ex-db-row',
      'ex-squat',
      'ex-leg-press',
      'ex-rdl',
      'ex-leg-ext',
      'ex-leg-curl',
      'ex-calf',
      'ex-shoulder-press',
      'ex-lateral-raise',
      'ex-rear-delt',
      'ex-biceps-curl',
      'ex-hammer-curl',
      'ex-triceps-pushdown',
      'ex-skull-crusher',
      'ex-hip-thrust',
      'ex-bulgarian',
      'ex-hip-abd',
      'ex-plank',
      'ex-cable-crunch',
      'ex-leg-raise',
      'ex-running',
      'ex-cycling',
      'ex-stairmaster',
      'ex-rowing',
    ];
    for (const id of legacyIds) {
      expect(EXERCISE_LIBRARY.some(e => e.id === id)).toBe(true);
    }
  });

  it('keeps original display names for history compatibility', () => {
    expect(EXERCISE_LIBRARY.find(e => e.id === 'ex-bench-press')?.name).toBe(
      'Bench Press',
    );
    expect(EXERCISE_LIBRARY.find(e => e.id === 'ex-squat')?.name).toBe('Squat');
    expect(EXERCISE_LIBRARY.find(e => e.id === 'ex-rdl')?.name).toBe(
      'Romanian Deadlift',
    );
  });

  it('has a substantially expanded catalog without duplicate names', () => {
    expect(EXERCISE_LIBRARY.length).toBe(EXERCISE_LIBRARY_COUNT);
    expect(EXERCISE_LIBRARY_COUNT).toBeGreaterThanOrEqual(200);
    const names = EXERCISE_LIBRARY.map(e => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('exercise library search', () => {
  it('finds RDL via alias', () => {
    const hits = searchExerciseLibrary('RDL');
    expect(hits.some(e => e.name === 'Romanian Deadlift')).toBe(true);
  });

  it('finds bench variations', () => {
    const hits = searchExerciseLibrary('bench');
    expect(hits.some(e => e.name === 'Bench Press')).toBe(true);
    expect(hits.length).toBeGreaterThan(3);
  });

  it('finds lat-related exercises', () => {
    const hits = searchExerciseLibrary('lat');
    expect(hits.some(e => e.name === 'Lat Pulldown')).toBe(true);
  });

  it('finds curl variations', () => {
    const hits = searchExerciseLibrary('curl');
    expect(hits.some(e => e.name === 'Biceps Curl')).toBe(true);
    expect(hits.length).toBeGreaterThan(5);
  });

  it('finds Bulgarian split squat', () => {
    const hits = searchExerciseLibrary('Bulgarian');
    expect(hits.some(e => e.name === 'Bulgarian Split Squat')).toBe(true);
  });

  it('finds OHP via alias', () => {
    const hits = searchExerciseLibrary('ohp');
    expect(hits.some(e => e.name === 'Shoulder Press')).toBe(true);
  });

  it('finds rear delt exercises', () => {
    const hits = searchExerciseLibrary('rear delt');
    expect(hits.some(e => e.name.includes('Rear Delt'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(searchExerciseLibrary('rDl').map(e => e.name)).toEqual(
      searchExerciseLibrary('RDL').map(e => e.name),
    );
  });
});

describe('local exercise ids', () => {
  it('treats seed and custom ids as non-UUID local ids', () => {
    expect(isLocalExerciseId('ex-bench-press')).toBe(true);
    expect(isLocalExerciseId('custom-abc')).toBe(true);
    expect(isLocalExerciseId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      false,
    );
  });
});
