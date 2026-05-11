/**
 * formatRelativeTime – shared date formatting
 * Used by Activity feed, Home, Notifications, Messages, etc.
 */

function toValidDate(date: Date | string | number | null | undefined): Date | null {
  if (date == null) {
    return null;
  }
  const d = date instanceof Date ? date : new Date(date);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatRelativeTime(
  date: Date | string | number | null | undefined,
): string {
  const parsed = toValidDate(date);
  if (!parsed) {
    return '—';
  }
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Lige nu';
  if (mins < 60) return `${mins} min siden`;
  if (hours < 24) return `${hours} time${hours > 1 ? 'r' : ''} siden`;
  if (days === 1) return 'i går';
  if (days < 7) return `${days} dage siden`;
  return parsed.toLocaleDateString('da-DK');
}
