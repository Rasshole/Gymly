/**
 * Shared referral helpers (Invite 5 Friends).
 * Keep in sync with SQL `referral_normalize_code` / `referral_invite_url`.
 */

export const REFERRAL_CAMPAIGN_ID = 'invite_five_founding';
export const REFERRAL_FOUNDER_BADGE_ID = 'referral_founder_5';
/** Existing friends badge — must stay separate from Founding Crew. */
export const SOCIAL_SQUAD_BADGE_ID = 'social_squad_5';
export const REFERRAL_QUALIFIED_TARGET = 5;
export const REFERRAL_APPLY_WINDOW_HOURS = 24;
export const REFERRAL_INVITE_ORIGIN = 'https://gymlyapp.com';

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const normalized = String(raw).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function buildReferralInviteUrl(code: string): string {
  const normalized = normalizeReferralCode(code);
  if (!normalized) {
    throw new Error('REFERRAL_CODE_INVALID');
  }
  return `${REFERRAL_INVITE_ORIGIN}/invite/${normalized}`;
}

export function parseInviteCodeFromPath(pathname: string): string | null {
  const match = pathname.match(/\/invite\/([A-Za-z0-9_-]+)/i);
  if (!match) {
    return null;
  }
  return normalizeReferralCode(match[1]);
}

/** True when account createdAt is within the apply window (server uses auth.users.created_at). */
export function isWithinReferralApplyWindow(
  createdAtIso: string | null | undefined,
  nowMs: number = Date.now(),
  windowHours: number = REFERRAL_APPLY_WINDOW_HOURS,
): boolean {
  if (!createdAtIso) {
    return false;
  }
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(created)) {
    return false;
  }
  return nowMs - created <= windowHours * 60 * 60 * 1000;
}
