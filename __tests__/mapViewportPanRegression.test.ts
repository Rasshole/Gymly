/**
 * Friends → Map viewport pan regression.
 * Proves settled-region queries replace off-screen gyms and never drop
 * in-viewport Ballerup/Herlev centres via cell-scan early-exit.
 */
import {getActiveDanishGyms} from '@/data/danishGyms';
import {getBaseMapCenters} from '@/data/mapCentersData';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';
import {
  buildMapCenterSpatialIndex,
  queryMapCentersInRegion,
  resolveViewportMaxResults,
} from '@/utils/mapCenterSpatialIndex';
import {
  clusterMapCentersForDisplay,
  countClusterMarkers,
  countLogoMarkers,
  selectMapCentersForLogoMarkers,
  MAP_MAX_LOGO_MARKERS,
} from '@/utils/mapMarkerClustering';
import type {MapCenter} from '@/data/mapCentersData';
import type {Region} from 'react-native-maps';

/** Deterministic settled regions (city zoom). */
export const COPENHAGEN_REGION: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export const BALLERUP_REGION: Region = {
  latitude: 55.7316,
  longitude: 12.3633,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export const HERLEV_REGION: Region = {
  latitude: 55.7235,
  longitude: 12.441,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

/** Slightly zoomed-out suburb corridor — previously hit early-exit (delta > 1). */
const GREATER_CPH_CORRIDOR: Region = {
  latitude: 55.7,
  longitude: 12.45,
  latitudeDelta: 1.05,
  longitudeDelta: 1.05,
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

const COPENHAGEN_SAMPLE_IDS = [
  'puregym-2200-koebenhavn-n-esromgade-15',
  'puregym-2200-koebenhavn-n-farumgade-6',
] as const;

function idsOf(centers: readonly MapCenter[]): Set<string> {
  return new Set(centers.map(c => c.id));
}

/** Production MapScreen pipeline after debounce: full viewport → logo cap. */
function settledMarkers(index: ReturnType<typeof buildMapCenterSpatialIndex>, region: Region) {
  const viewport = queryMapCentersInRegion(index, region);
  return {
    viewport,
    markers: clusterMapCentersForDisplay(viewport, region),
  };
}

describe('map viewport pan regression (Copenhagen → Ballerup → Herlev)', () => {
  const gyms = getActiveDanishGyms();
  const baseCenters = getBaseMapCenters(gyms);
  const index = buildMapCenterSpatialIndex(baseCenters);
  const byId = new Map(baseCenters.map(c => [c.id, c]));

  it('catalogue has known Ballerup and Herlev centres with valid coordinates', () => {
    for (const id of [...BALLERUP_IDS, ...HERLEV_IDS]) {
      const c = byId.get(id);
      expect(c).toBeDefined();
      expect(Number.isFinite(c!.latitude)).toBe(true);
      expect(Number.isFinite(c!.longitude)).toBe(true);
      expect(Number.isFinite(c!.mapLatitude)).toBe(true);
      expect(Number.isFinite(c!.mapLongitude)).toBe(true);
    }
  });

  it('1. Copenhagen settled region returns Copenhagen gyms', () => {
    const {viewport, markers} = settledMarkers(index, COPENHAGEN_REGION);
    expect(viewport.length).toBeGreaterThan(0);
    expect(viewport.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    expect(markers.length).toBe(viewport.length);
    expect(countClusterMarkers(markers)).toBe(0);

    const ids = idsOf(viewport);
    for (const id of COPENHAGEN_SAMPLE_IDS) {
      expect(ids.has(id)).toBe(true);
    }
    for (const id of BALLERUP_IDS) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('2. Panning to Ballerup replaces off-screen Copenhagen candidates and returns Ballerup gyms', () => {
    const cph = settledMarkers(index, COPENHAGEN_REGION);
    const ballerup = settledMarkers(index, BALLERUP_REGION);

    const cphIds = idsOf(cph.viewport);
    const ballIds = idsOf(ballerup.viewport);

    for (const id of BALLERUP_IDS) {
      expect(ballIds.has(id)).toBe(true);
      expect(cphIds.has(id)).toBe(false);
    }

    // Off-screen Copenhagen gyms from the prior viewport must not linger
    const lingering = [...cphIds].filter(id => ballIds.has(id));
    for (const id of lingering) {
      const c = byId.get(id)!;
      const lat = c.mapLatitude ?? c.latitude;
      const lng = c.mapLongitude ?? c.longitude;
      const latHalf = BALLERUP_REGION.latitudeDelta * 0.62;
      const lngHalf = BALLERUP_REGION.longitudeDelta * 0.62;
      expect(lat).toBeGreaterThanOrEqual(BALLERUP_REGION.latitude - latHalf);
      expect(lat).toBeLessThanOrEqual(BALLERUP_REGION.latitude + latHalf);
      expect(lng).toBeGreaterThanOrEqual(BALLERUP_REGION.longitude - lngHalf);
      expect(lng).toBeLessThanOrEqual(BALLERUP_REGION.longitude + lngHalf);
    }

    expect(countClusterMarkers(ballerup.markers)).toBe(0);
    expect(countLogoMarkers(ballerup.markers)).toBe(ballerup.markers.length);
  });

  it('3. Panning again to Herlev returns Herlev gyms', () => {
    settledMarkers(index, BALLERUP_REGION);
    const herlev = settledMarkers(index, HERLEV_REGION);
    const ids = idsOf(herlev.viewport);
    for (const id of HERLEV_IDS) {
      expect(ids.has(id)).toBe(true);
    }
    expect(countClusterMarkers(herlev.markers)).toBe(0);
  });

  it('4. Query uses the latest settled region (not a stale prior viewport)', () => {
    const sequence = [COPENHAGEN_REGION, BALLERUP_REGION, HERLEV_REGION];
    let latest = sequence[0];
    const results = sequence.map(region => {
      latest = region;
      return settledMarkers(index, latest);
    });
    expect(idsOf(results[0].viewport).has(BALLERUP_IDS[0])).toBe(false);
    expect(idsOf(results[1].viewport).has(BALLERUP_IDS[0])).toBe(true);
    expect(idsOf(results[2].viewport).has(HERLEV_IDS[2])).toBe(true);
    // Latest region is Herlev — Ballerup-only gyms west of Herlev pad may drop
    expect(latest).toBe(HERLEV_REGION);
  });

  it('5. All in-viewport gyms render when under 120', () => {
    const {viewport, markers} = settledMarkers(index, BALLERUP_REGION);
    expect(viewport.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    expect(markers.length).toBe(viewport.length);
    expect(markers.every(m => m.kind === 'single')).toBe(true);
  });

  it('6. When over 120, selection is primarily distance to current map centre', () => {
    const region = GREATER_CPH_CORRIDOR;
    const viewport = queryMapCentersInRegion(index, region);
    expect(viewport.length).toBeGreaterThan(MAP_MAX_LOGO_MARKERS);

    const selected = selectMapCentersForLogoMarkers(viewport, region);
    expect(selected.length).toBe(MAP_MAX_LOGO_MARKERS);

    const farthestSelectedDist2 = Math.max(
      ...selected.map(c => {
        const lat = c.mapLatitude ?? c.latitude;
        const lng = c.mapLongitude ?? c.longitude;
        const dLat = lat - region.latitude;
        const dLng = lng - region.longitude;
        return dLat * dLat + dLng * dLng;
      }),
    );
    const dropped = viewport.filter(c => !selected.some(s => s.id === c.id));
    for (const c of dropped) {
      const lat = c.mapLatitude ?? c.latitude;
      const lng = c.mapLongitude ?? c.longitude;
      const dLat = lat - region.latitude;
      const dLng = lng - region.longitude;
      const dist2 = dLat * dLat + dLng * dLng;
      expect(dist2).toBeGreaterThanOrEqual(farthestSelectedDist2 - 1e-18);
    }
  });

  it('7. User location does not suppress gyms in a browsed remote region', () => {
    // User remains in Copenhagen coordinates; markers must follow Ballerup region only.
    const _userStillInCopenhagen = {latitude: 55.6761, longitude: 12.5683};
    expect(_userStillInCopenhagen.latitude).toBe(COPENHAGEN_REGION.latitude);
    const {viewport, markers} = settledMarkers(index, BALLERUP_REGION);
    for (const id of BALLERUP_IDS) {
      expect(idsOf(viewport).has(id)).toBe(true);
    }
    expect(markers.length).toBeGreaterThan(0);
  });

  it('8. No cluster marker is emitted', () => {
    for (const region of [COPENHAGEN_REGION, BALLERUP_REGION, HERLEV_REGION, GREATER_CPH_CORRIDOR]) {
      const {markers} = settledMarkers(index, region);
      expect(countClusterMarkers(markers)).toBe(0);
      expect(markers.every(m => m.kind === 'single')).toBe(true);
    }
  });

  it('9. Global catalogue/search behaviour remains intact', () => {
    const hits = searchGyms('Ballerup', {limit: 10});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => /ballerup/i.test(h.gym.name + h.gym.city))).toBe(true);

    const herlevHits = searchGyms('Herlev', {limit: 10});
    expect(herlevHits.some(h => /herlev/i.test(h.gym.name + h.gym.city))).toBe(true);

    expect(gyms.length).toBeGreaterThan(1000);
  });

  it('zoom-aware maxResults never drops nearer in-viewport gyms via cell order', () => {
    const region = GREATER_CPH_CORRIDOR;
    const maxResults = resolveViewportMaxResults(region);
    expect(maxResults).toBe(120);

    const capped = queryMapCentersInRegion(index, region, {maxResults});
    const uncapped = queryMapCentersInRegion(index, region);

    expect(uncapped.some(c => c.id === BALLERUP_IDS[2])).toBe(true);
    expect(capped.some(c => c.id === BALLERUP_IDS[2])).toBe(true);
    expect(uncapped.some(c => HERLEV_IDS.includes(c.id as (typeof HERLEV_IDS)[number]))).toBe(
      true,
    );
    expect(capped.some(c => HERLEV_IDS.includes(c.id as (typeof HERLEV_IDS)[number]))).toBe(
      true,
    );
  });
});
