/**
 * Viewport logo-marker selection — no numbered cluster bubbles.
 * Performance comes from spatial viewport queries + a hard cap, not visual clustering.
 */
import type {Region} from 'react-native-maps';
import type {MapCenter} from '@/data/mapCentersData';

/** Hard cap on React Native Map `<Marker>` logo instances at once. */
export const MAP_MAX_LOGO_MARKERS = 120;

/** @deprecated Prefer MAP_MAX_LOGO_MARKERS — kept for older test imports. */
export const MAP_MAX_NATIVE_MARKERS = MAP_MAX_LOGO_MARKERS;

/** @deprecated Logos are always shown; zoom gate removed. */
export const MAP_LOGO_MARKER_MAX_DELTA = 0.08;

/** @deprecated No longer used for clustering. */
export const MAP_MAX_INDIVIDUAL_MARKERS = MAP_MAX_LOGO_MARKERS;

export type MapSingleMarker = {
  kind: 'single';
  center: MapCenter;
};

/** Retained for type compatibility — clustering no longer produces these. */
export type MapClusterMarker = {
  kind: 'cluster';
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  centers: MapCenter[];
};

export type MapDisplayMarker = MapSingleMarker | MapClusterMarker;

/** @deprecated Always true for logo rendering path. */
export function isMapZoomedInForLogos(_region: Region): boolean {
  return true;
}

function centerCoord(c: MapCenter): {lat: number; lng: number} {
  return {
    lat: c.mapLatitude ?? c.latitude,
    lng: c.mapLongitude ?? c.longitude,
  };
}

/**
 * Choose individual gyms for logo markers within a viewport result set.
 * When over the cap, prefer distance to the **current map centre**; activity is
 * only a tie-breaker. Never returns numbered cluster markers.
 */
export function selectMapCentersForLogoMarkers(
  centers: readonly MapCenter[],
  region: Region,
  maxMarkers: number = MAP_MAX_LOGO_MARKERS,
): MapCenter[] {
  if (centers.length === 0) {
    return [];
  }
  if (centers.length <= maxMarkers) {
    return centers.slice();
  }

  const scored = centers.map(center => {
    const {lat, lng} = centerCoord(center);
    const dLat = lat - region.latitude;
    const dLng = lng - region.longitude;
    const dist2 = dLat * dLat + dLng * dLng;
    const activity =
      (center.friendsActiveCount ?? 0) * 20 + (center.totalActiveCount ?? 0);
    return {center, dist2, activity};
  });

  scored.sort((a, b) => {
    if (a.dist2 !== b.dist2) {
      return a.dist2 - b.dist2;
    }
    return b.activity - a.activity;
  });

  return scored.slice(0, maxMarkers).map(s => s.center);
}

/**
 * Build display markers — one logo marker per selected gym (no clusters).
 */
export function clusterMapCentersForDisplay(
  centers: readonly MapCenter[],
  region: Region,
  maxIndividual: number = MAP_MAX_LOGO_MARKERS,
): MapDisplayMarker[] {
  return selectMapCentersForLogoMarkers(centers, region, maxIndividual).map(
    center => ({kind: 'single' as const, center}),
  );
}

export function countLogoMarkers(markers: readonly MapDisplayMarker[]): number {
  return markers.filter(m => m.kind === 'single').length;
}

export function countClusterMarkers(markers: readonly MapDisplayMarker[]): number {
  return markers.filter(m => m.kind === 'cluster').length;
}
