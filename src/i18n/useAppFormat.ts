import {useCallback, useMemo} from 'react';
import {format} from 'date-fns';
import {useTranslation} from './LanguageContext';

/** App-language date/streak formatting (not device locale). */
export function useAppFormat() {
  const {t, intlLocale, dateFnsLocale} = useTranslation();

  const weekdayShort = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({length: 7}, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const label = format(d, 'EEE', {locale: dateFnsLocale});
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  }, [dateFnsLocale]);

  const formatDateLong = useCallback(
    (date: Date) =>
      date.toLocaleDateString(intlLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [intlLocale],
  );

  const formatMonthYear = useCallback(
    (date: Date) =>
      date.toLocaleDateString(intlLocale, {month: 'long', year: 'numeric'}),
    [intlLocale],
  );

  const formatDateMedium = useCallback(
    (date: Date) =>
      date.toLocaleDateString(intlLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [intlLocale],
  );

  const streakLabel = useCallback(
    (days: number) =>
      days === 1
        ? t('format.streakOne')
        : t('format.streakMany', {count: String(days)}),
    [t],
  );

  const daysUntil = useCallback(
    (days: number, emoji: string) =>
      days === 1
        ? t('format.daysUntilOne', {emoji})
        : t('format.daysUntilMany', {count: String(days), emoji}),
    [t],
  );

  const dayWord = useCallback(
    (count: number) =>
      count === 1 ? t('format.dayOne') : t('format.dayMany', {count: String(count)}),
    [t],
  );

  const recordLabel = useCallback(
    (days: number) =>
      days === 1 ? t('format.recordOne') : t('format.recordMany', {count: String(days)}),
    [t],
  );

  const formatTrainingDuration = useCallback(
    (minutes: number) => {
      if (minutes < 60) {
        return t('format.durationMinutes', {count: String(minutes)});
      }
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return remainder === 0
        ? t('format.durationHoursOnly', {hours: String(hours)})
        : t('format.durationHoursMinutes', {
            hours: String(hours),
            minutes: String(remainder),
          });
    },
    [t],
  );

  return {
    weekdayShort,
    formatDateLong,
    formatMonthYear,
    formatDateMedium,
    streakLabel,
    daysUntil,
    dayWord,
    recordLabel,
    formatTrainingDuration,
    intlLocale,
    dateFnsLocale,
  };
}
