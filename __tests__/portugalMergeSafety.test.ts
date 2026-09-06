/**
 * Portugal production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausiblePortugalCoordinate, PORTUGAL_POSTAL_RE} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center/i;
const LEGACY_BRANDS = [/fitness\s*hut/i, /pump\s*fitness/i, /virgin\s*active/i, /^kalorias$/i];

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Fitness UP': 51,
  VivaGym: 46,
  Element: 46,
  'Fitness Factory': 44,
  Solinca: 19,
  'Solinca Light': 16,
  'Holmes Place': 12,
  'Be-Fit': 10,
  Balance: 2,
  Lemonfit: 1,
};

describe('Portugal merge safety', () => {
  const portugal = ALL_GYM_CENTERS.filter(c => c.country === 'Portugal');
  const reportPath = path.join(__dirname, '../data/portugal/PORTUGAL_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/portugal/PORTUGAL_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/portugal/portugal_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/portugal/PORTUGAL_PHASE2_READY_TO_IMPORT.json');
  const idemPath = path.join(__dirname, '../data/portugal/PORTUGAL_MERGE_IDEMPOTENCY.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; portugal: number};
    staging_reconciliation?: {metadata_drift: string};
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
  }>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
  };

  test('total catalog = 11063; Portugal = 247', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11254);
    expect(portugal.length).toBe(247);
    expect(report.after.total).toBe(10772); // historical Portugal merge snapshot
    expect(report.after.portugal).toBe(247);
    expect(report.inserted).toBe(247);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(247);
    expect(approved.length).toBe(247);
    expect(phase2Ready.length).toBe(247);
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

  test('all Portugal IDs are unique pt_* with valid fields', () => {
    const ids = new Set<string>();
    for (const c of portugal) {
      expect(c.id.startsWith('pt_')).toBe(true);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(PORTUGAL_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausiblePortugalCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(c.lng!).toBeLessThan(0);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
  });

  test('mainland, Madeira, and Azores are all present', () => {
    const madeira = portugal.filter(
      c => c.lat! >= 32.35 && c.lat! <= 33.2 && c.lng! >= -17.35 && c.lng! <= -16.2,
    );
    const azores = portugal.filter(
      c => c.lat! >= 36.85 && c.lat! <= 39.8 && c.lng! >= -31.35 && c.lng! <= -24.9,
    );
    const mainland = portugal.filter(
      c => c.lat! >= 36.9 && c.lat! <= 42.2 && c.lng! >= -9.6 && c.lng! <= -6.15,
    );
    expect(mainland.length).toBeGreaterThan(200);
    expect(madeira.length).toBeGreaterThan(0);
    expect(azores.length).toBeGreaterThan(0);
  });

  test('brand breakdown matches canonical READY', () => {
    const byBrand: Record<string, number> = {};
    for (const c of portugal) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
  });

  test('legacy brands and unresolved staging categories absent from production', () => {
    for (const c of portugal) {
      for (const re of LEGACY_BRANDS) {
        expect(re.test(c.brand)).toBe(false);
        expect(re.test(c.name)).toBe(false);
      }
    }
    const unresolved = staging.filter(s =>
      ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(
        s.import_category,
      ),
    );
    for (const s of unresolved) {
      expect(portugal.find(p => p.id === s.id)).toBeUndefined();
    }
  });

  test('staging MERGED_INTO_CATALOG reconciles with production pt_*', () => {
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    const prod = new Set(portugal.map(p => p.id));
    expect(merged.size).toBe(prod.size);
    for (const id of merged) expect(prod.has(id)).toBe(true);
    for (const id of prod) expect(merged.has(id)).toBe(true);
    expect(report.staging_reconciliation?.metadata_drift || 'NONE').toBe('NONE');
  });

  test('idempotency: second run inserts 0', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.pass).toBe(true);
  });

  test('check-in and auto-checkout radii remain 200', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('lightweight Portugal search sanity', () => {
    const ptGyms = portugal.map(c => ({
      ...c,
      latitude: c.lat!,
      longitude: c.lng!,
    }));
    getGymSearchIndex(ptGyms as never);
    const lisboa = searchGyms('Lisboa', {gyms: ptGyms as never, limit: 20});
    expect(lisboa.length).toBeGreaterThan(0);
    const porto = searchGyms('Porto', {gyms: ptGyms as never, limit: 20});
    expect(porto.length).toBeGreaterThan(0);
    const nearest = findNearestGym(38.7223, -9.1393, ptGyms);
    expect(nearest?.country).toBe('Portugal');
    const visible = filterMapCentersInRegion(
      ptGyms as never,
      {latitude: 38.72, longitude: -9.14, latitudeDelta: 0.5, longitudeDelta: 0.5} as never,
    );
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every(c => c.country === 'Portugal')).toBe(true);
  });
});
