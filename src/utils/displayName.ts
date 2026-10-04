import {rt} from '@/i18n/runtimeLanguage';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Bootstrap usernames from ensureGymlyProfile — not public names. */
const BOOTSTRAP_USERNAME_RE = /^u_[a-f0-9]{8,}$/i;

/**
 * Email-shaped strings, including Apple private relay
 * (`…@privaterelay.appleid.com`) and any `local@domain` without spaces.
 */
const EMAIL_LIKE_RE =
  /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[^\s@]+@privaterelay\.appleid\.com)$/i;

/** Known neutral / placeholder labels — never count as a filled profile name. */
const NEUTRAL_FALLBACK_LABELS = new Set(
  [
    'gymly-bruger',
    'gymly bruger',
    'gymly user',
    'gymly member',
    'gymly-medlem',
    'gymly medlem',
    'ukendt bruger',
    'unknown user',
    'ukjent bruker',
    'okänd användare',
    'bruger',
    'en bruger',
    'user',
  ].map(s => s.toLowerCase()),
);

export function isUuidLike(value: string | null | undefined): boolean {
  const s = (value ?? '').trim();
  return s.length > 0 && UUID_RE.test(s);
}

export function isEmailLike(value: string | null | undefined): boolean {
  const s = (value ?? '').trim();
  if (!s) {
    return false;
  }
  if (EMAIL_LIKE_RE.test(s)) {
    return true;
  }
  // Any remaining `local@host` without whitespace (covers odd relay hosts).
  if (s.includes('@') && !/\s/.test(s) && s.indexOf('@') === s.lastIndexOf('@')) {
    const [local, host] = s.split('@');
    if (local && host && host.includes('.')) {
      return true;
    }
  }
  return false;
}

export function isNeutralDisplayNameFallback(
  value: string | null | undefined,
): boolean {
  const s = (value ?? '').trim().toLowerCase();
  return s.length > 0 && NEUTRAL_FALLBACK_LABELS.has(s);
}

/**
 * Shared rule for public profile / live / check-in display names.
 * Accepts spaces, accents, hyphens, and non-Latin scripts.
 * Rejects empty, UUID, email-like, bootstrap usernames, and neutral fallbacks.
 */
export function isUsablePublicDisplayName(
  value: string | null | undefined,
): boolean {
  const normalized = (value ?? '').trim();
  if (normalized.length < 2) {
    return false;
  }
  if (isUuidLike(normalized)) {
    return false;
  }
  if (isEmailLike(normalized)) {
    return false;
  }
  if (BOOTSTRAP_USERNAME_RE.test(normalized)) {
    return false;
  }
  if (isNeutralDisplayNameFallback(normalized)) {
    return false;
  }
  return true;
}

/** Localized neutral label for public UI (not a filled profile name). */
export function getNeutralDisplayNameFallback(): string {
  return rt('common.gymlyMember');
}

/** First usable candidate, or `undefined` (no fallback). */
export function firstUsableDisplayName(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const normalized = (candidate ?? '').trim();
    if (isUsablePublicDisplayName(normalized)) {
      return normalized;
    }
  }
  return undefined;
}

/**
 * Public display name: first usable candidate, else localized neutral fallback.
 * Never returns email, email-local-part-as-email, or UUID.
 */
export function safeDisplayName(
  ...candidates: Array<string | null | undefined>
): string {
  return firstUsableDisplayName(...candidates) ?? getNeutralDisplayNameFallback();
}

/**
 * Google/Apple → Supabase `user_metadata` fields that may carry a real name.
 * Never considers email.
 */
export function displayNameFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  const meta = metadata ?? {};
  return firstUsableDisplayName(
    typeof meta.displayName === 'string' ? meta.displayName : undefined,
    typeof meta.display_name === 'string' ? meta.display_name : undefined,
    typeof meta.full_name === 'string' ? meta.full_name : undefined,
    typeof meta.name === 'string' ? meta.name : undefined,
    [meta.given_name, meta.family_name]
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .join(' '),
  );
}

/**
 * Live / check-in resolution order:
 * current profile display name → profile username → stored check-in name → neutral.
 */
export function resolveLiveDisplayName(input: {
  profileDisplayName?: string | null;
  profileUsername?: string | null;
  checkInDisplayName?: string | null;
}): string {
  return safeDisplayName(
    input.profileDisplayName,
    input.profileUsername,
    input.checkInDisplayName,
  );
}

/** Initials for avatars — never derived from email or `@` local-part. */
export function avatarInitialsFromDisplayName(
  ...candidates: Array<string | null | undefined>
): string {
  const name = firstUsableDisplayName(...candidates);
  if (!name) {
    return 'G';
  }
  const parts = name.split(/\s+/).filter(Boolean);
  let out = '';
  for (const part of parts) {
    const ch = [...part].find(c => c !== '@' && /\S/.test(c));
    if (ch) {
      out += ch.toLocaleUpperCase();
    }
    if (out.length >= 2) {
      break;
    }
  }
  return out || 'G';
}
