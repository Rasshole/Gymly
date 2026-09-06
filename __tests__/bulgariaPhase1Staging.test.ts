/**
 * Bulgaria Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBulgariaCoordinate,
  BULGARIA_POSTAL_RE,
  isBulgariaCountry,
  isRomaniaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
  compactGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11416;
const PRODUCTION_SHA256 =
  '644fb590b8327a773d1a0bc60fbebfe7558d5b112ad3aa838bd291849523d4ec';
const FOREIGN =
  /\b(romania|bucharest|serbia|beograd|macedonia|skopje|greece|thessaloniki|turkey|istanbul)\b/i;

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
    city: partial.city ?? 'Sofia',
    address: partial.address ?? 'Vitosha 1',
    postalCode: partial.postalCode ?? '1000',
    country: 'Bulgaria',
    region: 'Bulgaria',
    latitude: partial.latitude ?? 42.6977,
    longitude: partial.longitude ?? 23.3219,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Vitosha 1',
      postal_code: partial.postalCode ?? '1000',
      city: partial.city ?? 'Sofia',
      country: 'Bulgaria',
      lat: partial.latitude ?? 42.6977,
      lng: partial.longitude ?? 23.3219,
      is_active: true,
    },
  };
}

describe('Bulgaria Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/bulgaria/bulgaria_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE1_READINESS_REPORT.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
    production_total?: number;
    projected_catalog_if_merged_alone?: number;
    status_counts?: Record<string, number>;
  };

  it('production catalog reflects Bulgaria merge (11416 / 82 bg_*)', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(PRODUCTION_SHA256);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('bg_')).length).toBe(82);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bulgaria').length).toBe(82);
  });

  it('wires Bulgaria country helpers, prefix, i18n, orphan stub', () => {
    expect(GYM_ID_PREFIX.bulgaria).toBe('bg_');
    expect(isBulgariaCountry('Bulgaria')).toBe(true);
    expect(isBulgariaCountry('България')).toBe(true);
    expect(isBulgariaCountry('Bulgariya')).toBe(true);
    expect(isBulgariaCountry('Romania')).toBe(false);
    expect(isRomaniaCountry('Bulgaria')).toBe(false);
    expect(gymCountryTranslationKey('Bulgaria')).toBe('countries.bulgaria');
    expect((en as {countries: {bulgaria: string}}).countries.bulgaria).toBe('Bulgaria');
    expect((da as {countries: {bulgaria?: string}}).countries.bulgaria).toBeTruthy();
    expect((sv as {countries: {bulgaria?: string}}).countries.bulgaria).toBeTruthy();
    expect((nb as {countries: {bulgaria?: string}}).countries.bulgaria).toBeTruthy();
    expect(resolveGymOrStub('bg_nonexistent_test').region).toBe('Bulgaria');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  it('validates Bulgarian 4-digit postcodes as strings', () => {
    expect(BULGARIA_POSTAL_RE.test('1000')).toBe(true);
    expect(BULGARIA_POSTAL_RE.test('4000')).toBe(true);
    expect(BULGARIA_POSTAL_RE.test('8000')).toBe(true);
    expect(BULGARIA_POSTAL_RE.test('10000')).toBe(false);
    expect(BULGARIA_POSTAL_RE.test('100 0')).toBe(false);
  });

  it('folds Cyrillic city names for search only', () => {
    expect(normalizeGymSearchValue('София')).toMatch(/sofia|софия/i);
    expect(normalizeGymSearchValue('Sofia')).toBe('sofia');
    expect(normalizeGymSearchValue('Plovdiv')).toBe('plovdiv');
    expect(normalizeGymSearchValue('Varna')).toBe('varna');
    expect(normalizeGymSearchValue('Burgas')).toBe('burgas');
    expect(normalizeGymSearchValue('Ruse')).toBe('ruse');
    expect(compactGymSearchValue('1000')).toBe('1000');
  });

  it('adds Bulgaria city aliases into search haystack', () => {
    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'bg_probe',
        city: 'Sofia',
        address: 'Vitosha 1',
        postalCode: '1000',
      }),
    );
    expect(entry.haystack).toMatch(/sofia/);
    expect(entry.haystack).toMatch(/bulgaria|българия|bulgariya/i);
  });

  it('Phase 1 report artifacts remain consistent (staging may advance in Phase 2)', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(11);
    expect(report.production_total).toBe(11254);
    expect(report.projected_catalog_if_merged_alone).toBe(11254 + ready.length);
    expect(report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(staging.length).toBeGreaterThanOrEqual(80);
    const cats = staging.reduce<Record<string, number>>((acc, r) => {
      acc[r.import_category] = (acc[r.import_category] || 0) + 1;
      return acc;
    }, {});
    // After merge, staging READY rows become MERGED_INTO_CATALOG.
    expect(
      (cats.READY_TO_IMPORT || 0) + (cats.MERGED_INTO_CATALOG || 0),
    ).toBeGreaterThanOrEqual(ready.length);
    expect(cats.EXCLUDED).toBeGreaterThanOrEqual(15);
    // Phase 3 may mark announced Pulse clubs as COMING_SOON in shared staging.
    expect(cats.CLOSED || 0).toBe(0);
  });

  it('Phase 1 READY rows remain present in current staging with bg_* IDs', () => {
    const byId = new Map(staging.map(r => [r.id, r]));
    for (const r of ready) {
      expect(byId.has(r.id)).toBe(true);
      expect(r.id).toMatch(/^bg_[a-f0-9]{10}$/);
    }
  });

  it('all Phase 1 READY rows are unique bg_* with valid BG geography/postcodes', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^bg_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Bulgaria');
      expect(r.is_coming_soon).not.toBe(true);
      expect(r.is_closed).not.toBe(true);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(8);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof r.postal_code).toBe('string');
      expect(BULGARIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleBulgariaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    expect(ids.size).toBe(ready.length);
  });

  it('excludes hotel / foreign Pulse and seed operators from Phase 1 READY', () => {
    expect(ready.every(r => !/therme|royal hotel|atlantis/i.test(r.name))).toBe(true);
    expect(ready.every(r => r.country === 'Bulgaria')).toBe(true);
    const excluded = staging.filter(r => r.import_category === 'EXCLUDED');
    expect(excluded.some(r => /atlantis/i.test(r.name))).toBe(true);
    expect(excluded.some(r => /therme/i.test(r.name))).toBe(true);
    expect(excluded.some(r => /Fitness First|Anytime Fitness|World Class/i.test(r.brand))).toBe(
      true,
    );
    const readyIds = new Set(ready.map(r => r.id));
    for (const r of excluded) {
      expect(readyIds.has(r.id)).toBe(false);
    }
  });

  it('rejects neighbor cores in Bulgaria coordinate helper', () => {
    expect(isPlausibleBulgariaCoordinate(42.6977, 23.3219)).toBe(true); // Sofia
    expect(isPlausibleBulgariaCoordinate(42.1354, 24.7453)).toBe(true); // Plovdiv
    expect(isPlausibleBulgariaCoordinate(43.2141, 27.9147)).toBe(true); // Varna
    expect(isPlausibleBulgariaCoordinate(44.4268, 26.1025)).toBe(false); // Bucharest
    expect(isPlausibleBulgariaCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
    expect(isPlausibleBulgariaCoordinate(40.6401, 22.9444)).toBe(false); // Thessaloniki
    expect(isPlausibleBulgariaCoordinate(41.0082, 28.9784)).toBe(false); // Istanbul
  });

  it('no duplicate READY IDs across staging', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
