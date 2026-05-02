const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string | null | undefined): boolean {
  const s = (value ?? '').trim();
  return s.length > 0 && UUID_RE.test(s);
}

export function safeDisplayName(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const normalized = (candidate ?? '').trim();
    if (!normalized || isUuidLike(normalized)) {
      continue;
    }
    return normalized;
  }
  return 'Ukendt bruger';
}
