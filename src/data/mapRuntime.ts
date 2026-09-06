/**
 * Lazy map catalog + spatial index — must not run at app/module startup.
 * Initialized on first Map tab open via getMapRuntime().
 */
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import {getBaseMapCenters, type MapCenter} from '@/data/mapCentersData';
import {
  buildMapCenterSpatialIndex,
  type MapCenterSpatialIndex,
} from '@/utils/mapCenterSpatialIndex';

export type MapRuntime = {
  gyms: readonly DanishGym[];
  gymById: ReadonlyMap<string, DanishGym>;
  baseCenters: readonly MapCenter[];
  centerIndex: MapCenterSpatialIndex;
};

let cached: MapRuntime | null = null;

/** One-time build when the map is first opened — not during global app bootstrap. */
export function getMapRuntime(): MapRuntime {
  if (cached) {
    return cached;
  }
  const gyms = getActiveDanishGyms();
  const baseCenters = getBaseMapCenters(gyms);
  cached = {
    gyms,
    gymById: new Map(gyms.map(gym => [gym.id, gym])),
    baseCenters,
    centerIndex: buildMapCenterSpatialIndex(baseCenters),
  };
  return cached;
}

/** Test-only reset — avoids cross-test singleton leakage. */
export function resetMapRuntimeForTests(): void {
  cached = null;
}
