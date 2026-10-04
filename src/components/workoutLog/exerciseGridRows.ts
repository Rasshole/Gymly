/**
 * Pure helpers for Add Exercise 2-column grid row building.
 * Kept separate so pairing logic can be unit-tested without RN UI.
 */

import type {ExerciseLibraryItem} from '@/types/workoutLog.types';

export type ExerciseGridListRow =
  | {type: 'header'; key: string; title: string}
  | {
      type: 'pair';
      key: string;
      left: ExerciseLibraryItem;
      right?: ExerciseLibraryItem;
    }
  | {type: 'create'; key: string};

/** Pack exercises into left/right pairs for a 2-column virtualized list. */
export function pairExercisesForGrid(
  exercises: ExerciseLibraryItem[],
  keyPrefix: string,
): Extract<ExerciseGridListRow, {type: 'pair'}>[] {
  const pairs: Extract<ExerciseGridListRow, {type: 'pair'}>[] = [];
  for (let i = 0; i < exercises.length; i += 2) {
    const left = exercises[i];
    const right = exercises[i + 1];
    pairs.push({
      type: 'pair',
      key: `${keyPrefix}-${left.id}`,
      left,
      right,
    });
  }
  return pairs;
}
