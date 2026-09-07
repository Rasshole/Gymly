/**
 * Public store destinations for marketing / invite landing.
 * Only include URLs verified against live store listings or project config.
 */

/** Verified via iTunes Lookup (bundleId com.test1.Gymly, trackId 6757790972). */
export const GYMLY_APP_STORE_URL =
  'https://apps.apple.com/dk/app/gymly-staerkere-sammen/id6757790972';

/**
 * Google Play public listing for applicationId com.gymly is not published yet
 * (play.google.com/.../details?id=com.gymly → 404). Do not invent a URL.
 */
export const GYMLY_PLAY_STORE_URL: string | null = null;
