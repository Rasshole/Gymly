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

/** Kort dansk fejltekst hvis ugyldigt; ellers null. */
export function getUsernameFormatErrorDa(normalized: string): string | null {
  const u = normalizeUsernameForStorage(normalized);
  if (u.length === 0) {
    return 'Vælg et brugernavn.';
  }
  if (u.length < 3) {
    return 'Mindst 3 tegn.';
  }
  if (u.length > 20) {
    return 'Højst 20 tegn.';
  }
  if (!USERNAME_RE.test(u)) {
    return 'Kun bogstaver, tal, punktum og _ (ingen mellemrum).';
  }
  return null;
}
