export function withAvatarCacheBust(
  avatarUrl: string | null | undefined,
  updatedAt?: string | null,
): string | null {
  const base = (avatarUrl ?? '').trim();
  if (!base) {
    return null;
  }
  const stamp = (updatedAt ?? '').trim();
  if (!stamp) {
    return base;
  }
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${encodeURIComponent(stamp)}`;
}
