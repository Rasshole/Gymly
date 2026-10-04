/**
 * Pure helpers for feed author profile / DM actions.
 * Keeps Home / Activity feed cards from navigating to the wrong profile.
 */

export type FeedAuthorProfileTarget = 'self' | 'other' | 'none';

const SELF_SENTINELS = new Set(['current_user', 'me', 'self']);

function normalizeId(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function isSelfAuthor(author: string, viewer: string): boolean {
  if (!author) {
    return false;
  }
  if (SELF_SENTINELS.has(author)) {
    return true;
  }
  return Boolean(viewer) && author === viewer;
}

/** Resolve where a feed author tap should go, using canonical author user id. */
export function resolveFeedAuthorProfileTarget(
  authorUserId: string | undefined | null,
  viewerUserId: string | undefined | null,
): FeedAuthorProfileTarget {
  const author = normalizeId(authorUserId);
  if (!author) {
    return 'none';
  }
  const viewer = normalizeId(viewerUserId);
  if (isSelfAuthor(author, viewer)) {
    return 'self';
  }
  return 'other';
}

/** Message action only for other users with a valid author id (never self / system). */
export function shouldShowFeedMessageAction(
  authorUserId: string | undefined | null,
  viewerUserId: string | undefined | null,
): boolean {
  return resolveFeedAuthorProfileTarget(authorUserId, viewerUserId) === 'other';
}
