/**
 * Ukraine Deep Phase 1 staging — discovery + staging only (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleUkraineCoordinate,
  UKRAINE_POSTAL_RE,
  isUkraineCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11929;
const LIVE_PRODUCTION_SHA256 =
  '286729e8a8228863be19cf9f88108f4ebf91d2f9974c04145900622e444fed83';
const FOREIGN = /\b(warsaw|sofia|poland|romania|moldova|russia|belarus)\b/i;

const CONFLICT_CITIES = new Set([
  'Donetsk',
  'Luhansk',
  'Crimea',
  'Sevastopol',
  'Kherson',
  'Zaporizhzhia',
  'Mariupol',
]);

type Row = {
  id: string;
  brand: string;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  import_category: string;
  coord_source?: string | null;
  conflict_area?: boolean;
  discovery_class?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Kyiv',
    address: partial.address ?? 'Khreshchatyk St, 1',
    postalCode: partial.postalCode ?? '01001',
    country: 'Ukraine',
    region: 'Ukraine',
    latitude: partial.latitude ?? 50.4501,
    longitude: partial.longitude ?? 30.5234,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Khreshchatyk St, 1',
      postal_code: partial.postalCode ?? '01001',
      city: partial.city ?? 'Kyiv',
      country: 'Ukraine',
      lat: partial.latitude ?? 50.4501,
      lng: partial.longitude ?? 30.5234,
      is_active: true,
    },
  };
}

describe('Ukraine Deep Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/ukraine');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ukraine_centers_staging.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE1_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      final_class_a_chain_count: number;
      final_class_a_ready_count: number;
      chain_estate_gaps: number;
    };
  };
  const postcodeModel = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_POSTCODE_MODEL.json'), 'utf8'),
  ) as {regex: string};
  const shaBefore = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 11929 / Ukraine 0 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Ukraine').length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(0);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_malta).toBe(24);
    expect(report.baseline_ukraine).toBe(0);
    expect(report.existing_ukraine_production).toBe(false);
    expect(existingSnap.length).toBe(0);
  });

  test('prior-country counts unchanged (Malta 24)', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(24);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
  });

  test('staging inventory — meaningful READY scale from Sport Life + Apollo', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(ready.length).toBeGreaterThanOrEqual(90);
    expect(sc.READY_TO_IMPORT).toBe(ready.length);
    expect(sc.COMING_SOON).toBe(5);
    expect(sc.CLOSED).toBe(2);
    expect(sc.EXCLUDED).toBeGreaterThanOrEqual(10);
    expect(sc.NEEDS_REVIEW).toBeGreaterThanOrEqual(10);
    expect(staging.length).toBeGreaterThanOrEqual(120);
    expect(report.genuinely_new_ready).toBe(ready.length);
  });

  test('Class A chains: Sport Life 42 READY, Apollo Next 24 READY, Smartass 9 READY', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Sport Life']).toBe(42);
    expect(byBrand['Apollo Next']).toBe(24);
    expect(byBrand['Smartass']).toBe(9);
    expect(byBrand['Total Fitness']).toBeGreaterThanOrEqual(5);
    expect(chain.summary.final_class_a_chain_count).toBe(4);
    expect(chain.summary.final_class_a_ready_count).toBeGreaterThanOrEqual(75);
  });

  test('Sport Life estate: 49 official clubs + conflict probes staged separately', () => {
    const sl = staging.filter(
      r => r.brand === 'Sport Life' && r.discovery_class !== 'conflict_area_probe',
    );
    expect(sl.length).toBe(49);
    const coming = sl.filter(r => r.import_category === 'COMING_SOON');
    const closed = sl.filter(r => r.import_category === 'CLOSED');
    expect(coming.length).toBe(5);
    expect(closed.length).toBe(2);
  });

  test('all READY rows: ua_ IDs, Ukraine postcodes, plausible coords, no leakage', () => {
    const ids = ready.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ready) {
      expect(r.id.startsWith(GYM_ID_PREFIX.ukraine)).toBe(true);
      expect(r.country).toBe('Ukraine');
      expect(UKRAINE_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleUkraineCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FOREIGN.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(CONFLICT_CITIES.has(r.city)).toBe(false);
    }
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
  });

  test('conflict-area / Warsaw probes not in READY', () => {
    expect(ready.some(r => r.brand === 'Smartass' && /warsaw/i.test(r.city))).toBe(false);
    expect(ready.some(r => /donetsk|luhansk|crimea|sevastopol|zaporizhzhia|kherson/i.test(r.city))).toBe(
      false,
    );
    const nr = staging.filter(r => r.import_category === 'NEEDS_REVIEW');
    expect(nr.some(r => r.city === 'Donetsk')).toBe(true);
    expect(nr.some(r => r.city === 'Zaporizhzhia')).toBe(true);
  });

  test('cross-border / duplicate / postcode model', () => {
    expect(cross.poland_ready_outliers).toBe(0);
    expect(cross.moldova_ready_outliers).toBe(0);
    expect(cross.russia_ready_outliers).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBeLessThanOrEqual(5);
    expect(new RegExp(postcodeModel.regex).test('01001')).toBe(true);
    expect(new RegExp(postcodeModel.regex).test('79000')).toBe(true);
  });

  test('country resolution / search / check-in / scale / verdict', () => {
    expect(isUkraineCountry('Ukraine')).toBe(true);
    expect(isUkraineCountry('UA')).toBe(true);
    expect(isUkraineCountry('Україна')).toBe(true);
    expect(gymCountryTranslationKey('Ukraine')).toBe('countries.ukraine');
    expect(en.countries.ukraine).toBe('Ukraine');
    expect(da.countries.ukraine).toBe('Ukraine');
    expect(sv.countries.ukraine).toBe('Ukraina');
    expect(nb.countries.ukraine).toBe('Ukraina');
    const stub = resolveGymOrStub('ua_nonexistent_test');
    expect(String(stub.name || stub.city || '').length).toBeGreaterThan(0);
    const g = fakeGym({id: 'ua_probe_kyiv', name: 'Sport Life Kyiv', city: 'Kyiv'});
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('ukraine')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('kyiv')).toBe(true);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(report.ukraine_infrastructure_present).toBe(true);
    expect(report.projected_catalog_after_future_merge).toBe(
      CURRENT_PRODUCTION_TOTAL + ready.length,
    );
  });
});
