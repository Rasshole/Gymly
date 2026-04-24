/**
 * Eneste register over fitnesscentre. centers.json bygges med scripts/compile-centers.mjs
 */
import rawCenters from '@/data/centers.json';
import {getApproxLatLngForPostalCode} from '@/utils/dkPostalApprox';
import type {GymCenter} from '@/types/center.types';

const ALL = rawCenters as GymCenter[];

export const ALL_GYM_CENTERS: ReadonlyArray<GymCenter> = ALL;

export function getAllCenters(): GymCenter[] {
  return ALL;
}

export function getActiveCenters(): GymCenter[] {
  return ALL.filter(c => c.is_active && !c.is_coming_soon);
}

/** Check-in, favoritter m.m. (kun live centre) */
export function getCheckInCenters(): GymCenter[] {
  return getActiveCenters();
}

export function getComingSoonCenters(): GymCenter[] {
  return ALL.filter(c => c.is_coming_soon);
}

export function findCenterById(id: string | null | undefined): GymCenter | undefined {
  if (!id) {
    return undefined;
  }
  return ALL.find(c => c.id === id);
}

/**
 * Når lat/lng er udfyldt i json bruges de; ellers postområde (ikke nøjagtig adresse).
 */
export function getEffectiveLatLng(c: GymCenter): {lat: number; lng: number} {
  if (c.lat != null && c.lng != null) {
    return {lat: c.lat, lng: c.lng};
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
      return {c, d: distanceMeters(lat, lng, p.lat, p.lng)};
    })
    .sort((x, y) => x.d - y.d)
    .map(x => x.c);
}
