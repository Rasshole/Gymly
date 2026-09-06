import type {DanishGym} from '@/data/danishGyms';
import {calculateDistance} from '@/utils/geoUtils';

/** Default cap for browse lists — global search remains uncapped. */
export const DEFAULT_BROWSE_GYM_CAP = 200;

export type PickBrowseGymsInput = {
  gyms: readonly DanishGym[];
  userLocation: {latitude: number; longitude: number} | null;
  excludeIds?: ReadonlySet<string>;
  cap?: number;
};

/**
 * Pick a capped browse subset sorted by distance from the user.
 *
 * Never uses raw catalog array order (centers.json is Denmark-first).
 * When location is unknown, returns [] so UI prompts search instead of
 * showing a misleading Denmark-only prefix slice.
 */
export function pickBrowseGyms(input: PickBrowseGymsInput): DanishGym[] {
  const cap = input.cap ?? DEFAULT_BROWSE_GYM_CAP;
  const exclude = input.excludeIds ?? new Set<string>();

  if (!input.userLocation) {
    return [];
  }

  const {latitude, longitude} = input.userLocation;
  const ranked: Array<{gym: DanishGym; distanceKm: number}> = [];

  for (const gym of input.gyms) {
    if (exclude.has(gym.id)) {
      continue;
    }
    if (!Number.isFinite(gym.latitude) || !Number.isFinite(gym.longitude)) {
      continue;
    }
    ranked.push({
      gym,
      distanceKm: calculateDistance(latitude, longitude, gym.latitude, gym.longitude),
    });
  }

  ranked.sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked.slice(0, cap).map(item => item.gym);
}
