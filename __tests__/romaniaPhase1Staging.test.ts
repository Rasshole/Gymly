/**
 * Romania Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleRomaniaCoordinate,
  ROMANIA_POSTAL_RE,
  isRomaniaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
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
const PHASE1_DOCUMENTED_PRODUCTION_TOTAL = 11063;
const POST_MERGE_SHA256 =
  '91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840';
const FOREIGN =
  /\b(hungary|magyarország|serbia|beograd|bulgaria|ukraine|kyiv)\b/i;

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
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'București',
    address: partial.address ?? 'Str. Probe 1',
    postalCode: partial.postalCode ?? '010011',
    country: 'Romania',
    region: 'Romania',
    latitude: partial.latitude ?? 44.4268,
    longitude: partial.longitude ?? 26.1025,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Str. Probe 1',
      postal_code: partial.postalCode ?? '010011',
      city: partial.city ?? 'București',
      country: 'Romania',
      lat: partial.latitude ?? 44.4268,
      lng: partial.longitude ?? 26.1025,
      is_active: true,
    },
  };
}

describe('Romania Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/romania/romania_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_PHASE1_READINESS_REPORT.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    verdict: string;
  };
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('live catalog post-Romania merge; Phase 1 report retains pre-merge baseline', () => {
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE1_DOCUMENTED_PRODUCTION_TOTAL);
    expect(production.filter(c => c.country === 'Romania').length).toBe(154);
    expect(production.filter(c => String(c.id || '').startsWith('ro_')).length).toBe(154);
    const crypto = require('crypto') as typeof import('crypto');
    expect(crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex')).toBe(
      POST_MERGE_SHA256,
    );
  });

  test('Romania wiring: prefix, country detection, i18n', () => {
    expect(GYM_ID_PREFIX.romania).toBe('ro_');
    expect(isRomaniaCountry('Romania')).toBe(true);
    expect(isRomaniaCountry('România')).toBe(true);
    expect(gymCountryTranslationKey('Romania')).toBe('countries.romania');
    expect(en.countries.romania).toBe('Romania');
    expect(da.countries.romania).toBe('Rumænien');
    expect(sv.countries.romania).toBe('Rumänien');
    expect(nb.countries.romania).toBe('Romania');
    expect(resolveGymOrStub('ro_nonexistent_test').region).toBe('Romania');
  });

  test('Romanian search normalization preserves display, folds diacritics', () => {
    expect(normalizeGymSearchValue('București')).toBe('bucuresti');
    expect(normalizeGymSearchValue('Timișoara')).toBe('timisoara');
    expect(normalizeGymSearchValue('Iași')).toBe('iasi');
    expect(normalizeGymSearchValue('Brașov')).toBe('brasov');
    expect(normalizeGymSearchValue('Constanța')).toBe('constanta');
    expect(normalizeGymSearchValue('Ploiești')).toBe('ploiesti');
    expect(normalizeGymSearchValue('Târgu Mureș')).toBe('targu mures');
    expect('București').toBe('București');
    expect(compactGymSearchValue('010011')).toBe('010011');
  });

  test('city aliases appear in search haystack', () => {
    const buc = fakeGym({
      id: 'ro_buc_probe',
      city: 'București',
      address: 'Bd. Unirii 1',
    });
    expect(buildGymSearchEntry(buc).haystack).toMatch(/bucuresti|bucharest/);

    const cluj = fakeGym({
      id: 'ro_cluj_probe',
      city: 'Cluj-Napoca',
      address: 'Str. Memorandumului 1',
    });
    expect(buildGymSearchEntry(cluj).haystack).toMatch(/cluj/);
  });

  test('READY count matches canonical READY file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
  });

  test('all READY IDs are unique ro_* with Romania country', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^ro_[a-f0-9]{10}$/);
      expect(r.country).toBe('Romania');
      expect(r.is_active).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(ready.length);
  });

  test('READY rows have required fields, valid 6-digit postcodes, finite coords', () => {
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(ROMANIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(String(r.postal_code).length).toBe(6);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat!)).toBe(true);
      expect(Number.isFinite(r.lng!)).toBe(true);
      expect(isPlausibleRomaniaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
    }
  });

  test('leading-zero postcodes preserved in READY', () => {
    const leadingZero = ready.filter(r => String(r.postal_code).startsWith('0'));
    expect(leadingZero.length).toBeGreaterThan(0);
    for (const r of leadingZero) {
      expect(String(r.postal_code)).toMatch(/^0\d{5}$/);
    }
  });

  test('excluded statuses absent from READY file', () => {
    const excluded = new Set([
      'COMING_SOON',
      'CLOSED',
      'NEEDS_COORDINATES',
      'NEEDS_REVIEW',
      'DUPLICATE',
      'LEGACY',
    ]);
    expect(ready.every(r => !excluded.has(r.import_category))).toBe(true);
    expect(staging.some(r => r.import_category === 'MERGED_INTO_CATALOG')).toBe(true);
  });

  test('geographic plausibility rejects neighbors and Moldova', () => {
    expect(isPlausibleRomaniaCoordinate(44.4268, 26.1025)).toBe(true); // Bucharest
    expect(isPlausibleRomaniaCoordinate(46.7712, 23.6236)).toBe(true); // Cluj
    expect(isPlausibleRomaniaCoordinate(47.4979, 19.0402)).toBe(false); // Budapest
    expect(isPlausibleRomaniaCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
    expect(isPlausibleRomaniaCoordinate(42.6977, 23.3219)).toBe(false); // Sofia
    expect(isPlausibleRomaniaCoordinate(47.0105, 28.8638)).toBe(false); // Chișinău
  });
});
