/**
 * Global gym visibility regression — ensures multi-country catalog surfaces internationally.
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import {
  ALL_GYM_CENTERS,
  getActiveCenters,
} from '../src/data/centerRegistry';
import {
  getActiveGyms,
  getActiveDanishGyms,
} from '../src/data/gymCatalog';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getBaseMapCenters} from '../src/data/mapCentersData';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {pickBrowseGyms} from '../src/utils/pickBrowseGyms';
import {rankNearbyCentres} from '../src/utils/nearbyCentersRanking';
import {findNearestGym} from '../src/utils/nearestGym';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';

const FROZEN_SHA =
  '968a997d91daf6424da847f0cb7144c148b42a47bd19f2715c3e52ae4b24d020';
const FROZEN_BYTES = 4014884;
const EXPECTED_TOTAL = 12850;
const EXPECTED_ACTIVE = 12846;
const EXPECTED_RUSSIA = 465;

const GLOBAL_SEARCH_QUERIES = [
  'Stockholm',
  'Oslo',
  'Helsinki',
  'Berlin',
  'London',
  'Paris',
  'Madrid',
  'Rome',
  'Warsaw',
  'Istanbul',
  'Kyiv',
  'Moscow',
  'Москва',
];

const VIEWPORT_PROBES: Array<{label: string; lat: number; lng: number; country: string}> = [
  {label: 'Copenhagen', lat: 55.67, lng: 12.57, country: 'Denmark'},
  {label: 'Stockholm', lat: 59.33, lng: 18.07, country: 'Sweden'},
  {label: 'Berlin', lat: 52.52, lng: 13.41, country: 'Germany'},
  {label: 'Moscow', lat: 55.76, lng: 37.62, country: 'Russia'},
];

function countrySet(gyms: ReadonlyArray<{country: string}>): Set<string> {
  return new Set(gyms.map(g => g.country));
}

describe('globalGymVisibility', () => {
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;
  const activeGyms = getActiveGyms();
  const legacyAlias = getActiveDanishGyms();

  test('production catalog baseline unchanged', () => {
    expect(sha).toBe(FROZEN_SHA);
    expect(bytes).toBe(FROZEN_BYTES);
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(getActiveCenters().length).toBe(EXPECTED_ACTIVE);
    expect(activeGyms.length).toBe(EXPECTED_ACTIVE);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Russia').length).toBe(EXPECTED_RUSSIA);
    expect(countrySet(ALL_GYM_CENTERS).size).toBe(49);
  });

  test('canonical global active source includes international centers', () => {
    const countries = countrySet(activeGyms);
    for (const c of [
      'Denmark',
      'Sweden',
      'Norway',
      'Finland',
      'Germany',
      'United Kingdom',
      'France',
      'Spain',
      'Italy',
      'Poland',
      'Turkey',
      'Ukraine',
      'Russia',
    ]) {
      expect(countries.has(c)).toBe(true);
    }
    expect(legacyAlias).toBe(activeGyms);
  });

  test('catalog array order is Denmark-first (must not slice for browse lists)', () => {
    const first200 = activeGyms.slice(0, 200);
    expect(first200.every(g => g.country === 'Denmark')).toBe(true);
  });

  test('global search resolves international cities', () => {
    getGymSearchIndex(activeGyms);
    for (const q of GLOBAL_SEARCH_QUERIES) {
      const hits = searchGyms(q, {gyms: activeGyms, limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    }
    const moscow = searchGyms('Moscow', {gyms: activeGyms, limit: 5});
    expect(moscow.some(h => h.gym.country === 'Russia')).toBe(true);
    const cyrillic = searchGyms('Москва', {gyms: activeGyms, limit: 5});
    expect(cyrillic.some(h => h.gym.country === 'Russia')).toBe(true);
  });

  test('pickBrowseGyms uses distance ranking — not catalog-order Denmark slice', () => {
    const berlinBrowse = pickBrowseGyms({
      gyms: activeGyms,
      userLocation: {latitude: 52.52, longitude: 13.41},
      cap: 30,
    });
    expect(berlinBrowse.length).toBeGreaterThan(0);
    expect(berlinBrowse.some(g => g.country === 'Germany')).toBe(true);
    expect(berlinBrowse.every(g => g.country === 'Denmark')).toBe(false);

    const moscowBrowse = pickBrowseGyms({
      gyms: activeGyms,
      userLocation: {latitude: 55.76, longitude: 37.62},
      cap: 30,
    });
    expect(moscowBrowse.some(g => g.country === 'Russia')).toBe(true);
  });

  test('rankNearbyCentres does not hard-exclude distant international gyms when capped', () => {
    const ranked = rankNearbyCentres({
      gyms: activeGyms,
      excludeIds: new Set(),
      userLocation: {latitude: 55.6761, longitude: 12.5683},
      getGymStatus: () => ({isOpen: true}),
      liveByGymId: new Map(),
      getActiveUsersCount: () => 0,
      calculateDistanceMeters: (a, b, c, d) => {
        const R = 6371e3;
        const φ1 = (a * Math.PI) / 180;
        const φ2 = (c * Math.PI) / 180;
        const Δφ = ((c - a) * Math.PI) / 180;
        const Δλ = ((d - b) * Math.PI) / 180;
        const x =
          Math.sin(Δφ / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
      },
      cap: 500,
    });
    const countries = countrySet(ranked);
    expect(countries.has('Denmark')).toBe(true);
    expect(countries.has('Sweden')).toBe(true);
  });

  test('map uses global source with viewport culling per country', () => {
    const mapCenters = getBaseMapCenters(activeGyms);
    expect(mapCenters.length).toBe(EXPECTED_ACTIVE);

    for (const probe of VIEWPORT_PROBES) {
      const visible = filterMapCentersInRegion(mapCenters, {
        latitude: probe.lat,
        longitude: probe.lng,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.some(c => {
        const gym = activeGyms.find(g => g.id === c.id);
        return gym?.country === probe.country;
      })).toBe(true);
    }
  });

  test('check-in nearby resolves foreign centers at foreign coordinates', () => {
    const nearestBerlin = findNearestGym(52.52, 13.41, activeGyms);
    expect(nearestBerlin?.country).toBe('Germany');
    const nearestMoscow = findNearestGym(55.76, 37.62, activeGyms);
    expect(nearestMoscow?.country).toBe('Russia');
  });

  test('display lookup works for international production IDs', () => {
    const samples = [
      activeGyms.find(g => g.country === 'Russia'),
      activeGyms.find(g => g.country === 'Germany'),
      activeGyms.find(g => g.country === 'United Kingdom'),
      activeGyms.find(g => g.country === 'Georgia'),
      activeGyms.find(g => g.country === 'Armenia'),
      activeGyms.find(g => g.country === 'Azerbaijan'),
    ].filter(Boolean);
    expect(samples.length).toBeGreaterThan(0);
    for (const gym of samples) {
      const resolved = resolveGymOrStub(gym!.id);
      expect(resolved.id).toBe(gym!.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(/^[a-z]{2}_/.test(resolved.name)).toBe(false);
    }
  });

  test('every represented country has at least one active gym in global source', () => {
    const activeCountries = countrySet(activeGyms);
    const catalogCountries = countrySet(ALL_GYM_CENTERS);
    const missing: string[] = [];
    for (const country of catalogCountries) {
      const hasActive = ALL_GYM_CENTERS.some(
        c => c.country === country && c.is_active && !c.is_coming_soon,
      );
      if (hasActive && !activeCountries.has(country)) {
        missing.push(country);
      }
    }
    expect(missing).toEqual([]);
  });

  test('search index covers global active catalog', () => {
    const index = getGymSearchIndex(activeGyms);
    expect(index.length).toBe(EXPECTED_ACTIVE);
    expect(countrySet(index.map(e => e.gym)).size).toBeGreaterThanOrEqual(40);
  });

  test('UI surface data paths use global catalog (not Denmark-only subset)', () => {
    const catalog = getActiveGyms();

    // Onboarding / register picker source
    expect(catalog.length).toBe(EXPECTED_ACTIVE);

    // Friends → Map: global active gyms + viewport culling
    const mapCenters = getBaseMapCenters(catalog);
    expect(mapCenters.length).toBe(EXPECTED_ACTIVE);
    const stockholmMarkers = filterMapCentersInRegion(mapCenters, {
      latitude: 59.33,
      longitude: 18.07,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    });
    expect(
      stockholmMarkers.some(c => catalog.find(g => g.id === c.id)?.country === 'Sweden'),
    ).toBe(true);

    // Friends → Gyms: search + nearby ranking (not raw catalog slice)
    expect(searchGyms('London', {gyms: catalog, limit: 5}).length).toBeGreaterThan(0);
    expect(
      rankNearbyCentres({
        gyms: catalog,
        excludeIds: new Set(),
        userLocation: {latitude: 52.52, longitude: 13.41},
        getGymStatus: () => ({isOpen: true}),
        liveByGymId: new Map(),
        getActiveUsersCount: () => 0,
        calculateDistanceMeters: (a, b, c, d) => {
          const R = 6371e3;
          const φ1 = (a * Math.PI) / 180;
          const φ2 = (c * Math.PI) / 180;
          const Δφ = ((c - a) * Math.PI) / 180;
          const Δλ = ((d - b) * Math.PI) / 180;
          const x =
            Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
        },
        cap: 50,
      }).some(g => g.country === 'Germany'),
    ).toBe(true);

    // Check-in browse + profile picker browse
    expect(
      pickBrowseGyms({
        gyms: catalog,
        userLocation: {latitude: 55.76, longitude: 37.62},
        cap: 20,
      }).some(g => g.country === 'Russia'),
    ).toBe(true);
  });

  test('check-in boundary remains 199/200 allow, 201 block', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(201 > CHECK_IN_RADIUS_METERS).toBe(true);
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
  });
});
