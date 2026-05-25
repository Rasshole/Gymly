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
 * Grupper (Venner-fane, opret/find, feed-filtre, ny besked til gruppe) — skjult ved launch.
 * Stack-ruter, Supabase og `GroupsScreen` bevares modulært til genaktivering.
 */
export const SURFACE_GROUPS_IN_APP = false;

/**
 * Demo-indhold toggle i Indstillinger (optagelse / fiktiv aktivitet).
 * Sæt til `true` når du skal optage demo-video igen.
 */
export const SURFACE_DEMO_MODE_IN_SETTINGS = false;
