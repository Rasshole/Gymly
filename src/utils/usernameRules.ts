/**
 * Globale brugernavneregler (matcher DB + onboarding).
 * Tilladt: bogstaver, tal, _ og . · ingen mellemrum · 3–20 tegn · case-insensitive (gem lowercase).
 */

const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

/** Fjern mellemrum, lowercase — til visning under indtastning. */
export function normalizeUsernameInput(raw: string): string {
  return raw.replace(/\s/g, '').toLowerCase();
}

/** Værdi der sendes til API/DB (trim + lowercase). */
export function normalizeUsernameForStorage(raw: string): string {
  return normalizeUsernameInput(raw.trim());
}

export function isUsernameFormatValid(normalized: string): boolean {
  return USERNAME_RE.test(normalized);
}

/** @deprecated Use getUsernameFormatError with language. */
export function getUsernameFormatErrorDa(normalized: string): string | null {
  return getUsernameFormatError('da', normalized);
}

type UsernameErrorKey =
  | 'empty'
  | 'minLength'
  | 'maxLength'
  | 'invalidChars';

const USERNAME_ERRORS: Record<
  'da' | 'en' | 'sv',
  Record<UsernameErrorKey, string>
> = {
  da: {
    empty: 'Vælg et brugernavn.',
    minLength: 'Mindst 3 tegn.',
    maxLength: 'Højst 20 tegn.',
    invalidChars: 'Kun bogstaver, tal, punktum og _ (ingen mellemrum).',
  },
  en: {
    empty: 'Choose a username.',
    minLength: 'At least 3 characters.',
    maxLength: 'At most 20 characters.',
    invalidChars: 'Letters, numbers, dots and _ only (no spaces).',
  },
  sv: {
    empty: 'Välj ett användarnamn.',
    minLength: 'Minst 3 tecken.',
    maxLength: 'Högst 20 tecken.',
    invalidChars: 'Endast bokstäver, siffror, punkt och _ (inga mellanslag).',
  },
};

/** Localized format error; null if valid. */
export function getUsernameFormatError(
  lang: 'da' | 'en' | 'sv',
  normalized: string,
): string | null {
  const u = normalizeUsernameForStorage(normalized);
  const m = USERNAME_ERRORS[lang];
  if (u.length === 0) return m.empty;
  if (u.length < 3) return m.minLength;
  if (u.length > 20) return m.maxLength;
  if (!USERNAME_RE.test(u)) return m.invalidChars;
  return null;
}
