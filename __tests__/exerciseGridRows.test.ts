import {pairExercisesForGrid} from '@/components/workoutLog/exerciseGridRows';
import type {ExerciseLibraryItem} from '@/types/workoutLog.types';

function makeExercise(id: string, name: string): ExerciseLibraryItem {
  return {
    id,
    name,
    muscleGroup: 'chest',
    equipment: 'barbell',
  };
}

describe('pairExercisesForGrid', () => {
  it('pairs exercises into left/right columns', () => {
    const items = [
      makeExercise('a', 'A'),
      makeExercise('b', 'B'),
      makeExercise('c', 'C'),
    ];
    const pairs = pairExercisesForGrid(items, 'all');
    expect(pairs).toHaveLength(2);
    expect(pairs[0].left.id).toBe('a');
    expect(pairs[0].right?.id).toBe('b');
    expect(pairs[1].left.id).toBe('c');
    expect(pairs[1].right).toBeUndefined();
    expect(pairs[0].key).toBe('all-a');
    expect(pairs[1].key).toBe('all-c');
  });

  it('returns empty for empty input', () => {
    expect(pairExercisesForGrid([], 'x')).toEqual([]);
  });

  it('does not duplicate exercise ids across pairs', () => {
    const items = Array.from({length: 5}, (_, i) =>
      makeExercise(`id-${i}`, `Name ${i}`),
    );
    const pairs = pairExercisesForGrid(items, 'mg');
    const ids = pairs.flatMap(p =>
      p.right ? [p.left.id, p.right.id] : [p.left.id],
    );
    expect(ids).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4']);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
