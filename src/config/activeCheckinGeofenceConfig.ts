/**
 * Auto-tjek-ud: GPS > CHECK_IN_RADIUS_METERS (200 m) fra det aktive session-center
 * → completeWorkoutSession + stop timer.
 *
 * Afstand beregnes altid mod stored/active check-in gym_id (ikke nærmeste center).
 * Safeguards: rolling median, spike reject, ~12s grace, 2 consecutive outside readings.
 */

import {CHECK_IN_RADIUS_METERS} from '@/config/dataConfig';

/** Samme 200 m-radius som manuelt tjek-ind */
export const AUTO_CHECKOUT_DISTANCE_METERS = CHECK_IN_RADIUS_METERS;

export const ACTIVE_CHECKIN_SAFE_RADIUS = AUTO_CHECKOUT_DISTANCE_METERS;
export const ACTIVE_CHECKIN_BUFFER_RADIUS = AUTO_CHECKOUT_DISTANCE_METERS;

/** Kort advarsel mens vi bekræfter GPS (vises ikke efter checkout) */
export const ACTIVE_CHECKIN_OUTSIDE_WARNING_MS = 12 * 1000;

/** @deprecated Bruges kun til tests */
export const ACTIVE_CHECKIN_OUTSIDE_GRACE_MS = ACTIVE_CHECKIN_OUTSIDE_WARNING_MS;

export const ACTIVE_CHECKIN_INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000;
export const ACTIVE_CHECKIN_INACTIVITY_WARN_BEFORE_MS = 30 * 60 * 1000;

/** 2 på hinanden følgende målinger uden for radius → afslut */
export const ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE = 2;
export const ACTIVE_CHECKIN_STABLE_CONSECUTIVE_BUFFER = ACTIVE_CHECKIN_STABLE_CONSECUTIVE_OUTSIDE;

export const ACTIVE_CHECKIN_LOCATION_INTERVAL_MS = 8 * 1000;

export const ACTIVE_CHECKIN_SPIKE_MAX_DELTA_M = 150;

export const MAX_DISTANCE_SAMPLES = 5;
