/**
 * Stable, deterministic offset so markers don't stack when several centres share
 * the same postal / fallback coordinates (getEffectiveLatLng).
 * Offset is only for map display — true lat/lng stay on DanishGym for distance, etc.
 */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) + 0x9e3779b9; // non-zero
}

/** ~20–150 m from centre, ring distribution */
const R_MIN = 0.0002;
const R_SPREAD = 0.0011;

/**
 * @param baseLat base latitude (already effective, e.g. from danishGyms)
 * @param baseLng base longitude
 */
export function getMarkerMapCoordinate(
  id: string,
  baseLat: number,
  baseLng: number,
): {latitude: number; longitude: number} {
  const h = hashId(id);
  const t = (h % 10000) / 10000;
  const angle = 2 * Math.PI * t;
  const r = R_MIN + (h % 1000) * (R_SPREAD / 1000);
  return {
    latitude: baseLat + r * Math.cos(angle),
    longitude: baseLng + r * Math.sin(angle),
  };
}
