/**
 * Locale-aware string pick: selected locale → English (never Danish-as-default).
 */
export function pickLocalizedString(
  language: string,
  packs: Record<string, string> & {en: string},
): string {
  return packs[language] ?? packs.en;
}
