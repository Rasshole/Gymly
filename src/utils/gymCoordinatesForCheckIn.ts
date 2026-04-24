import {findCenterById, getEffectiveLatLng} from '@/data/centerRegistry';
import {findGymById} from '@/utils/gymDisplay';

/**
 * Center-koordinater: primært centerRegistry (centers.json), ellers danishGyms.
 */
export function getGymLatLngForCheckIn(
  gymId: string,
): {latitude: number; longitude: number} | null {
  const center = findCenterById(gymId);
  if (center) {
    const {lat, lng} = getEffectiveLatLng(center);
    return {latitude: lat, longitude: lng};
  }
  const g = findGymById(gymId);
  if (g) {
    return {latitude: g.latitude, longitude: g.longitude};
  }
  return null;
}
