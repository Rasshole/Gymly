/**
 * Launch surface toggles — Reserved for future competitive/social systems.
 *
 * Rankings, XP seasons, Gymly Deals marketplace, cosmetics, and leagues stay
 * in the codebase; flip these flags when you want to surface them again after traction.
 */

/** Trophy / global rangliste entry in main tab headers (stack screen remains registered). */
export const SURFACE_LEADERBOARD_IN_MAIN_CHROME = false;

/** Per-gym rangliste row + “Ugens mester” on center detail (navigation targets remain). */
export const SURFACE_LEADERBOARD_IN_GYM_DETAIL = false;

/**
 * Supabase `notifications.type` values that must not count toward the bell, in-app list,
 * or FCM dispatch while launch focus is social/live — not deleted from DB.
 */
export const SUPPRESSED_RANKING_NOTIFICATION_ROW_TYPES = new Set<string>([
  'leaderboard_movement',
]);

export function isSuppressedRankingNotificationRow(dbType: string | null | undefined): boolean {
  return SUPPRESSED_RANKING_NOTIFICATION_ROW_TYPES.has(String(dbType ?? '').trim());
}

/**
 * Dedicated “Online” sub-tab under the Venner stack (FriendsNavigator).
 * Reserved for future scaling (groups, events, center chats, broad live directory).
 * `OnlineScreen`, `useOnlineUsers`, and types stay in-repo — only the tab is hidden.
 */
export const SURFACE_ONLINE_SUBTAB_IN_FRIENDS = false;

/**
 * Grupper (Venner-fane, opret/find, feed-filtre, ny besked til gruppe).
 * Stack-ruter, Supabase og `GroupsScreen` er wired under Venner → Grupper.
 */
export const SURFACE_GROUPS_IN_APP = true;

/**
 * Demo-indhold toggle i Indstillinger (optagelse / fiktiv aktivitet).
 *
 * LAUNCH: kept `false` so production/Release and normal Debug installs never
 * surface a Settings toggle. Demo fixtures remain in-repo for tests / explicit
 * __DEV__ tooling, but `shouldShowDemoSettingsSection()` is hard-off for store builds.
 *
 * Flip to `true` only for intentional local recording sessions (still requires `__DEV__`).
 */
export const SURFACE_DEMO_MODE_IN_SETTINGS = false;

/**
 * Gymly Shop as a top-level bottom tab (replaces Messages in the tab bar).
 * Messages remain reachable via the shared header action + stack route.
 *
 * Toggle for Patrick / local QA:
 * - `true`  → tabs: Home | Friends | Check in | Shop | Profile
 * - `false` → tabs: Home | Friends | Check in | Messages | Profile (safe fallback)
 *
 * Catalogue source is separate (`SHOP_CATALOG_SOURCE` in `.env`):
 * - production → `shopify` (required; never silent mock fallback)
 * - tests → local mocks
 * - development → `local` only when explicitly set
 *
 * Keep `true` for Shop Phase 1B local QA once Shopify token is configured.
 */
export const SURFACE_SHOP_IN_TABS = true;

/**
 * Invite 5 Friends / Founding Crew campaign (hub, Friends/Settings CTAs, register
 * invite field, invite deep links, client qualify fallback, Founding Crew modal).
 *
 * Implementation stays in-repo — flip to `true` after QA. While `false`, CTAs are
 * hidden, invite deep links are ignored (no pending code), and the hub screen
 * exits safely if opened via a stale route.
 */
export const INVITE_5_FRIENDS_ENABLED = false;
