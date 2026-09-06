/**
 * Slovakia Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSlovakiaCoordinate,
  SLOVAKIA_POSTAL_RE,
  CZECHIA_POSTAL_RE,
  isSlovakiaCountry,
  isCzechiaCountry,
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
const CURRENT_PRODUCTION_TOTAL = 11254;
const PHASE1_DOCUMENTED_PRODUCTION_TOTAL = 11217;
const POST_MERGE_SHA256 =
  '91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840';
const FOREIGN =
  /\b(czechia|česko|austria|österreich|wien|vienna|hungary|magyarország|poland|polska|ukraine|kyiv|uzhhorod)\b/i;

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
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Bratislava',
    address: partial.address ?? 'Hlavná 1',
    postalCode: partial.postalCode ?? '811 01',
    country: 'Slovakia',
    region: 'Slovakia',
    latitude: partial.latitude ?? 48.1486,
    longitude: partial.longitude ?? 17.1077,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Hlavná 1',
      postal_code: partial.postalCode ?? '811 01',
      city: partial.city ?? 'Bratislava',
      country: 'Slovakia',
      lat: partial.latitude ?? 48.1486,
      lng: partial.longitude ?? 17.1077,
      is_active: true,
    },
  };
}

describe('Slovakia Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/slovakia/slovakia_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_PHASE1_READINESS_REPORT.json',
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

  it('live catalog post-Slovakia merge; Phase 1 report retains pre-merge baseline', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    const sha = require('crypto')
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(POST_MERGE_SHA256);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('sk_')).length).toBe(37);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovakia').length).toBe(37);
    expect(report.production_total).toBe(PHASE1_DOCUMENTED_PRODUCTION_TOTAL);
  });

  it('wires Slovakia country helpers, prefix, i18n, orphan stub', () => {
    expect(GYM_ID_PREFIX.slovakia).toBe('sk_');
    expect(isSlovakiaCountry('Slovakia')).toBe(true);
    expect(isSlovakiaCountry('Slovensko')).toBe(true);
    expect(isSlovakiaCountry('Czechia')).toBe(false);
    expect(isCzechiaCountry('Slovakia')).toBe(false);
    expect(gymCountryTranslationKey('Slovakia')).toBe('countries.slovakia');
    expect((en as any).countries.slovakia).toBe('Slovakia');
    expect((da as any).countries.slovakia).toBeTruthy();
    expect((sv as any).countries.slovakia).toBeTruthy();
    expect((nb as any).countries.slovakia).toBeTruthy();
    expect(resolveGymOrStub('sk_nonexistent_test').region).toBe('Slovakia');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  it('keeps Slovak vs Czech postcode namespaces disjoint', () => {
    expect(SLOVAKIA_POSTAL_RE.test('811 01')).toBe(true);
    expect(SLOVAKIA_POSTAL_RE.test('040 01')).toBe(true);
    expect(SLOVAKIA_POSTAL_RE.test('010 01')).toBe(true);
    expect(SLOVAKIA_POSTAL_RE.test('110 00')).toBe(false); // Praha
    expect(CZECHIA_POSTAL_RE.test('110 00')).toBe(true);
    expect(CZECHIA_POSTAL_RE.test('811 01')).toBe(false);
    expect(SLOVAKIA_POSTAL_RE.test('000 02')).toBe(false);
  });

  it('folds Slovak diacritics for search only', () => {
    expect(normalizeGymSearchValue('Košice')).toBe('kosice');
    expect(normalizeGymSearchValue('Žilina')).toBe('zilina');
    expect(normalizeGymSearchValue('Prešov')).toBe('presov');
    expect(normalizeGymSearchValue('Trenčín')).toBe('trencin');
    expect(normalizeGymSearchValue('Banská Bystrica')).toBe('banska bystrica');
    expect(compactGymSearchValue('811 01')).toBe('81101');
  });

  it('adds Slovakia city aliases into search haystack', () => {
    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'sk_probe',
        city: 'Košice',
        address: 'Hlavná 1',
        postalCode: '040 01',
      }),
    );
    expect(entry.haystack).toMatch(/kosice/);
    expect(entry.haystack).toMatch(/slovakia|slovensko/i);
  });

  it('staging statuses and READY count match Phase 1 report artifacts', () => {
    // Live slovakia_centers_staging.json is updated by later phases — assert Phase 1 READY file.
    expect(ready.length).toBe(32);
    expect(report.ready_count).toBe(32);
    expect(report.production_total).toBe(11217);
    expect(report.projected_catalog_if_merged_alone).toBe(11249);
    expect(report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(staging.length).toBeGreaterThanOrEqual(40);
  });

  it('READY brand breakdown exact', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Form Factory']).toBe(14);
    expect(byBrand['Golem Club']).toBe(11);
    expect(byBrand['365 Fit&Co']).toBe(4);
    expect(byBrand.FITINN).toBe(3);
    expect(ready.filter(r => /efectfit|multisport|esx/i.test(`${r.brand} ${r.name}`)).length).toBe(
      0,
    );
  });

  it('all READY rows are unique sk_* with valid SK geography and postcodes', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^sk_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Slovakia');
      expect(r.is_active).not.toBe(false);
      expect(r.is_coming_soon).not.toBe(true);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(SLOVAKIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(CZECHIA_POSTAL_RE.test(String(r.postal_code))).toBe(false);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleSlovakiaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    expect(ids.size).toBe(32);
  });

  it('rejects neighbor cores in Slovakia coordinate helper', () => {
    expect(isPlausibleSlovakiaCoordinate(48.1486, 17.1077)).toBe(true); // Bratislava
    expect(isPlausibleSlovakiaCoordinate(48.7164, 21.2611)).toBe(true); // Košice
    expect(isPlausibleSlovakiaCoordinate(50.0755, 14.4378)).toBe(false); // Praha
    expect(isPlausibleSlovakiaCoordinate(48.2082, 16.3738)).toBe(false); // Vienna
    expect(isPlausibleSlovakiaCoordinate(47.4979, 19.0402)).toBe(false); // Budapest
    expect(isPlausibleSlovakiaCoordinate(50.0647, 19.945)).toBe(false); // Kraków
    expect(isPlausibleSlovakiaCoordinate(48.6208, 22.2879)).toBe(false); // Uzhhorod
  });

  it('withholds coming-soon Form Factory clubs from READY', () => {
    const coming = staging.filter(r => r.import_category === 'COMING_SOON');
    expect(coming.length).toBe(3);
    expect(coming.every(r => r.brand === 'Form Factory')).toBe(true);
    const readyIds = new Set(ready.map(r => r.id));
    for (const c of coming) {
      expect(readyIds.has(c.id)).toBe(false);
    }
  });
});
