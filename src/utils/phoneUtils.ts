/**
 * Normaliser dansk mobil til +45XXXXXXXX (8 cifre efter landekode).
 */

export function normalizeDanishPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let s = trimmed.replace(/\s/g, '');
  if (s.startsWith('+45')) s = s.slice(3);
  else if (s.startsWith('0045')) s = s.slice(4);
  const digits = s.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `+45${digits}`;
}

export function isValidDanishMobile(raw: string): boolean {
  return normalizeDanishPhone(raw) !== null;
}
