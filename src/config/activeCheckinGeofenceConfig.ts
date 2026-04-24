/**
 * Auto-tjek-ud: geofence + inaktivitet (juster tærskler her).
 * App-livscyclus (baggrund, lås) udløser ikke tjek-ud.
 */

export const ACTIVE_CHECKIN_SAFE_RADIUS = 400;
export const ACTIVE_CHECKIN_BUFFER_RADIUS = 800;

export const ACTIVE_CHECKIN_BUFFER_GRACE_MS = 15 * 60 * 1000;
export const ACTIVE_CHECKIN_OUTSIDE_GRACE_MS = 7 * 60 * 1000;

export const ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Minutter før 4t-inaktivitet, der viser advarsel når appen er åben */
export const ACTIVE_CHECKIN_INACTIVITY_WARN_BEFORE_MS = 30 * 60 * 1000;

/** Påviste stabile zoner: buffer kræver 3, uden for 2 (median-baseret) */
export const ACTIVE_CHECKIN_STABLE_CONSECUTIVE_BUFFER = 3;
export const ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE = 2;

export const ACTIVE_CHECKIN_LOCATION_INTERVAL_MS = 30 * 1000;

/** Hvis nyt rå-afstand ligger over median med så mange m, tælles som udsolgt (støj) */
export const ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M = 500;

export const MAX_DISTANCE_SAMPLES = 5;
