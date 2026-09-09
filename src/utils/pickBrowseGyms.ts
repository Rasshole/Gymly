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

function isPlottable(gym: DanishGym): boolean {
  return Number.isFinite(gym.latitude) && Number.isFinite(gym.longitude);
}

/**
 * Deterministic global browse sample when GPS is unavailable.
 * Round-robins by country so catalog array order (Denmark-first) never wins.
 */
export function pickGlobalBrowseFallback(
  gyms: readonly DanishGym[],
  exclude: ReadonlySet<string>,
  cap: number,
): DanishGym[] {
  const byCountry = new Map<string, DanishGym[]>();
  for (const gym of gyms) {
    if (exclude.has(gym.id) || !isPlottable(gym)) {
      continue;
    }
    const key = gym.country?.trim() || 'Unknown';
    const bucket = byCountry.get(key);
    if (bucket) {
      bucket.push(gym);
    } else {
      byCountry.set(key, [gym]);
    }
  }

  for (const bucket of byCountry.values()) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
  }

  const countries = [...byCountry.keys()].sort((a, b) => a.localeCompare(b));
  const result: DanishGym[] = [];
  let depth = 0;
  while (result.length < cap) {
    let added = false;
    for (const country of countries) {
      const gym = byCountry.get(country)?.[depth];
      if (gym) {
        result.push(gym);
        added = true;
        if (result.length >= cap) {
          break;
        }
      }
    }
    if (!added) {
      break;
    }
    depth += 1;
  }
  return result;
}

/**
 * Pick a capped browse subset for “browse without search”.
 *
 * With location: nearest-first by distance.
 * Without location: country-round-robin global sample (never empty when gyms exist).
 * Never uses raw catalog array order (centers.json is Denmark-first).
 * Global search remains a separate path and stays uncapped by this helper.
 */
export function pickBrowseGyms(input: PickBrowseGymsInput): DanishGym[] {
  const cap = input.cap ?? DEFAULT_BROWSE_GYM_CAP;
  const exclude = input.excludeIds ?? new Set<string>();

  if (!input.userLocation) {
    return pickGlobalBrowseFallback(input.gyms, exclude, cap);
  }

  const {latitude, longitude} = input.userLocation;
  const ranked: Array<{gym: DanishGym; distanceKm: number}> = [];

  for (const gym of input.gyms) {
    if (exclude.has(gym.id) || !isPlottable(gym)) {
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
