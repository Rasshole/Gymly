import type {Region} from 'react-native-maps';
import type {MapCenter} from '@/data/mapCentersData';

const PAD = 0.12;

/** Centres whose marker falls inside the current map viewport (with padding). */
export function filterMapCentersInRegion(
  centers: MapCenter[],
  region: Region,
): MapCenter[] {
  const latHalf = region.latitudeDelta * (0.5 + PAD);
  const lngHalf = region.longitudeDelta * (0.5 + PAD);
  const latMin = region.latitude - latHalf;
  const latMax = region.latitude + latHalf;
  const lngMin = region.longitude - lngHalf;
  const lngMax = region.longitude + lngHalf;

  return centers.filter(c => {
    const lat = c.mapLatitude ?? c.latitude;
    const lng = c.mapLongitude ?? c.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }
    return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
  });
}
