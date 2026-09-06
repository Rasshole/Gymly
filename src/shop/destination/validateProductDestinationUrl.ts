/**
 * Validates product purchase destinations — HTTPS only, no auth deep-link schemes.
 */

const BLOCKED_SCHEMES = new Set([
  'gymly',
  'gymlyapp',
  'javascript',
  'data',
  'file',
  'about',
  'intent',
]);

export type DestinationValidationResult =
  | {ok: true; url: string}
  | {ok: false; reason: 'empty' | 'invalid' | 'insecure' | 'blocked_scheme'};

export function validateProductDestinationUrl(
  raw: string | null | undefined,
): DestinationValidationResult {
  if (raw == null || String(raw).trim() === '') {
    return {ok: false, reason: 'empty'};
  }
  const trimmed = String(raw).trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {ok: false, reason: 'invalid'};
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme)) {
    return {ok: false, reason: 'blocked_scheme'};
  }
  if (scheme !== 'https') {
    return {ok: false, reason: 'insecure'};
  }
  return {ok: true, url: parsed.toString()};
}
