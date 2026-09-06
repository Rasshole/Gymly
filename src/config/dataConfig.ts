/**
 * Data layer — produktion bruger kun rigtige backend-kilder (Firestore m.m.).
 */

/**
 * Når true: spring GPS/afstands-krav over (kun til intern debug).
 * App Store / produktion: false.
 */
export const SKIP_CHECK_IN_LOCATION_RADIUS = false;

/** Maks. afstand til aktivt/valgt center for manuelt tjek-ind (meter). */
export const CHECK_IN_RADIUS_METERS = 200;
