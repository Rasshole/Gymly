/**
 * Map logo markers — no numbered clusters; viewport selection + cap.
 */
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
import {SHOP_SUPPLEMENTS_ICON, getShopCategoryIcon} from '@/shop/catalog/shopCategories';

function center(id: string, lat: number, lng: number, activity = 0): MapCenter {
  return {
    id,
    name: id,
    latitude: lat,
    longitude: lng,
    mapLatitude: lat,
    mapLongitude: lng,
    logoUrl: null,
    friendsActiveCount: 0,
    totalActiveCount: activity,
    hasExplicitGeocode: true,
  };
}

const COPENHAGEN_CITY = {
  latitude: 55.68,
  longitude: 12.57,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

describe('Shop supplements icon', () => {
  it('uses the supplement jar icon — not a lab flask', () => {
    expect(getShopCategoryIcon('supplements')).toBe(SHOP_SUPPLEMENTS_ICON);
    expect(getShopCategoryIcon('supplements')).not.toBe('flask-outline');
    expect(getShopCategoryIcon('supplements')).not.toBe('beaker-outline');
  });
});

describe('map logo markers without clustering', () => {
  it('never returns numbered cluster markers', () => {
    const gyms = Array.from({length: 120}, (_, i) =>
      center(`g${i}`, 55.67 + (i % 12) * 0.008, 12.55 + Math.floor(i / 12) * 0.008),
    );
    const markers = clusterMapCentersForDisplay(gyms, COPENHAGEN_CITY);
    expect(countClusterMarkers(markers)).toBe(0);
    expect(markers.every(m => m.kind === 'single')).toBe(true);
    expect(countLogoMarkers(markers)).toBe(markers.length);
  });

  it('caps logo markers by distance to map centre; activity is tie-breaker only', () => {
    const gyms = [
      center('near-quiet', 55.68, 12.57, 0),
      center('far-busy', 55.72, 12.62, 50),
      ...Array.from({length: 40}, (_, i) =>
        center(
          `mid${i}`,
          55.69 + (i % 10) * 0.002,
          12.58 + Math.floor(i / 10) * 0.002,
          10,
        ),
      ),
    ];
    const selected = selectMapCentersForLogoMarkers(gyms, COPENHAGEN_CITY, 20);
    expect(selected.length).toBe(20);
    expect(selected[0]?.id).toBe('near-quiet');
    expect(selected.map(c => c.id)).not.toContain('far-busy');
  });

  it('when distances tie, higher activity wins', () => {
    const region = {
      latitude: 55.68,
      longitude: 12.57,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
    const gyms = [
      center('a', 55.68, 12.57, 1),
      center('b', 55.68, 12.57, 40),
    ];
    const selected = selectMapCentersForLogoMarkers(gyms, region, 1);
    expect(selected[0]?.id).toBe('b');
  });

  it('dense Copenhagen viewport uses logos only — no cluster bubbles', () => {
    const dense = Array.from({length: 200}, (_, i) =>
      center(`cph${i}`, 55.66 + (i % 15) * 0.003, 12.54 + Math.floor(i / 15) * 0.003),
    );
    const index = buildMapCenterSpatialIndex(dense);
    const maxResults = resolveViewportMaxResults(COPENHAGEN_CITY);
    const viewport = queryMapCentersInRegion(index, COPENHAGEN_CITY, {maxResults});
    const display = clusterMapCentersForDisplay(viewport, COPENHAGEN_CITY);

    expect(maxResults).toBeLessThanOrEqual(160);
    expect(display.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
    expect(countClusterMarkers(display)).toBe(0);
    expect(countLogoMarkers(display)).toBe(display.length);
    expect(display.length).toBeGreaterThan(0);
  });

  it('continent zoom still returns individuals (capped), never clusters', () => {
    const europe = {
      latitude: 54.5,
      longitude: 10,
      latitudeDelta: 22,
      longitudeDelta: 28,
    };
    expect(resolveViewportMaxResults(europe)).toBe(60);
    const gyms = Array.from({length: 200}, (_, i) =>
      center(`e${i}`, 45 + (i % 20), 5 + Math.floor(i / 20)),
    );
    const display = clusterMapCentersForDisplay(gyms, europe);
    expect(countClusterMarkers(display)).toBe(0);
    expect(display.length).toBeLessThanOrEqual(MAP_MAX_LOGO_MARKERS);
  });
});
