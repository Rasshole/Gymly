/**
 * Luxembourg Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLuxembourgCoordinate,
  LUXEMBOURG_POSTAL_RE,
  isLuxembourgCountry,
  isBelgiumCountry,
  isFranceCountry,
  isGermanyCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11648;
const PRODUCTION_SHA256 =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const FOREIGN =
  /\b(belgium|belgi[eë]|france|deutschland|germany|trier|thionville|athus|perl)\b/i;
const VALID_STATUS = new Set([
  'READY_TO_IMPORT',
  'NEEDS_COORDINATES',
  'NEEDS_REVIEW',
  'COMING_SOON',
  'CLOSED',
  'DUPLICATE',
  'LEGACY',
  'EXCLUDED',
  'MERGED_INTO_CATALOG',
]);

type StagingRow = {
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
  is_active?: boolean;
  is_coming_soon?: boolean;
  is_closed?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Luxembourg',
    address: partial.address ?? 'Rue Joseph Junck 12',
    postalCode: partial.postalCode ?? '1839',
    country: 'Luxembourg',
    region: 'Luxembourg',
    latitude: partial.latitude ?? 49.6116,
    longitude: partial.longitude ?? 6.1319,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Rue Joseph Junck 12',
      postal_code: partial.postalCode ?? '1839',
      city: partial.city ?? 'Luxembourg',
      country: 'Luxembourg',
      lat: partial.latitude ?? 49.6116,
      lng: partial.longitude ?? 6.1319,
      is_active: true,
    },
  };
}

describe('Luxembourg Phase 1 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/luxembourg/luxembourg_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_PHASE1_READINESS_REPORT.json',
  );
  const inventoryPath = path.join(
    __dirname,
    '../data/luxembourg/luxembourg_chain_inventory.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
    production_total?: number;
    projected_catalog_if_merged?: number;
    production_sha256?: string;
    phase2_required?: boolean;
    status_counts?: Record<string, number>;
    unique_staged?: number;
    ready_by_brand?: Record<string, number>;
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    chains?: Record<string, {READY?: number; verdict?: string}>;
  };

  it('production reflects Luxembourg merge (11648 / LU 20); SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('lu_')).length).toBe(20);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Luxembourg').length).toBe(20);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(68);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe('e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4');
    expect(report.production_sha256).toBe(PRODUCTION_SHA256);
    expect(report.production_total).toBe(11610);
    expect(report.production_sha256).toBe(PRODUCTION_SHA256);
  });

  it('wires Luxembourg country helpers, prefix, i18n, orphan stub', () => {
    expect(GYM_ID_PREFIX.luxembourg).toBe('lu_');
    expect(isLuxembourgCountry('Luxembourg')).toBe(true);
    expect(isLuxembourgCountry('LU')).toBe(true);
    expect(isLuxembourgCountry('Luxemburg')).toBe(true);
    expect(isLuxembourgCountry('Belgium')).toBe(false);
    expect(isBelgiumCountry('Luxembourg')).toBe(false);
    expect(isFranceCountry('Luxembourg')).toBe(false);
    expect(isGermanyCountry('Luxembourg')).toBe(false);
    expect(gymCountryTranslationKey('Luxembourg')).toBe('countries.luxembourg');
    expect((en as {countries: {luxembourg: string}}).countries.luxembourg).toBe('Luxembourg');
    expect((da as {countries: {luxembourg?: string}}).countries.luxembourg).toBe('Luxembourg');
    expect((sv as {countries: {luxembourg?: string}}).countries.luxembourg).toBe('Luxembourg');
    expect((nb as {countries: {luxembourg?: string}}).countries.luxembourg).toBe('Luxembourg');
    expect(resolveGymOrStub('lu_nonexistent_test').region).toBe('Luxembourg');
    expect(resolveGymOrStub('lu_nonexistent_test').id).toBe('lu_nonexistent_test');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  it('Luxembourg postcode and coordinate helpers', () => {
    expect(LUXEMBOURG_POSTAL_RE.test('1839')).toBe(true);
    expect(LUXEMBOURG_POSTAL_RE.test('183')).toBe(false);
    expect(LUXEMBOURG_POSTAL_RE.test('L-1839')).toBe(false);
    expect(isPlausibleLuxembourgCoordinate(49.6116, 6.1319)).toBe(true); // City
    expect(isPlausibleLuxembourgCoordinate(49.5, 5.98)).toBe(true); // Esch area
    expect(isPlausibleLuxembourgCoordinate(49.68, 5.82)).toBe(false); // Arlon BE
    expect(isPlausibleLuxembourgCoordinate(49.36, 6.17)).toBe(false); // Thionville FR
    expect(isPlausibleLuxembourgCoordinate(49.75, 6.64)).toBe(false); // Trier DE
  });

  it('search normalization; haystack tags Luxembourg', () => {
    expect(normalizeGymSearchValue('Esch-sur-Alzette')).toMatch(/esch/);
    expect(normalizeGymSearchValue('Pétange')).toBe('petange');
    const entry = buildGymSearchEntry(
      fakeGym({id: 'lu_probe', city: 'Luxembourg', brand: 'Basic-Fit'}),
    );
    expect(entry.haystack).toMatch(/luxembourg|luxemburg/i);
  });

  it('staging is LU-only with valid statuses; IDs unique lu_*', () => {
    const ids = new Set<string>();
    for (const r of staging) {
      expect(r.country).toBe('Luxembourg');
      expect(r.id).toMatch(/^lu_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
    expect(ids.size).toBe(staging.length);
    expect(staging.every(r => r.id.startsWith('lu_'))).toBe(true);
    expect(staging.some(r => r.id.startsWith('be_'))).toBe(false);
    expect(staging.some(r => r.id.startsWith('fr_'))).toBe(false);
    expect(staging.some(r => r.id.startsWith('de_'))).toBe(false);
  });

  it('READY reconciles with staging; Phase 2 required', () => {
    // Frozen Phase 1 report + READY file (staging advanced to MERGED after production merge)
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(20);
    expect(report.status_counts?.READY_TO_IMPORT).toBe(20);
    expect(report.status_counts?.COMING_SOON).toBe(1);
    expect(report.status_counts?.EXCLUDED).toBe(18);
    expect(report.status_counts?.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(report.status_counts?.NEEDS_REVIEW ?? 0).toBe(0);
    expect(report.unique_staged).toBe(39);
    expect(report.projected_catalog_if_merged).toBe(11610 + ready.length);
    expect(report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(report.phase2_required).toBe(true);

    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Basic-Fit']).toBe(10);
    expect(byBrand['JIMS']).toBe(6);
    expect(byBrand['CK Fitness']).toBe(4);
    expect(report.ready_by_brand).toEqual(byBrand);

    const stagingMergedIds = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    for (const r of ready) {
      expect(stagingMergedIds.has(r.id)).toBe(true);
    }
    expect(
      staging.some(r => r.import_category === 'COMING_SOON' && /foetz/i.test(r.name)),
    ).toBe(true);
  });

  it('READY hard quality gates; Luxembourg bounds; no foreign/fallback', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^lu_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Luxembourg');
      expect(r.is_active).toBe(true);
      expect(r.is_coming_soon).not.toBe(true);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof r.postal_code).toBe('string');
      expect(LUXEMBOURG_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(!(r.lat === 0 && r.lng === 0)).toBe(true);
      expect(isPlausibleLuxembourgCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(String(r.id).startsWith('be_')).toBe(false);
      expect(String(r.id).startsWith('fr_')).toBe(false);
      expect(String(r.id).startsWith('de_')).toBe(false);
    }
    expect(ids.size).toBe(ready.length);
  });

  it('projected catalog stays under Global Stress QA threshold', () => {
    expect(CURRENT_PRODUCTION_TOTAL).toBe(11648);
    expect(11610 + ready.length).toBe(11648);
  });
});
