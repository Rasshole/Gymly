/**
 * Switzerland production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {getActiveGymsByCountry} from '../src/data/danishGyms';
import {findGymById} from '../src/utils/gymDisplay';
import {formatGymCountryLabel, gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const CH_POSTAL_RE = /^\d{4}$/;
const CH_BOUNDS = {latMin: 45.82, latMax: 47.81, lngMin: 5.96, lngMax: 10.49};
const MOJIBAKE_RE = /Ã.|�|â€/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center/i;
const LEGACY_BRANDS = ['basefit', 'one training center', 'silhouette wellness', 'only fitness'];

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'ACTIV FITNESS': 130,
  'update Fitness': 88,
  "Let's Go Fitness": 66,
  PureGym: 49,
  'NonStop Gym': 45,
  'well come FIT': 27,
  'clever fit': 23,
  Kieser: 21,
  Fitnesspark: 15,
  Harmony: 11,
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe('Switzerland merge safety', () => {
  const switzerland = ALL_GYM_CENTERS.filter(c => c.country === 'Switzerland');
  const reportPath = path.join(__dirname, '../data/switzerland/SWITZERLAND_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/switzerland/SWITZERLAND_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/switzerland/switzerland_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/switzerland/SWITZERLAND_PHASE2_READY_TO_IMPORT.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {inserted: number; after: {total: number}};
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{id: string; import_category: string}>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;

  test('total catalog = 10525; Switzerland = 475', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11254);
    expect(switzerland.length).toBe(475);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(475);
    expect(approved.length).toBe(475);
  });

  test('existing country counts unchanged', () => {
    const counts: Record<string, number> = {};
    ALL_GYM_CENTERS.forEach(c => {
      counts[c.country] = (counts[c.country] || 0) + 1;
    });
    expect(counts['Denmark']).toBe(354);
    expect(counts['Sweden']).toBe(639);
    expect(counts['Norway']).toBe(535);
    expect(counts['Finland']).toBe(429);
    expect(counts['Germany']).toBe(1424);
    expect(counts['United Kingdom']).toBe(1474);
    expect(counts['Netherlands']).toBe(600);
    expect(counts['France']).toBe(1712);
    expect(counts['Spain']).toBe(976);
    expect(counts['Italy']).toBe(588);
    expect(counts['Belgium']).toBe(363);
    expect(counts['Poland']).toBe(621);
    expect(counts['Austria']).toBe(335);
    expect(counts['Switzerland']).toBe(475);
    expect(counts['Portugal']).toBe(247);
    expect(counts['Greece']).toBe(106);
    expect(counts['Ireland']).toBe(65);
    expect(counts['Czechia']).toBe(70);
      expect(counts['Hungary']).toBe(50);
  });

  test('all Switzerland IDs are unique ch_*', () => {
    const ids = switzerland.map(c => c.id);
    expect(new Set(ids).size).toBe(475);
    expect(ids.every(id => /^ch_[a-f0-9]{10}$/.test(id))).toBe(true);
  });

  test('production brand breakdown matches Phase 2 contract', () => {
    const byBrand: Record<string, number> = {};
    for (const c of switzerland) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    for (const [brand, expected] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(expected);
    }
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(475);
  });

  test('Switzerland rows pass quality gate', () => {
    const prodIds = new Set(ALL_GYM_CENTERS.map(c => c.id));
    for (const c of switzerland) {
      expect(c.country).toBe('Switzerland');
      expect(c.is_active).toBe(true);
      expect(String(c.name || '').trim().length).toBeGreaterThan(0);
      expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(c.address || '').trim().length).toBeGreaterThan(0);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof c.postal_code).toBe('string');
      expect(CH_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(c.postal_code.startsWith('948') || c.postal_code.startsWith('949')).toBe(false);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(c.lat).not.toBe(0);
      expect(c.lng).not.toBe(0);
      expect(c.lat! >= CH_BOUNDS.latMin && c.lat! <= CH_BOUNDS.latMax).toBe(true);
      expect(c.lng! >= CH_BOUNDS.lngMin && c.lng! <= CH_BOUNDS.lngMax).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(false);
      expect(LEGACY_BRANDS.includes(String(c.brand).toLowerCase())).toBe(false);
    }
    expect(prodIds.size).toBe(ALL_GYM_CENTERS.length);
  });

  test('no Liechtenstein cities in production', () => {
    const li = ['vaduz', 'schaan', 'triesen', 'balzers', 'eschen', 'mauren'];
    for (const c of switzerland) {
      const city = (c.city || '').toLowerCase();
      expect(li.some(x => city.includes(x))).toBe(false);
    }
  });

  test('coming-soon and needs-coordinate rows not merged', () => {
    const mergedIds = new Set(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id));
    const excluded = staging.filter(s =>
      ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON'].includes(s.import_category),
    );
    for (const row of excluded) {
      expect(mergedIds.has(row.id)).toBe(false);
    }
    expect(mergedIds.size).toBe(475);
    expect(phase2Ready.every(r => mergedIds.has(r.id))).toBe(true);
  });

  test('approved file matches inserted count', () => {
    expect(approved.length).toBe(475);
  });

  test('structural smoke — findGymById, country label, search index', () => {
    const sample = switzerland[0]!;
    expect(findGymById(sample.id)).toBeDefined();
    const t = createTranslator(en);
    expect(formatGymCountryLabel(sample.country, t)).toBeTruthy();
    expect(gymCountryTranslationKey(sample.country)).toBe('countries.switzerland');
    const chActive = getActiveGymsByCountry('Switzerland');
    expect(chActive.length).toBe(475);
    const idx = getGymSearchIndex(chActive);
    expect(idx.length).toBe(475);
    const hits = searchGyms('NonStop', {gyms: chActive, limit: 10});
    expect(hits.length).toBeGreaterThan(0);
    const withCoords = chActive.filter(g => getEffectiveLatLng(g) != null);
    expect(withCoords.length).toBe(475);
    const origin = withCoords[0]!;
    const nearest = findNearestGym(origin.latitude, origin.longitude, chActive);
    expect(nearest).toBeDefined();
  });

  test('check-in config unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('retained same-brand proximity cluster has different addresses', () => {
    const aarau = switzerland.find(c => c.id === 'ch_53e82ae848');
    const kuss = switzerland.find(c => c.id === 'ch_2d35aeb0dd');
    expect(aarau).toBeDefined();
    expect(kuss).toBeDefined();
    expect(aarau!.lat).not.toBeCloseTo(kuss!.lat!, 4);
    expect(kuss!.lat).toBeCloseTo(47.109262, 5);
    expect(kuss!.lng).toBeCloseTo(8.4499984, 5);
  });
});
