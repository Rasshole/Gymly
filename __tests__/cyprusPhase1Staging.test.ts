/**
 * Cyprus Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleCyprusCoordinate,
  CYPRUS_POSTAL_RE,
  isCyprusCountry,
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
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE_REPORT_PRODUCTION_SHA256 =
  'e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4';
const FOREIGN_NORTH =
  /\b(kyrenia|girne|morphou|g[uü]zelyurt|northern cyprus|trnc|gazima[gğ]usa)\b/i;
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
  operator_class?: string;
  territory?: string;
  discovery_class?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Limassol',
    address: partial.address ?? 'Makarios Avenue',
    postalCode: partial.postalCode ?? '3025',
    country: 'Cyprus',
    region: 'Cyprus',
    latitude: partial.latitude ?? 34.68,
    longitude: partial.longitude ?? 33.04,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Makarios Avenue',
      postal_code: partial.postalCode ?? '3025',
      city: partial.city ?? 'Limassol',
      country: 'Cyprus',
      lat: partial.latitude ?? 34.68,
      lng: partial.longitude ?? 33.04,
      is_active: true,
    },
  };
}

describe('Cyprus Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/cyprus/cyprus_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE1_READINESS_REPORT.json',
  );
  const inventoryPath = path.join(__dirname, '../data/cyprus/cyprus_chain_inventory.json');
  const territorialPath = path.join(__dirname, '../data/cyprus/CYPRUS_TERRITORIAL_SAFETY.json');
  const rebrandPath = path.join(__dirname, '../data/cyprus/CYPRUS_PHASE1_REBRAND_MAP.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    production_total?: number;
    production_sha256?: string;
    ready_count?: number;
    status_counts?: Record<string, number>;
    phase2_required?: boolean;
    verdict?: string;
    small_market_model?: string;
    projected_catalog_if_merged?: number;
    cyprus_live?: number;
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    small_market?: {recommended_model?: string; qualifying_class_a_chains?: number};
  };
  const territorial = JSON.parse(fs.readFileSync(territorialPath, 'utf8')) as {
    ready_foreign_outliers?: number;
    northern_cyprus_rows_staged_excluded?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved?: unknown[];
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects Iceland merge (11692 / IS 27 / CY 17); Phase 1 report SHA frozen; Malta 18', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.id.startsWith('cy_')).length).toBe(17);
    expect(centers.filter(c => c.country === 'Cyprus').length).toBe(17);
    expect(centers.filter(c => c.id.startsWith('mt_')).length).toBe(18);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11648);
    expect(report.production_sha256).toBe(PHASE_REPORT_PRODUCTION_SHA256);
    expect(report.cyprus_live).toBe(0);
  });

  it('Phase 1 READY artifact empty; Phase 1 report frozen; staging still cy_', () => {
    // Live staging may advance in Phase 2 — Phase 1 conclusions live in Phase 1 artifacts.
    expect(ready.length).toBe(0);
    expect(report.ready_count).toBe(0);
    expect(report.status_counts?.READY_TO_IMPORT || 0).toBe(0);
    expect(report.phase2_required).toBe(true);
    expect((report.status_counts?.NEEDS_REVIEW || 0) >= 3).toBe(true);
    expect(staging.length).toBeGreaterThan(20);
    for (const r of staging) {
      expect(r.id.startsWith(GYM_ID_PREFIX.cyprus)).toBe(true);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      expect(r.country).toBe('Cyprus');
    }
  });

  it('Phase 1 territorial baseline; no Northern Cyprus in Phase 1 READY artifact', () => {
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    for (const r of ready) {
      expect(CYPRUS_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(isPlausibleCyprusCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FOREIGN_NORTH.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect((territorial.northern_cyprus_rows_staged_excluded || 0) >= 2).toBe(true);
    const north = staging.filter(r => r.territory === 'Northern Cyprus / TRNC');
    expect(north.every(r => r.import_category === 'EXCLUDED')).toBe(true);
  });

  it('Phase 1 conclusions frozen in Phase 1 report (zero Class A / independent recommended)', () => {
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toMatch(/PHASE 2 REQUIRED/i);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect((report.status_counts?.NEEDS_REVIEW || 0) >= 3).toBe(true);
    expect((report.status_counts?.CLOSED || 0) >= 8).toBe(true);
    expect((rebrand.unresolved || []).length).toBeGreaterThan(0);
  });

  it('country / display / i18n / search support cy_ and Cyprus', () => {
    expect(isCyprusCountry('Cyprus')).toBe(true);
    expect(isCyprusCountry('CY')).toBe(true);
    expect(gymCountryTranslationKey('Cyprus')).toBe('countries.cyprus');
    expect(en.countries.cyprus).toBe('Cyprus');
    expect(da.countries.cyprus).toBe('Cypern');
    expect(sv.countries.cyprus).toBe('Cypern');
    expect(nb.countries.cyprus).toBe('Kypros');
    expect(resolveGymOrStub('cy_nonexistent_test').region).toBe('Cyprus');
    const g = fakeGym({id: 'cy_probe_limassol', name: 'Probe Limassol', city: 'Limassol'});
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('cyprus')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('limassol')).toBe(true);
  });

  it('check-in unchanged; Phase 1 projected catalog under 12500', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11648);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
  });

  it('coordinate plausibility helpers reject Northern Cyprus cores; allow Pallouriotissa', () => {
    expect(isPlausibleCyprusCoordinate(34.68, 33.04)).toBe(true); // Limassol
    expect(isPlausibleCyprusCoordinate(35.15, 33.34)).toBe(true); // Strovolos-ish
    expect(isPlausibleCyprusCoordinate(35.178, 33.378)).toBe(true); // Pallouriotissa RoC
    expect(isPlausibleCyprusCoordinate(35.34, 33.32)).toBe(false); // Kyrenia
    expect(isPlausibleCyprusCoordinate(35.20, 33.0)).toBe(false); // Morphou corridor
    expect(CYPRUS_POSTAL_RE.test('2048')).toBe(true);
    expect(CYPRUS_POSTAL_RE.test('99350')).toBe(false);
  });
});
