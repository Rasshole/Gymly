/**
 * Top-level deep-link classification for App.tsx.
 * Invite is always checked before auth so /invite/{code} never hits auth handlers
 * (auth matcher treats query `code=` as auth).
 */

import {isAuthDeepLinkUrl} from '@/services/auth/authDeepLink';
import {
  handleInviteDeepLink,
  isInviteDeepLinkUrl,
} from '@/services/referral/inviteDeepLink';
import {
  isInviteFiveFriendsSurfaceEnabled,
  referralJourneyMayUseBackend,
} from '@/services/referral/inviteSurface';

export type AppDeepLinkKind = 'invite' | 'auth' | 'ignored';

export function classifyAppDeepLinkUrl(
  url: string | null | undefined,
): AppDeepLinkKind {
  if (!url || !String(url).trim()) {
    return 'ignored';
  }
  if (isInviteDeepLinkUrl(url)) {
    // Feature off: treat as ignored so App.tsx continues normal startup (no pending code).
    return isInviteFiveFriendsSurfaceEnabled() ? 'invite' : 'ignored';
  }
  if (isAuthDeepLinkUrl(url)) {
    return 'auth';
  }
  return 'ignored';
}

/**
 * Persist invite code when the URL is an invite deep link.
 * Auth handling stays in App.tsx — this never touches auth session.
 * Safe for cold start (getInitialURL) and warm state (Linking 'url').
 * Independent of login state — only writes pending invite storage.
 */
export async function handleIncomingInviteIfPresent(
  url: string | null | undefined,
): Promise<{handled: boolean; code: string | null}> {
  if (!isInviteFiveFriendsSurfaceEnabled()) {
    return {handled: false, code: null};
  }
  if (classifyAppDeepLinkUrl(url) !== 'invite') {
    return {handled: false, code: null};
  }
  const code = await handleInviteDeepLink(url);
  if (code && referralJourneyMayUseBackend()) {
    // Count the open once. Apply immediately when this account already exists;
    // otherwise the saved code is applied after signup or resumed onboarding.
    const pending = await import('@/services/referral/applyPendingInvite');
    await pending.noteReferralInviteOpened(code).catch(() => {});
    await pending.applyPendingInviteCode().catch(() => {});
  }
  return {handled: true, code};
}
