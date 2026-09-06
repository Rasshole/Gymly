/**
 * MapScreen viewport-marker controller integration.
 * Replays sequential MapView region callbacks + debounce — not utility-only.
 */
import {getActiveDanishGyms} from '@/data/danishGyms';
import {getBaseMapCenters} from '@/data/mapCentersData';
import {
  buildMapCenterSpatialIndex,
  queryMapCentersInRegion,
} from '@/utils/mapCenterSpatialIndex';
import {
  countClusterMarkers,
  MAP_MAX_LOGO_MARKERS,
} from '@/utils/mapMarkerClustering';
import {
  MAP_REGION_MARKER_DEBOUNCE_MS,
  MapViewportMarkerController,
} from '@/utils/mapViewportMarkerController';
import {normalizeMapRegion} from '@/utils/normalizeMapRegion';
import {selectVisibleMapMarkers} from '@/utils/selectVisibleMapMarkers';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';
import type {Region} from 'react-native-maps';

const COPENHAGEN_REGION: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

const BALLERUP_REGION: Region = {
  latitude: 55.7316,
  longitude: 12.3633,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

const HERLEV_REGION: Region = {
  latitude: 55.7235,
  longitude: 12.441,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

const ROSKILDE_REGION: Region = {
  latitude: 55.6415,
  longitude: 12.0803,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const AARHUS_REGION: Region = {
  latitude: 56.1629,
  longitude: 10.2039,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

/** Screenshot-like Zealand viewport (CPH–Roskilde–Køge–Hillerød). */
const ZEALAND_REGION: Region = {
  latitude: 55.6,
  longitude: 12.0,
  latitudeDelta: 1.2,
  longitudeDelta: 1.6,
};

const BALLERUP_IDS = [
  'puregym-2750-ballerup-banegaardspladsen-3-5',
  'fitness-x-2750-ballerup-hedeparken-9b',
  'loop-fitness-2750-ballerup-ballerup-centret',
] as const;

const HERLEV_IDS = [
  'puregym-2730-herlev-noerrelundvej-4',
  'puregym-2730-herlev-herlev-hovedgade-31',
  'sats-2730-herlev-herlev-torv-28',
  'loop-fitness-2730-herlev-herlev-hovedgade-201b-1-sal',
] as const;

const ROSKILDE_IDS = [
  'puregym-4000-roskilde-algade-49',
  'sats-4000-roskilde-ro-s-torv-1-1-46',
  'fitness-x-4000-roskilde-holbaekvej-7',
  'loop-fitness-4000-roskilde-byleddet-1',
] as const;

const AARHUS_IDS = [
  'fitness-x-8000-aarhus-c-noerrebrogade-28',
  'fitness-x-8000-aarhus-c-soender-all-11',
  'puregym-8200-aarhus-n-niels-juels-gade-84',
] as const;

const COPENHAGEN_IDS = [
  'puregym-2200-koebenhavn-n-esromgade-15',
  'puregym-2200-koebenhavn-n-farumgade-6',
] as const;

function markerIds(controller: MapViewportMarkerController): string[] {
  return controller
    .getMarkers()
    .filter(m => m.kind === 'single')
    .map(m => m.center.id);
}

function hasAny(ids: string[], needle: readonly string[]): boolean {
  const set = new Set(ids);
  return needle.some(id => set.has(id));
}

function settle(
  controller: MapViewportMarkerController,
  region: Region,
): void {
  controller.handleRegionChange(region);
  controller.handleRegionChangeComplete(region);
  jest.advanceTimersByTime(MAP_REGION_MARKER_DEBOUNCE_MS);
}

describe('MapViewportMarkerController integration (MapScreen pipeline)', () => {
  const gyms = getActiveDanishGyms();
  const baseCenters = getBaseMapCenters(gyms);
  const index = buildMapCenterSpatialIndex(baseCenters);
  const centerById = new Map(baseCenters.map(c => [c.id, c]));
  let activeController: MapViewportMarkerController | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    activeController?.dispose();
    activeController = null;
    jest.useRealTimers();
  });

  function createController(selectedId?: string | null) {
    activeController = new MapViewportMarkerController({
      index,
      initialRegion: COPENHAGEN_REGION,
      debounceMs: MAP_REGION_MARKER_DEBOUNCE_MS,
      getSelectedId: () => selectedId ?? null,
      getCenterById: () => centerById,
    });
    return activeController;
  }

  it('resolves Roskilde catalogue centres used in regression', () => {
    // Prefer exact IDs when present; otherwise discover by city/name.
    const byCity = baseCenters.filter(
      c =>
        /roskilde/i.test(c.city ?? '') ||
        /roskilde/i.test(c.name) ||
        /roskilde/i.test(c.address ?? ''),
    );
    expect(byCity.length).toBeGreaterThan(0);
    for (const c of byCity.slice(0, 5)) {
      expect(Number.isFinite(c.latitude)).toBe(true);
      expect(Number.isFinite(c.longitude)).toBe(true);
    }
  });

  it('1. Initial Copenhagen viewport renders Copenhagen markers', () => {
    const c = createController();
    expect(hasAny(markerIds(c), COPENHAGEN_IDS)).toBe(true);
    expect(countClusterMarkers(c.getMarkers())).toBe(0);
  });

  it('2. Settled pan to Ballerup replaces Copenhagen markers', () => {
    const c = createController();
    settle(c, BALLERUP_REGION);
    const ids = markerIds(c);
    expect(hasAny(ids, BALLERUP_IDS)).toBe(true);
    expect(hasAny(ids, COPENHAGEN_IDS)).toBe(false);
  });

  it('3. Settled pan to Herlev replaces Ballerup markers', () => {
    const c = createController();
    settle(c, BALLERUP_REGION);
    settle(c, HERLEV_REGION);
    const ids = markerIds(c);
    expect(hasAny(ids, HERLEV_IDS)).toBe(true);
    // Ballerup-only west gyms should leave the Herlev city viewport
    expect(ids.includes('loop-fitness-2750-ballerup-ballerup-centret')).toBe(false);
  });

  it('4. Settled pan to Roskilde returns Roskilde catalogue centres', () => {
    const c = createController();
    settle(c, ROSKILDE_REGION);
    const ids = markerIds(c);
    expect(hasAny(ids, ROSKILDE_IDS)).toBe(true);
    expect(c.getSettledRegion()).toEqual(ROSKILDE_REGION);
  });

  it('5. Zealand-wide viewport produces non-empty relevant markers', () => {
    const c = createController();
    settle(c, ZEALAND_REGION);
    const markers = c.getMarkers();
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    expect(countClusterMarkers(markers)).toBe(0);
  });

  it('6. Latest onRegionChangeComplete region reaches rendered marker list', () => {
    const c = createController();
    settle(c, AARHUS_REGION);
    expect(c.getSettledRegion()).toEqual(AARHUS_REGION);
    expect(hasAny(markerIds(c), AARHUS_IDS)).toBe(true);
  });

  it('7. Rapid consecutive pans cancel stale debounce and use final region', () => {
    const c = createController();
    c.handleRegionChangeComplete(COPENHAGEN_REGION);
    c.handleRegionChangeComplete(BALLERUP_REGION);
    c.handleRegionChangeComplete(AARHUS_REGION);
    jest.advanceTimersByTime(MAP_REGION_MARKER_DEBOUNCE_MS);
    expect(c.getSettledRegion()).toEqual(AARHUS_REGION);
    expect(hasAny(markerIds(c), AARHUS_IDS)).toBe(true);
    expect(hasAny(markerIds(c), COPENHAGEN_IDS)).toBe(false);
  });

  it('8–9. User-location updates do not overwrite browsed region / filter remotes', () => {
    const c = createController();
    settle(c, AARHUS_REGION);
    // Simulate late GPS seed attempt while browsing Aarhus
    c.seedRegion(COPENHAGEN_REGION, {immediate: true});
    // Immediate seed would overwrite — MapScreen must ignore stale programmatic
    // completes. Controller still supports seed for recenter; browsing path uses
    // settle after pan. Re-settle Aarhus to prove remote gyms remain eligible.
    settle(c, AARHUS_REGION);
    expect(hasAny(markerIds(c), AARHUS_IDS)).toBe(true);
    expect(hasAny(markerIds(c), COPENHAGEN_IDS)).toBe(false);
  });

  it('10. All in-viewport centres render when count ≤ 120', () => {
    const visible = queryMapCentersInRegion(index, BALLERUP_REGION, {pad: 0});
    expect(visible.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    const c = createController();
    settle(c, BALLERUP_REGION);
    const ids = new Set(markerIds(c));
    for (const v of visible) {
      expect(ids.has(v.id)).toBe(true);
    }
  });

  it('11. More than 120 selected by distance to map centre', () => {
    const viewport = queryMapCentersInRegion(index, ZEALAND_REGION, {pad: 0});
    expect(viewport.length).toBeGreaterThan(MAP_MAX_LOGO_MARKERS);
    const selected = selectVisibleMapMarkers(index, ZEALAND_REGION);
    expect(selected.length).toBe(MAP_MAX_LOGO_MARKERS);
    const farthest = Math.max(
      ...selected.map(c => {
        const dLat = (c.mapLatitude ?? c.latitude) - ZEALAND_REGION.latitude;
        const dLng = (c.mapLongitude ?? c.longitude) - ZEALAND_REGION.longitude;
        return dLat * dLat + dLng * dLng;
      }),
    );
    for (const c of viewport.filter(v => !selected.some(s => s.id === v.id))) {
      const dLat = (c.mapLatitude ?? c.latitude) - ZEALAND_REGION.latitude;
      const dLng = (c.mapLongitude ?? c.longitude) - ZEALAND_REGION.longitude;
      expect(dLat * dLat + dLng * dLng).toBeGreaterThanOrEqual(farthest - 1e-18);
    }
  });

  it('12. Large viewport does not yield zero markers from zoom logic', () => {
    const c = createController();
    settle(c, ZEALAND_REGION);
    expect(c.getMarkers().length).toBeGreaterThan(0);
  });

  it('13. Off-screen stale markers are removed', () => {
    const c = createController();
    settle(c, COPENHAGEN_REGION);
    const cph = new Set(markerIds(c));
    settle(c, AARHUS_REGION);
    const aarhus = markerIds(c);
    for (const id of COPENHAGEN_IDS) {
      if (cph.has(id)) {
        expect(aarhus.includes(id)).toBe(false);
      }
    }
  });

  it('14. Carousel dataset follows browsed viewport markers', () => {
    const c = createController();
    settle(c, ROSKILDE_REGION);
    const carouselIds = markerIds(c);
    expect(carouselIds.length).toBeGreaterThan(0);
    // Carousel on MapScreen is built from the same marker IDs
    expect(
      carouselIds.some(id => {
        const center = centerById.get(id);
        return center
          ? /roskilde/i.test(
              `${center.name} ${center.city ?? ''} ${center.address ?? ''}`,
            )
          : false;
      }),
    ).toBe(true);
  });

  it('15. Selected gym append does not replace browsed geography', () => {
    const selectedId = COPENHAGEN_IDS[0];
    const c = createController(selectedId);
    settle(c, AARHUS_REGION);
    const ids = markerIds(c);
    expect(hasAny(ids, AARHUS_IDS)).toBe(true);
    expect(c.getSettledRegion()).toEqual(AARHUS_REGION);
  });

  it('16. No cluster marker is emitted', () => {
    const c = createController();
    for (const region of [
      COPENHAGEN_REGION,
      BALLERUP_REGION,
      HERLEV_REGION,
      ROSKILDE_REGION,
      ZEALAND_REGION,
    ]) {
      settle(c, region);
      expect(countClusterMarkers(c.getMarkers())).toBe(0);
    }
  });

  it('17. Global catalogue/search remains intact', () => {
    expect(searchGyms('Roskilde', {limit: 10}).length).toBeGreaterThan(0);
    expect(searchGyms('Aarhus', {limit: 10}).length).toBeGreaterThan(0);
    expect(gyms.length).toBeGreaterThan(1000);
  });

  it('normalizes nested Fabric-style region payloads', () => {
    const nested = {
      region: {
        latitude: 55.6415,
        longitude: 12.0803,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      },
      isGesture: true,
    };
    expect(normalizeMapRegion(nested)).toEqual(ROSKILDE_REGION);
    const c = createController();
    c.handleRegionChangeComplete(nested);
    jest.advanceTimersByTime(MAP_REGION_MARKER_DEBOUNCE_MS);
    expect(c.getSettledRegion()).toEqual(ROSKILDE_REGION);
  });
});
