/**
 * Varighed for aktiv tjek ind-session (kort, dansk)
 */
export function formatActiveDurationSince(start: string | number | Date, now = Date.now()): string {
  const t = typeof start === 'string' || typeof start === 'number' ? new Date(start).getTime() : start.getTime();
  const diffMinutes = Math.max(1, Math.floor((now - t) / 60_000));
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}t ${minutes}m`;
  }
  return `${diffMinutes} min`;
}

/**
 * Hele sætningen til "Aktive nu" (5 min i gang / 1t 12m i gang)
 */
export function formatDurationIgang(
  start: string | number | Date,
  now = Date.now(),
): string {
  const t =
    typeof start === 'string' || typeof start === 'number'
      ? new Date(start).getTime()
      : start.getTime();
  const diffMinutes = Math.max(1, Math.floor((now - t) / 60_000));
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}t ${minutes}m i gang`;
  }
  return `${diffMinutes} min i gang`;
}
