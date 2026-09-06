import {EXERCISE_LIBRARY} from '@/data/exerciseLibrary';
import {
  defaultExerciseMuscleFilterFromSession,
  defaultExerciseMuscleFiltersFromSession,
  filterExerciseLibraryByMuscle,
  toggleMuscleFilter,
  workoutMuscleFromCheckInKey,
} from '@/utils/workoutMuscleFilter';

describe('workoutMuscleFilter', () => {
  it('maps check-in keys to exercise library muscle groups', () => {
    expect(workoutMuscleFromCheckInKey('bryst')).toBe('chest');
    expect(workoutMuscleFromCheckInKey('ryg')).toBe('back');
    expect(workoutMuscleFromCheckInKey('skulder')).toBe('shoulders');
    expect(workoutMuscleFromCheckInKey('biceps')).toBe('biceps');
    expect(workoutMuscleFromCheckInKey('triceps')).toBe('triceps');
    expect(workoutMuscleFromCheckInKey('mave')).toBe('core');
    expect(workoutMuscleFromCheckInKey('cardio')).toBe('cardio');
    expect(workoutMuscleFromCheckInKey('ben')).toBeNull();
    expect(workoutMuscleFromCheckInKey('reformer')).toBeNull();
  });

  it('defaults to chest when check-in is chest only', () => {
    expect(defaultExerciseMuscleFiltersFromSession('bryst')).toEqual(['chest']);
    expect(defaultExerciseMuscleFilterFromSession('bryst')).toBe('chest');
  });

  it('defaults to back when check-in is back only', () => {
    expect(defaultExerciseMuscleFiltersFromSession('ryg')).toEqual(['back']);
  });

  it('defaults to cardio when check-in is cardio only', () => {
    expect(defaultExerciseMuscleFiltersFromSession('cardio')).toEqual([
      'cardio',
    ]);
  });

  it('prefills multiple mapped check-in muscle groups', () => {
    expect(defaultExerciseMuscleFiltersFromSession('bryst,triceps')).toEqual([
      'chest',
      'triceps',
    ]);
  });

  it('defaults to Alle for ambiguous legs check-in', () => {
    expect(defaultExerciseMuscleFiltersFromSession('ben')).toEqual([]);
    expect(defaultExerciseMuscleFilterFromSession('ben')).toBeNull();
  });

  it('defaults to Alle for empty workout type', () => {
    expect(defaultExerciseMuscleFiltersFromSession('')).toEqual([]);
    expect(defaultExerciseMuscleFiltersFromSession(undefined)).toEqual([]);
  });

  it('filters exercises by a single muscle group', () => {
    const chest = filterExerciseLibraryByMuscle(EXERCISE_LIBRARY, ['chest']);
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every(e => e.muscleGroup === 'chest')).toBe(true);
    expect(chest.some(e => e.name === 'Bench Press')).toBe(true);
  });

  it('filters with OR across multiple muscle groups', () => {
    const mixed = filterExerciseLibraryByMuscle(EXERCISE_LIBRARY, [
      'chest',
      'triceps',
    ]);
    expect(mixed.length).toBeGreaterThan(0);
    expect(
      mixed.every(
        e => e.muscleGroup === 'chest' || e.muscleGroup === 'triceps',
      ),
    ).toBe(true);
    expect(mixed.some(e => e.muscleGroup === 'chest')).toBe(true);
    expect(mixed.some(e => e.muscleGroup === 'triceps')).toBe(true);
  });

  it('returns full library when filter is Alle (empty)', () => {
    expect(filterExerciseLibraryByMuscle(EXERCISE_LIBRARY, []).length).toBe(
      EXERCISE_LIBRARY.length,
    );
    expect(filterExerciseLibraryByMuscle(EXERCISE_LIBRARY, null).length).toBe(
      EXERCISE_LIBRARY.length,
    );
  });

  it('toggles muscle filters on and off', () => {
    expect(toggleMuscleFilter([], 'chest')).toEqual(['chest']);
    expect(toggleMuscleFilter(['chest'], 'triceps')).toEqual([
      'chest',
      'triceps',
    ]);
    expect(toggleMuscleFilter(['chest', 'triceps'], 'chest')).toEqual([
      'triceps',
    ]);
  });
});
