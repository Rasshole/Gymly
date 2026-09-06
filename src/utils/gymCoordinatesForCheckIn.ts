import {findCenterById, getEffectiveLatLng} from '@/data/centerRegistry';
import {findGymById} from '@/utils/gymDisplay';

/**
 * Center-koordinater: primært centerRegistry (centers.json), ellers gym catalog lookup.
 */
export function getGymLatLngForCheckIn(
  gymId: string,
): {latitude: number; longitude: number} | null {
  const center = findCenterById(gymId);
  if (center) {
    const {lat, lng} = getEffectiveLatLng(center);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return {latitude: lat, longitude: lng};
    }
    // Norway (and any center without inventable coords): never return NaN to geofence math.
    return null;
  }
  const g = findGymById(gymId);
  if (
    g &&
    Number.isFinite(g.latitude) &&
    Number.isFinite(g.longitude) &&
    !(g.latitude === 0 && g.longitude === 0)
  ) {
    return {latitude: g.latitude, longitude: g.longitude};
  }
  return null;
}
