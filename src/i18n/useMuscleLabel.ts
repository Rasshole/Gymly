import {useCallback} from 'react';
import {labelForMuscleToken} from '@/utils/muscleGroupLabels';
import {useTranslation} from './LanguageContext';

export function useMuscleLabel() {
  const {language} = useTranslation();
  return useCallback((raw: string) => labelForMuscleToken(raw, language), [language]);
}
