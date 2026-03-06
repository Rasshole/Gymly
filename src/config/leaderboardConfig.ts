/**
 * Leaderboard konfiguration
 * Skift til true når Firestore er konfigureret
 */
export const USE_FIRESTORE_LEADERBOARD = true;

/** Pagination: antal entries per side */
export const LEADERBOARD_PAGE_SIZE = 50;

/** Cache TTL i ms (5 min) */
export const LEADERBOARD_CACHE_TTL = 5 * 60 * 1000;
