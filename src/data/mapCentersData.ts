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
