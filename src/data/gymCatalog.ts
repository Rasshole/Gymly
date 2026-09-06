/**
 * Canonical runtime gym catalog for Gymly.
 *
 * Production flow (client-side):
 *   centers.json → centerRegistry → danishGyms (view-model) → search / map / pickers
 *
 * Do not introduce parallel center arrays or country-specific runtime sources.
 */

export {
  ALL_GYM_CENTERS,
  getActiveCenters,
  findCenterById,
  getEffectiveLatLng,
} from './centerRegistry';

export {
  getActiveGyms,
  /** @deprecated Prefer getActiveGyms — name is historical; returns global catalog. */
  getActiveDanishGyms,
  findGymRecordById,
  findGymRecordByIdRelaxed,
  type DanishGym,
} from './danishGyms';
