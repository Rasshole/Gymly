/**
 * Format training duration from whole minutes.
 * Danish/Norwegian: 24 min, 1 t 56 min, 4 t.
 * English and other UI languages: 24 min, 1 h 56 min, 4 h.
 * Exact hours omit the zero minutes.
 */
export function formatWorkoutDuration(
  minutes: number,
  language: string = 'da',
): string {
  const mins = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (mins < 60) {
    return `${mins} min`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const lang = language.toLowerCase();
  const hourUnit = lang === 'da' || lang === 'nb' || lang.startsWith('da-') || lang.startsWith('nb-')
    ? 't'
    : 'h';
  if (m === 0) {
    return `${h} ${hourUnit}`;
  }
  return `${h} ${hourUnit} ${m} min`;
}

/** Seconds → same label (group session stats). */
export function formatGroupDurationLabel(totalSeconds: number): string {
  return formatWorkoutDuration(Math.round(totalSeconds / 60));
}
