/**
 * formatRelativeTime – shared date formatting
 * Used by Activity feed, Home, Notifications, Messages, etc.
 */

export function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Lige nu';
  if (mins < 60) return `${mins} min siden`;
  if (hours < 24) return `${hours} time${hours > 1 ? 'r' : ''} siden`;
  if (days === 1) return 'i går';
  if (days < 7) return `${days} dage siden`;
  return date.toLocaleDateString('da-DK');
}
