import type {DanishGym} from '@/data/danishGyms';
import {calculateDistance} from '@/utils/geoUtils';
import {
  isCzechiaCountry,
  isDenmarkCountry,
  isFinlandCountry,
  isFranceCountry,
  isGermanyCountry,
  isGreeceCountry,
  isHungaryCountry,
  isItalyCountry,
  isNetherlandsCountry,
  isNorwayCountry,
  isPolandCountry,
  isPortugalCountry,
  isRomaniaCountry,
  isSpainCountry,
  isSwedenCountry,
  isTurkeyCountry,
  isUkraineCountry,
} from '@/utils/gymCountry';

/** Default cap for browse lists — global search remains uncapped. */
export const DEFAULT_BROWSE_GYM_CAP = 200;

export type PickBrowseGymsInput = {
  gyms: readonly DanishGym[];
  userLocation: {latitude: number; longitude: number} | null;
  excludeIds?: ReadonlySet<string>;
  cap?: number;
  /**
   * Used only when location is missing. Onboarding passes the country that
   * matches the chosen app language so Suggestions are local, not A-to-Z.
   */
  preferredCountry?: string | null;
};

const COUNTRY_MATCHERS = [
  isDenmarkCountry,
  isSwedenCountry,
  isNorwayCountry,
  isGermanyCountry,
  isFranceCountry,
  isSpainCountry,
  isItalyCountry,
  isNetherlandsCountry,
  isPortugalCountry,
  isPolandCountry,
  isFinlandCountry,
  isTurkeyCountry,
  isUkraineCountry,
  isCzechiaCountry,
  isRomaniaCountry,
  isHungaryCountry,
  isGreeceCountry,
] as const;

function sameCountry(stored: string | undefined, preferred: string): boolean {
  for (const matches of COUNTRY_MATCHERS) {
    if (matches(preferred) && matches(stored)) {
      return true;
    }
  }
  return (stored ?? '').trim().toLowerCase() === preferred.trim().toLowerCase();
}

/** "København S" and "Aarhus C" share a city with the unsuffixed name. */
function cityGroupKey(gym: DanishGym): string {
  const city = gym.city?.trim() ?? '';
  const grouped = city.replace(/\s+[A-ZÆØÅ]{1,3}$/u, '').trim();
  return grouped || gym.id;
}

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
 * Suggestions for one country: one centre from each of the largest cities,
 * so a Danish list is København, Aarhus, Odense… rather than four streets
 * in the same district.
 */
export function pickPreferredCountryBrowse(
  gyms: readonly DanishGym[],
  preferredCountry: string,
  exclude: ReadonlySet<string>,
  cap: number,
): DanishGym[] {
  const byCity = new Map<string, DanishGym[]>();
  for (const gym of gyms) {
    if (exclude.has(gym.id) || !isPlottable(gym) || !sameCountry(gym.country, preferredCountry)) {
      continue;
    }
    const key = cityGroupKey(gym);
    const bucket = byCity.get(key);
    if (bucket) {
      bucket.push(gym);
    } else {
      byCity.set(key, [gym]);
    }
  }

  const cities = [...byCity.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) {
      return b[1].length - a[1].length;
    }
    return a[0].localeCompare(b[0], 'da');
  });

  const result: DanishGym[] = [];
  for (const [, bucket] of cities) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
    const gym = bucket[0];
    if (gym) {
      result.push(gym);
    }
    if (result.length >= cap) {
      return result;
    }
  }

  if (result.length < cap) {
    const used = new Set([...exclude, ...result.map(gym => gym.id)]);
    result.push(...pickGlobalBrowseFallback(gyms, used, cap - result.length));
  }
  return result;
}

/**
 * Pick a capped browse subset for “browse without search”.
 *
 * With location: nearest-first by distance (preferred country is ignored).
 * Without location and a preferred country: centres in that country, spread by city.
 * Otherwise: country-round-robin global sample (never empty when gyms exist).
 * Never uses raw catalog array order (centers.json is Denmark-first).
 * Global search remains a separate path and stays uncapped by this helper.
 */
export function pickBrowseGyms(input: PickBrowseGymsInput): DanishGym[] {
  const cap = input.cap ?? DEFAULT_BROWSE_GYM_CAP;
  const exclude = input.excludeIds ?? new Set<string>();

  if (!input.userLocation) {
    const preferred = input.preferredCountry?.trim();
    if (preferred) {
      return pickPreferredCountryBrowse(input.gyms, preferred, exclude, cap);
    }
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
