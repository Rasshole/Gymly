/**
 * Contact status for an active check-in session.
 * null / unknown = not open to stranger hi (safe fallback).
 */

export type ContactStatus = 'open' | 'focused';

export function normalizeContactStatus(
  raw: string | null | undefined,
): ContactStatus | null {
  if (raw === 'open' || raw === 'focused') {
    return raw;
  }
  return null;
}

/** Strangers may only start a say-hi when recipient is explicitly open. */
export function isOpenToSayHi(
  status: ContactStatus | null | undefined,
): boolean {
  return status === 'open';
}

export function sharedMuscleGroups(
  a: string | null | undefined,
  b: string | null | undefined,
): string[] {
  const split = (s: string | null | undefined) =>
    (s ?? '')
      .split(/[,|/]+/)
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);
  const setB = new Set(split(b));
  const out: string[] = [];
  for (const m of split(a)) {
    if (setB.has(m) && !out.includes(m)) {
      out.push(m);
    }
  }
  return out;
}

export const SAY_HI_MAX_CHARS = 200;

export function validateSayHiMessage(raw: string): {
  ok: boolean;
  message: string;
  error?: 'empty' | 'too_long';
} {
  const message = raw.trim();
  if (!message) {
    return {ok: false, message: '', error: 'empty'};
  }
  if (message.length > SAY_HI_MAX_CHARS) {
    return {ok: false, message, error: 'too_long'};
  }
  return {ok: true, message};
}
