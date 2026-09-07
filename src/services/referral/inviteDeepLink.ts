/**
 * Invite deep links — https://gymlyapp.com/invite/{code} and gymly://invite/{code}.
 * Persists code via pendingInviteCode for onboarding; does not apply the referral.
 */

import {savePendingInviteCode} from '@/services/referral/pendingInviteCode';
import {
  normalizeReferralCode,
  parseInviteCodeFromPath,
} from '@/services/referral/referralCodeUtils';

export function parseInviteCodeFromUrl(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }
  const withoutHash = trimmed.split('#')[0] ?? trimmed;
  const pathPart = withoutHash.split('?')[0] ?? withoutHash;

  const fromPath = parseInviteCodeFromPath(pathPart);
  if (fromPath && fromPath.length >= 4) {
    return fromPath;
  }

  // Custom schemes: gymly://invite/CODE (host=invite, path=/CODE)
  try {
    const withHttp = pathPart
      .replace(/^gymly:\/\//i, 'https://')
      .replace(/^gymlyapp:\/\//i, 'https://');
    const u = new URL(withHttp);
    if (u.hostname.toLowerCase() === 'invite') {
      const segment = u.pathname.replace(/^\//, '').split('/')[0];
      const code = normalizeReferralCode(segment);
      return code && code.length >= 4 ? code : null;
    }
    if (
      u.hostname.toLowerCase() === 'gymlyapp.com' ||
      u.hostname.toLowerCase() === 'www.gymlyapp.com'
    ) {
      const code = parseInviteCodeFromPath(u.pathname);
      return code && code.length >= 4 ? code : null;
    }
  } catch {
    /* fall through */
  }

  return null;
}

export function isInviteDeepLinkUrl(url: string | null | undefined): boolean {
  return parseInviteCodeFromUrl(url) != null;
}

/**
 * Save invite code from a deep link. Returns normalized code or null.
 * Does not navigate or apply the referral — Register social step consumes pending.
 */
export async function handleInviteDeepLink(
  url: string | null | undefined,
): Promise<string | null> {
  const code = parseInviteCodeFromUrl(url);
  if (!code) {
    return null;
  }
  return savePendingInviteCode(code);
}
