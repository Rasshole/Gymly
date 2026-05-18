/**
 * Helpers for workout post ids (Supabase UUID vs local demo / activity ids).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLocalDemoPostId(id: string): boolean {
  return (
    id.startsWith('demo-') ||
    id.startsWith('demo-feed-') ||
    id.startsWith('demo-act-')
  );
}

export function isLikelyServerPostUuid(id: string): boolean {
  return UUID_RE.test(id);
}
