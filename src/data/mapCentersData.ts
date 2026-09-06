/**
 * Map Centers Data
 * Unified data model for map markers with activity counts (Supabase totals + venner).
 */

import {DanishGym} from '@/data/danishGyms';
import {getMarkerMapCoordinate} from '@/utils/centerMapJitter';

export interface MapCenter {
  id: string;
  name: string;
  /** Sande koordinater (afstand, kort) */
  latitude: number;
  longitude: number;
  /** Jitter, så markører ikke ligger oven i hinanden ved samme postnummer-approx. */
  mapLatitude: number;
  mapLongitude: number;
  logoUrl: string | null;
  friendsActiveCount: number;
  totalActiveCount: number;
  address?: string;
  city?: string;
  brand?: string;
  /** Eksplicit geokode i centers.json? */
  hasExplicitGeocode: boolean;
}

let cachedBaseMapCenters: MapCenter[] | null = null;
let cachedBaseMapCentersGymCount = 0;

/** Static map marker geometry — badge counts applied separately. */
export function getBaseMapCenters(gyms: DanishGym[]): MapCenter[] {
  if (cachedBaseMapCenters && cachedBaseMapCentersGymCount === gyms.length) {
    return cachedBaseMapCenters;
  }
  cachedBaseMapCenters = getMapCenters(gyms, new Map(), new Map());
  cachedBaseMapCentersGymCount = gyms.length;
  return cachedBaseMapCenters;
}

/** Merge live badge counts onto cached map centers (avoids rebuilding 12k+ markers). */
export function applyMapCenterBadges(
  centers: readonly MapCenter[],
  friendsByGymId: ReadonlyMap<string, number>,
  totalByGymId: ReadonlyMap<string, number>,
): MapCenter[] {
  if (friendsByGymId.size === 0 && totalByGymId.size === 0) {
    return centers as MapCenter[];
  }
  return centers.map(center => {
    const friendsActiveCount = friendsByGymId.get(center.id) ?? 0;
    const fromRpc = totalByGymId.get(center.id) ?? 0;
    const totalActiveCount = Math.max(fromRpc, friendsActiveCount);
    if (
      center.friendsActiveCount === friendsActiveCount &&
      center.totalActiveCount === totalActiveCount
    ) {
      return center;
    }
    return {...center, friendsActiveCount, totalActiveCount};
  });
}

/**
 * Build map centers array with logoUrl, friendsActiveCount, totalActiveCount
 */
export function getMapCenters(
  gyms: DanishGym[],
  friendsByGymId: Map<string, number>,
  totalByGymId: Map<string, number>,
): MapCenter[] {
  return gyms.map(gym => {
    const friendsActiveCount = friendsByGymId.get(gym.id) ?? 0;
    const fromRpc = totalByGymId.get(gym.id) ?? 0;
    const totalActiveCount = Math.max(fromRpc, friendsActiveCount);
    /** Kun lokale mærke-PNG'er; `GymLogoView` løser via brand+navn. */
    const logoUrl: string | null = null;

    const hasExplicit =
      gym._center?.lat != null &&
      gym._center?.lng != null &&
      Number.isFinite(gym._center.lat) &&
      Number.isFinite(gym._center.lng);
    if (
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      (!Number.isFinite(gym.latitude) || !Number.isFinite(gym.longitude))
    ) {
      console.warn(
        '[mapCenters] Center mangler gyldige koordinater (afstand/marker fejler):',
        gym.id,
        gym.name,
      );
    }
    const map = getMarkerMapCoordinate(gym.id, gym.latitude, gym.longitude);

    return {
      id: gym.id,
      name: gym.name,
      latitude: gym.latitude,
      longitude: gym.longitude,
      mapLatitude: map.latitude,
      mapLongitude: map.longitude,
      logoUrl,
      friendsActiveCount,
      totalActiveCount,
      address: gym.address,
      city: gym.city,
      brand: gym.brand,
      hasExplicitGeocode: hasExplicit,
    };
  });
}
