/**
 * Lazy map catalog + spatial index — must not run at app/module startup.
 * Initialized on first Map tab open via getMapRuntime().
 */
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import {
  getBaseMapCenters,
  mapCenterFromGym,
  rememberBaseMapCenters,
  type MapCenter,
} from '@/data/mapCentersData';
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

export function peekMapRuntime(): MapRuntime | null {
  return cached;
}

function finishRuntime(gyms: readonly DanishGym[], baseCenters: MapCenter[]): MapRuntime {
  rememberBaseMapCenters(baseCenters, gyms.length);
  cached = {
    gyms,
    gymById: new Map(gyms.map(gym => [gym.id, gym])),
    baseCenters,
    centerIndex: buildMapCenterSpatialIndex(baseCenters),
  };
  return cached;
}

/** One-time build when the map is first opened — not during global app bootstrap. */
export function getMapRuntime(): MapRuntime {
  if (cached) {
    return cached;
  }
  const gyms = getActiveDanishGyms();
  return finishRuntime(gyms, getBaseMapCenters(gyms));
}

/**
 * Build the catalog in slices so the native map and live-badge fetch can run
 * between chunks. Calls `onReady` with the same singleton as getMapRuntime().
 */
export function buildMapRuntimeInChunks(
  onReady: (runtime: MapRuntime, buildMs: number) => void,
  chunkSize = 700,
): () => void {
  if (cached) {
    onReady(cached, 0);
    return () => {};
  }
  const started = Date.now();
  const gyms = getActiveDanishGyms();
  const centers: MapCenter[] = new Array(gyms.length);
  let cursor = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = () => {
    timer = null;
    if (cancelled) {
      return;
    }
    if (cached) {
      onReady(cached, Date.now() - started);
      return;
    }
    const end = Math.min(cursor + chunkSize, gyms.length);
    for (; cursor < end; cursor++) {
      centers[cursor] = mapCenterFromGym(gyms[cursor]);
    }
    if (cursor < gyms.length) {
      timer = setTimeout(step, 0);
      return;
    }
    onReady(finishRuntime(gyms, centers), Date.now() - started);
  };
  timer = setTimeout(step, 0);
  return () => {
    cancelled = true;
    if (timer != null) {
      clearTimeout(timer);
    }
  };
}

/** Test-only reset — avoids cross-test singleton leakage. */
export function resetMapRuntimeForTests(): void {
  cached = null;
}
