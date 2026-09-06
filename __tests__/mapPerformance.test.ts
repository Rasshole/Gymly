import {getActiveGyms} from '@/data/gymCatalog';
import {getBaseMapCenters} from '@/data/mapCentersData';
import {
  buildMapCenterSpatialIndex,
  queryMapCentersInRegion,
  resolveViewportMaxResults,
} from '@/utils/mapCenterSpatialIndex';
import {
  clusterMapCentersForDisplay,
  countClusterMarkers,
  countLogoMarkers,
  MAP_MAX_LOGO_MARKERS,
} from '@/utils/mapMarkerClustering';
import type {MapCenter} from '@/data/mapCentersData';

/** Approximate viewport from screenshot: Northern/Central Europe. */
const EUROPE_SCREENSHOT_REGION = {
  latitude: 54.5,
  longitude: 10,
  latitudeDelta: 22,
  longitudeDelta: 28,
};

function center(id: string, lat: number, lng: number): MapCenter {
  return {
    id,
    name: id,
    latitude: lat,
    longitude: lng,
    mapLatitude: lat,
    mapLongitude: lng,
    logoUrl: null,
    friendsActiveCount: 0,
    totalActiveCount: 0,
    hasExplicitGeocode: true,
  };
}

describe('mapCenterSpatialIndex', () => {
  const copenhagen = center('dk', 55.68, 12.57);
  const stockholm = center('se', 59.33, 18.07);
  const berlin = center('de', 52.52, 13.41);
  const index = buildMapCenterSpatialIndex([copenhagen, stockholm, berlin]);

  it('returns only viewport gyms — not full catalog scan semantics', () => {
    const visible = queryMapCentersInRegion(index, {
      latitude: 59.33,
      longitude: 18.07,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    });
    expect(visible.map(c => c.id)).toContain('se');
    expect(visible.map(c => c.id)).not.toContain('dk');
  });

  it('respects maxResults cap', () => {
    const many = Array.from({length: 400}, (_, i) =>
      center(`g${i}`, 55.67 + (i % 20) * 0.001, 12.56 + Math.floor(i / 20) * 0.001),
    );
    const bigIndex = buildMapCenterSpatialIndex(many);
    const visible = queryMapCentersInRegion(
      bigIndex,
      {latitude: 55.68, longitude: 12.57, latitudeDelta: 0.15, longitudeDelta: 0.15},
      {maxResults: 50},
    );
    expect(visible.length).toBeLessThanOrEqual(50);
  });

  it('lowers raw candidate cap at continent zoom', () => {
    expect(resolveViewportMaxResults(EUROPE_SCREENSHOT_REGION)).toBe(60);
  });
});

describe('map logo markers (no clustering)', () => {
  const gyms = Array.from({length: 120}, (_, i) =>
    center(`g${i}`, 52.5 + (i % 12) * 0.01, 13.4 + Math.floor(i / 12) * 0.01),
  );

  it('keeps individual logos at country zoom — no purple count bubbles', () => {
    const markers = clusterMapCentersForDisplay(gyms, {
      latitude: 52.52,
      longitude: 13.41,
      latitudeDelta: 2,
      longitudeDelta: 2,
    });
    expect(markers.every(m => m.kind === 'single')).toBe(true);
    expect(countClusterMarkers(markers)).toBe(0);
    expect(countLogoMarkers(markers)).toBe(markers.length);
    expect(markers.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
  });

  it('shows individuals at street zoom', () => {
    const subset = gyms.slice(0, 20);
    const markers = clusterMapCentersForDisplay(subset, {
      latitude: 52.52,
      longitude: 13.41,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    });
    expect(markers.every(m => m.kind === 'single')).toBe(true);
  });
});

describe('screenshot scenario — Europe zoom without clusters', () => {
  const activeGyms = getActiveGyms();
  const baseCenters = getBaseMapCenters(activeGyms);
  const index = buildMapCenterSpatialIndex(baseCenters);

  it('Europe viewport uses capped individual logos — never clusters', () => {
    const maxResults = resolveViewportMaxResults(EUROPE_SCREENSHOT_REGION);
    const viewport = queryMapCentersInRegion(index, EUROPE_SCREENSHOT_REGION, {
      maxResults,
    });
    const display = clusterMapCentersForDisplay(viewport, EUROPE_SCREENSHOT_REGION);

    expect(maxResults).toBeLessThanOrEqual(60);
    expect(display.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    expect(countClusterMarkers(display)).toBe(0);
    expect(countLogoMarkers(display)).toBe(display.length);
  });

  it('dense Denmark viewport shows individual logos under the cap', () => {
    const denmarkRegion = {
      latitude: 56,
      longitude: 10.5,
      latitudeDelta: 4,
      longitudeDelta: 5,
    };
    const viewport = queryMapCentersInRegion(index, denmarkRegion, {
      maxResults: resolveViewportMaxResults(denmarkRegion),
    });
    const display = clusterMapCentersForDisplay(viewport, denmarkRegion);
    expect(display.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    expect(countClusterMarkers(display)).toBe(0);
    expect(countLogoMarkers(display)).toBe(display.length);
  });
});
