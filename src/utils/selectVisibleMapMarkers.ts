/**
 * Visible-viewport marker selection for Friends → Map discovery browsing.
 *
 * Unpadded visible gyms are mandatory. Padding may only fill remaining capacity
 * after every visible gym is included (when under the logo cap).
 */
import type {Region} from 'react-native-maps';
import type {MapCenter} from '@/data/mapCentersData';
import {
  queryMapCentersInRegion,
  type MapCenterSpatialIndex,
} from '@/utils/mapCenterSpatialIndex';
import {
  MAP_MAX_LOGO_MARKERS,
  selectMapCentersForLogoMarkers,
} from '@/utils/mapMarkerClustering';

export const MAP_VIEWPORT_PAD = 0.12;

export type SelectVisibleMapMarkersOptions = {
  maxMarkers?: number;
  /** Prefetch pad outside the true viewport — never displaces visible gyms. */
  pad?: number;
  selectedId?: string | null;
  /** Lookup for forcing the selected gym into the result set. */
  centerById?: ReadonlyMap<string, MapCenter>;
};

/**
 * Build the marker candidate list for a settled map region.
 * Geography comes only from `region` — never from user GPS.
 */
export function selectVisibleMapMarkers(
  index: MapCenterSpatialIndex,
  region: Region,
  options: SelectVisibleMapMarkersOptions = {},
): MapCenter[] {
  const maxMarkers = options.maxMarkers ?? MAP_MAX_LOGO_MARKERS;
  const pad = options.pad ?? MAP_VIEWPORT_PAD;

  const visible = queryMapCentersInRegion(index, region, {pad: 0});

  let chosen: MapCenter[];
  if (visible.length >= maxMarkers) {
    chosen = selectMapCentersForLogoMarkers(visible, region, maxMarkers);
  } else {
    const padded = queryMapCentersInRegion(index, region, {pad});
    const visibleIds = new Set(visible.map(c => c.id));
    const extras = padded.filter(c => !visibleIds.has(c.id));
    const fill = selectMapCentersForLogoMarkers(
      extras,
      region,
      maxMarkers - visible.length,
    );
    chosen = visible.length + fill.length <= maxMarkers
      ? [...visible, ...fill]
      : [...visible, ...fill].slice(0, maxMarkers);
  }

  const selectedId = options.selectedId;
  if (selectedId && !chosen.some(c => c.id === selectedId)) {
    const resolved = options.centerById?.get(selectedId);
    if (resolved) {
      chosen = [...chosen, resolved];
    }
  }

  return chosen;
}
