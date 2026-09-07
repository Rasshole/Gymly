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

export type AppDeepLinkKind = 'invite' | 'auth' | 'ignored';

export function classifyAppDeepLinkUrl(
  url: string | null | undefined,
): AppDeepLinkKind {
  if (!url || !String(url).trim()) {
    return 'ignored';
  }
  if (isInviteDeepLinkUrl(url)) {
    return 'invite';
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
  if (classifyAppDeepLinkUrl(url) !== 'invite') {
    return {handled: false, code: null};
  }
  const code = await handleInviteDeepLink(url);
  return {handled: true, code};
}
