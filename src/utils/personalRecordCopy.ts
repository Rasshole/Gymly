/**
 * PR display / social copy helpers.
 */

import type {DetectedPersonalRecord} from '@/types/personalRecord.types';
import type {AppLanguage} from '@/i18n/types';
import {getExerciseDisplayName, getRuntimeLanguage, rt} from '@/i18n';
import {weightKey} from '@/utils/personalRecordEngine';

export function formatPrLiftLine(weightKg: number, reps: number): string {
  const w = weightKey(weightKg).replace('.', ',');
  return `${w} kg × ${reps}`;
}

export function formatPrToastMessage(
  record: DetectedPersonalRecord,
  lang: AppLanguage = getRuntimeLanguage(),
): string {
  const exercise = getExerciseDisplayName({
    exerciseId: record.exerciseId,
    fallbackName: record.exerciseName,
    language: lang,
  });
  const lift = formatPrLiftLine(record.weightKg, record.reps);
  return rt('prCopy.newPrToast', {exercise, lift});
}

export function formatPrTypeLabel(
  recordType: 'weight_pr' | 'rep_pr',
  _lang?: AppLanguage,
): string {
  if (recordType === 'weight_pr') {
    return rt('prCopy.weightPr');
  }
  return rt('prCopy.repPr');
}

/** Short social headline variants (deterministic pick). */
export function pickSharedWorkoutHeadline(params: {
  authorFirstName: string;
  prs: Array<{exerciseName: string; exerciseId?: string | null; recordType: string}>;
  lang: AppLanguage;
}): string {
  const {authorFirstName, prs, lang} = params;
  const name =
    authorFirstName.trim() || rt('prCopy.someone');
  if (prs.length === 0) {
    return rt('prCopy.finishedWorkout', {name});
  }
  if (prs.length === 1) {
    const ex = getExerciseDisplayName({
      exerciseId: prs[0].exerciseId ?? null,
      fallbackName: prs[0].exerciseName,
      language: lang,
    });
    const useAlt = (name.length + ex.length) % 2 === 1;
    return useAlt
      ? rt('prCopy.beatPr', {name, exercise: ex})
      : rt('prCopy.hitPr', {name, exercise: ex});
  }
  return rt('prCopy.hitNPrs', {name, count: prs.length});
}
