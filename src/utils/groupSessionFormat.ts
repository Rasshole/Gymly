/**
 * Format training duration from whole minutes for UI.
 * Examples: 45 → "45 min.", 75 → "1 t. 15 min.", 120 → "2 t."
 */
export function formatWorkoutDuration(minutes: number): string {
  const mins = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (mins < 60) {
    return `${mins} min.`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) {
    return `${h} t.`;
  }
  return `${h} t. ${m} min.`;
}

/** Seconds → same label (group session stats). */
export function formatGroupDurationLabel(totalSeconds: number): string {
  return formatWorkoutDuration(Math.round(totalSeconds / 60));
}
