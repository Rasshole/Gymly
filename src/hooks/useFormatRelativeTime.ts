import {useCallback} from 'react';
import {useTranslation} from '@/i18n';
import {formatRelativeTime as formatRelativeTimeCore} from '@/utils/formatRelativeTime';

export function useFormatRelativeTime() {
  const {language} = useTranslation();
  return useCallback(
    (date: Date | string | number | null | undefined) =>
      formatRelativeTimeCore(date, language),
    [language],
  );
}
