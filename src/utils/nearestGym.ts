import {calculateDistance} from '@/utils/geoUtils';

export type GymLocation = {
  latitude: number;
  longitude: number;
};

/**
 * Linear nearest-gym scan. Fine through UK-scale catalogs; do not add a spatial
 * index unless benchmarks show this is no longer negligible.
 */
export function findNearestGym<T extends GymLocation>(
  latitude: number,
  longitude: number,
  gyms: readonly T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const gym of gyms) {
    if (!Number.isFinite(gym.latitude) || !Number.isFinite(gym.longitude)) {
      continue;
    }
    const d = calculateDistance(latitude, longitude, gym.latitude, gym.longitude);
    if (d < bestDist) {
      bestDist = d;
      best = gym;
    }
  }
  return best;
}
