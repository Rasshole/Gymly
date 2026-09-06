/**
 * Global username rules (matches DB + onboarding).
 * Allowed: letters, numbers, _ and . · no spaces · 3–20 chars · case-insensitive (store lowercase).
 */

import {rt} from '@/i18n/runtimeLanguage';

const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

/** Strip spaces, lowercase — for live input display. */
export function normalizeUsernameInput(raw: string): string {
  return raw.replace(/\s/g, '').toLowerCase();
}

/** Value sent to API/DB (trim + lowercase). */
export function normalizeUsernameForStorage(raw: string): string {
  return normalizeUsernameInput(raw.trim());
}

export function isUsernameFormatValid(normalized: string): boolean {
  return USERNAME_RE.test(normalized);
}

/** @deprecated Use getUsernameFormatError. */
export function getUsernameFormatErrorDa(normalized: string): string | null {
  return getUsernameFormatError(normalized);
}

/**
 * Localized format error via i18n; null if valid.
 * Accepts legacy (lang, normalized) or (normalized) signatures.
 */
export function getUsernameFormatError(
  langOrNormalized: 'da' | 'en' | 'sv' | string,
  normalizedMaybe?: string,
): string | null {
  const normalized =
    normalizedMaybe !== undefined ? normalizedMaybe : langOrNormalized;
  const u = normalizeUsernameForStorage(normalized);
  if (u.length === 0) return rt('usernameRules.empty');
  if (u.length < 3) return rt('usernameRules.minLength');
  if (u.length > 20) return rt('usernameRules.maxLength');
  if (!USERNAME_RE.test(u)) return rt('usernameRules.invalidChars');
  return null;
}
