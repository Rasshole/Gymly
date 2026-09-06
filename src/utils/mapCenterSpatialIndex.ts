import type {Region} from 'react-native-maps';
import type {MapCenter} from '@/data/mapCentersData';

const DEFAULT_CELL_DEG = 0.35;

export type MapCenterSpatialIndex = {
  cellDeg: number;
  buckets: Map<string, MapCenter[]>;
};

function cellKey(latCell: number, lngCell: number): string {
  return `${latCell},${lngCell}`;
}

function centerLatLng(c: MapCenter): {lat: number; lng: number} {
  return {
    lat: c.mapLatitude ?? c.latitude,
    lng: c.mapLongitude ?? c.longitude,
  };
}

/** One-time spatial bucket index for O(viewport cells) map queries. */
export function buildMapCenterSpatialIndex(
  centers: readonly MapCenter[],
  cellDeg = DEFAULT_CELL_DEG,
): MapCenterSpatialIndex {
  const buckets = new Map<string, MapCenter[]>();
  for (const center of centers) {
    const {lat, lng} = centerLatLng(center);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    const key = cellKey(Math.floor(lat / cellDeg), Math.floor(lng / cellDeg));
    const list = buckets.get(key);
    if (list) {
      list.push(center);
    } else {
      buckets.set(key, [center]);
    }
  }
  return {cellDeg, buckets};
}

export type QueryMapCentersOptions = {
  /** Hard cap on returned markers (pre-clustering). */
  maxResults?: number;
  /** Viewport padding factor (matches mapVisibleCenters). */
  pad?: number;
};

/** Zoom-aware cap — fewer logo markers at continent zoom; denser at city zoom. */
export function resolveViewportMaxResults(region: Region): number {
  const delta = Math.max(region.latitudeDelta, region.longitudeDelta);
  if (delta > 12) {
    return 60;
  }
  if (delta > 4) {
    return 90;
  }
  if (delta > 1) {
    return 120;
  }
  // City / neighbourhood (e.g. Copenhagen) — enough for dense chains without clustering.
  return 160;
}

/**
 * Query centers inside map viewport using spatial buckets — avoids scanning 12k+ rows.
 *
 * Always collects every in-bounds match first. If `maxResults` is set and exceeded,
 * keeps gyms closest to the **current map centre** (never truncates mid cell-scan).
 */
export function queryMapCentersInRegion(
  index: MapCenterSpatialIndex,
  region: Region,
  options: QueryMapCentersOptions = {},
): MapCenter[] {
  const pad = options.pad ?? 0.12;
  const maxResults = options.maxResults;
  const latHalf = region.latitudeDelta * (0.5 + pad);
  const lngHalf = region.longitudeDelta * (0.5 + pad);
  const latMin = region.latitude - latHalf;
  const latMax = region.latitude + latHalf;
  const lngMin = region.longitude - lngHalf;
  const lngMax = region.longitude + lngHalf;

  const latCellMin = Math.floor(latMin / index.cellDeg);
  const latCellMax = Math.floor(latMax / index.cellDeg);
  const lngCellMin = Math.floor(lngMin / index.cellDeg);
  const lngCellMax = Math.floor(lngMax / index.cellDeg);

  const out: MapCenter[] = [];
  for (let latCell = latCellMin; latCell <= latCellMax; latCell++) {
    for (let lngCell = lngCellMin; lngCell <= lngCellMax; lngCell++) {
      const bucket = index.buckets.get(cellKey(latCell, lngCell));
      if (!bucket) {
        continue;
      }
      for (const center of bucket) {
        const {lat, lng} = centerLatLng(center);
        if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
          out.push(center);
        }
      }
    }
  }

  if (maxResults == null || out.length <= maxResults) {
    return out;
  }

  // Cap only after full viewport collection — nearest to settled map centre win.
  out.sort((a, b) => {
    const ca = centerLatLng(a);
    const cb = centerLatLng(b);
    const da =
      (ca.lat - region.latitude) ** 2 + (ca.lng - region.longitude) ** 2;
    const db =
      (cb.lat - region.latitude) ** 2 + (cb.lng - region.longitude) ** 2;
    return da - db;
  });
  return out.slice(0, maxResults);
}
