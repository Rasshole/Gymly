/**
 * Eneste register over fitnesscentre. centers.json bygges med scripts/compile-centers.mjs
 */
import rawCenters from '@/data/centers.json';
import {getApproxLatLngForPostalCode} from '@/utils/dkPostalApprox';
import {
  allowsInventedCoordinates,
  isDenmarkCountry,
  isGermanyCountry,
  isNorwayCountry,
  isSwedenCountry,
  isFinlandCountry,
  isFranceCountry,
  isNetherlandsCountry,
  isUnitedKingdomCountry,
  isSpainCountry,
  isItalyCountry,
  isBelgiumCountry,
  isPolandCountry,
  isAustriaCountry,
  isSwitzerlandCountry,
  isPortugalCountry,
  isIrelandCountry,
  isCzechiaCountry,
  isHungaryCountry,
  isGreeceCountry,
  isRomaniaCountry,
  isSlovakiaCountry,
  isBulgariaCountry,
  isCroatiaCountry,
  isSloveniaCountry,
  isLithuaniaCountry,
  isLatviaCountry,
  isEstoniaCountry,
  isLuxembourgCountry,
  isMaltaCountry,
  isCyprusCountry,
  isIcelandCountry,
  isLiechtensteinCountry,
  isAndorraCountry,
  isMonacoCountry,
  isSanMarinoCountry,
  isVaticanCityCountry,
  isMoldovaCountry,
  isMontenegroCountry,
  isNorthMacedoniaCountry,
} from '@/utils/gymCountry';
import type {GymCenter} from '@/types/center.types';

const ALL = rawCenters as GymCenter[];

export const ALL_GYM_CENTERS: ReadonlyArray<GymCenter> = ALL;

const CENTER_BY_ID = new Map<string, GymCenter>();
for (const c of ALL) {
  CENTER_BY_ID.set(c.id, c);
}

let activeCentersCache: GymCenter[] | null = null;
let comingSoonCache: GymCenter[] | null = null;
const centersByCountryCache = new Map<string, GymCenter[]>();

function countryBucketKey(country: string): string {
  if (isDenmarkCountry(country)) {
    return 'denmark';
  }
  if (isSwedenCountry(country)) {
    return 'sweden';
  }
  if (isNorwayCountry(country)) {
    return 'norway';
  }
  if (isGermanyCountry(country)) {
    return 'germany';
  }
  if (isUnitedKingdomCountry(country)) {
    return 'united_kingdom';
  }
  if (isFinlandCountry(country)) {
    return 'finland';
  }
  if (isNetherlandsCountry(country)) {
    return 'netherlands';
  }
  if (isFranceCountry(country)) {
    return 'france';
  }
  if (isSpainCountry(country)) {
    return 'spain';
  }
  if (isItalyCountry(country)) {
    return 'italy';
  }
  if (isBelgiumCountry(country)) {
    return 'belgium';
  }
  if (isPolandCountry(country)) {
    return 'poland';
  }
  if (isAustriaCountry(country)) {
    return 'austria';
  }
  if (isSwitzerlandCountry(country)) {
    return 'switzerland';
  }
  if (isPortugalCountry(country)) {
    return 'portugal';
  }
  if (isIrelandCountry(country)) {
    return 'ireland';
  }
  if (isCzechiaCountry(country)) {
    return 'czechia';
  }
  if (isHungaryCountry(country)) {
    return 'hungary';
  }
  if (isGreeceCountry(country)) {
    return 'greece';
  }
  if (isRomaniaCountry(country)) {
    return 'romania';
  }
  if (isSlovakiaCountry(country)) {
    return 'slovakia';
  }
  if (isBulgariaCountry(country)) {
    return 'bulgaria';
  }
  if (isCroatiaCountry(country)) {
    return 'croatia';
  }
  if (isSloveniaCountry(country)) {
    return 'slovenia';
  }
  if (isLithuaniaCountry(country)) {
    return 'lithuania';
  }
  if (isLatviaCountry(country)) {
    return 'latvia';
  }
  if (isEstoniaCountry(country)) {
    return 'estonia';
  }
  if (isLuxembourgCountry(country)) {
    return 'luxembourg';
  }
  if (isMaltaCountry(country)) {
    return 'malta';
  }
  if (isCyprusCountry(country)) {
    return 'cyprus';
  }
  if (isIcelandCountry(country)) {
    return 'iceland';
  }
  if (isLiechtensteinCountry(country)) {
    return 'liechtenstein';
  }
  if (isAndorraCountry(country)) {
    return 'andorra';
  }
  if (isMonacoCountry(country)) {
    return 'monaco';
  }
  if (isSanMarinoCountry(country)) {
    return 'san-marino';
  }
  if (isVaticanCityCountry(country)) {
    return 'vatican-city';
  }
  if (isMoldovaCountry(country)) {
    return 'moldova';
  }
  if (isMontenegroCountry(country)) {
    return 'montenegro';
  }
  if (isNorthMacedoniaCountry(country)) {
    return 'north-macedonia';
  }
  return country.trim().toLowerCase() || 'unknown';
}

export function getAllCenters(): GymCenter[] {
  return ALL;
}

export function getActiveCenters(): GymCenter[] {
  if (!activeCentersCache) {
    activeCentersCache = ALL.filter(c => c.is_active && !c.is_coming_soon);
  }
  return activeCentersCache;
}

/** Check-in, favoritter m.m. (kun live centre) */
export function getCheckInCenters(): GymCenter[] {
  return getActiveCenters();
}

export function getComingSoonCenters(): GymCenter[] {
  if (!comingSoonCache) {
    comingSoonCache = ALL.filter(c => c.is_coming_soon);
  }
  return comingSoonCache;
}

export function getCentersByCountry(country: string): GymCenter[] {
  const key = countryBucketKey(country);
  let list = centersByCountryCache.get(key);
  if (!list) {
    list = ALL.filter(c => countryBucketKey(c.country) === key);
    centersByCountryCache.set(key, list);
  }
  return list;
}

export function getActiveCentersByCountry(country: string): GymCenter[] {
  return getCentersByCountry(country).filter(c => c.is_active && !c.is_coming_soon);
}

export function findCenterById(id: string | null | undefined): GymCenter | undefined {
  if (!id) {
    return undefined;
  }
  return CENTER_BY_ID.get(id);
}

/**
 * Når lat/lng er udfyldt i json bruges de; ellers:
 * - Denmark: postal-area approx (not exact address)
 * - Sweden: Stockholm fallback (legacy; prefer real coords)
 * - Norway / Germany / United Kingdom / Finland / Netherlands / France / Spain / Italy / Belgium / Poland / Austria / Switzerland / other: no invented coords
 */
export function getEffectiveLatLng(c: GymCenter): {lat: number; lng: number} {
  if (c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    return {lat: c.lat, lng: c.lng};
  }
  if (isSwedenCountry(c.country)) {
    return {lat: 59.33, lng: 18.07};
  }
  if (isDenmarkCountry(c.country)) {
    return getApproxLatLngForPostalCode(c.postal_code);
  }
  // UK: never London / country centroid. Same for NO/DE/FI and future countries.
  if (!allowsInventedCoordinates(c.country)) {
    return {lat: Number.NaN, lng: Number.NaN};
  }
  return getApproxLatLngForPostalCode(c.postal_code);
}

export function searchCenters(
  list: readonly GymCenter[],
  query: string,
): GymCenter[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...list];
  }
  return list.filter(
    c =>
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.brand.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.postal_code.includes(q),
  );
}

export function sortByDistance(
  list: readonly GymCenter[],
  lat: number,
  lng: number,
  distanceMeters: (a: number, b: number, c: number, d: number) => number,
): GymCenter[] {
  return [...list]
    .map(c => {
      const p = getEffectiveLatLng(c);
      const d =
        Number.isFinite(p.lat) && Number.isFinite(p.lng)
          ? distanceMeters(lat, lng, p.lat, p.lng)
          : Number.POSITIVE_INFINITY;
      return {c, d};
    })
    .sort((x, y) => x.d - y.d)
    .map(x => x.c);
}
