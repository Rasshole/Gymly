/**
 * Map server apply_referral_code errors to UI states.
 * Email verification is intentionally not a gate.
 */

export type ReferralApplyErrorKind =
  | 'invalid'
  | 'expired'
  | 'self'
  | 'already'
  | 'ineligible'
  | 'generic';

export function mapReferralApplyError(error: unknown): ReferralApplyErrorKind {
  const msg = String(
    (error as {message?: string; code?: string} | null)?.message ??
      (error as {code?: string} | null)?.code ??
      error ??
      '',
  ).toUpperCase();

  if (msg.includes('REFERRAL_SELF_NOT_ALLOWED')) {
    return 'self';
  }
  if (msg.includes('REFERRAL_APPLY_WINDOW_EXPIRED')) {
    return 'expired';
  }
  if (msg.includes('REFERRAL_ALREADY_ATTRIBUTED')) {
    return 'already';
  }
  if (
    msg.includes('REFERRAL_CODE_NOT_FOUND') ||
    msg.includes('REFERRAL_CODE_INVALID')
  ) {
    return 'invalid';
  }
  if (
    msg.includes('REFERRAL_ACCOUNT_NOT_ELIGIBLE') ||
    msg.includes('REFERRAL_REFERRER_NOT_ELIGIBLE')
  ) {
    return 'ineligible';
  }
  return 'generic';
}

export function referralApplyErrorMessageKey(
  kind: ReferralApplyErrorKind,
): string {
  switch (kind) {
    case 'invalid':
      return 'inviteFive.applyInvalid';
    case 'expired':
      return 'inviteFive.applyExpired';
    case 'self':
      return 'inviteFive.applySelf';
    case 'already':
      return 'inviteFive.applyAlready';
    case 'ineligible':
      return 'inviteFive.applyIneligible';
    default:
      return 'inviteFive.applyGeneric';
  }
}
