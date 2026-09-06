/**
 * Iceland Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleIcelandCoordinate,
  ICELAND_POSTAL_RE,
  isIcelandCountry,
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
const PHASE_REPORT_PRODUCTION_TOTAL = 11665;
const PHASE_REPORT_PRODUCTION_SHA256 =
  'caf838b1ce733fd20fb724306429bcc48ddee49d684a8efbe70c0cd9b1e46944';
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
  operator_class?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Reykjavík',
    address: partial.address ?? 'Laugavegur 1',
    postalCode: partial.postalCode ?? '101',
    country: 'Iceland',
    region: 'Iceland',
    latitude: partial.latitude ?? 64.14,
    longitude: partial.longitude ?? -21.9,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Laugavegur 1',
      postal_code: partial.postalCode ?? '101',
      city: partial.city ?? 'Reykjavík',
      country: 'Iceland',
      lat: partial.latitude ?? 64.14,
      lng: partial.longitude ?? -21.9,
      is_active: true,
    },
  };
}

describe('Iceland Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/iceland/iceland_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/iceland/ICELAND_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/iceland/ICELAND_PHASE1_READINESS_REPORT.json',
  );
  const inventoryPath = path.join(__dirname, '../data/iceland/iceland_chain_inventory.json');
  const rebrandPath = path.join(__dirname, '../data/iceland/ICELAND_PHASE1_REBRAND_MAP.json');
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
    iceland_live?: number;
    data_quality?: {all_gates_pass?: boolean; duplicate_ids?: string[]};
  };
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as {
    small_market?: {recommended_model?: string; qualifying_class_a_chains?: number};
    class_a_open_estimate?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved?: unknown[];
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects Iceland merge (11692 / IS 27); Phase 1 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.id.startsWith('is_')).length).toBe(27);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(centers.filter(c => c.id.startsWith('cy_')).length).toBe(17);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE_REPORT_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(PHASE_REPORT_PRODUCTION_SHA256);
    expect(report.iceland_live).toBe(0);
  });

  it('staging IDs valid/unique; all rows have status', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of staging) {
      expect(r.id.startsWith(GYM_ID_PREFIX.iceland)).toBe(true);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
      expect(r.country).toBe('Iceland');
    }
  });

  it('27 Class A READY — World Class 20 + Katla Fitness 7', () => {
    expect(ready.length).toBe(27);
    expect(report.ready_count).toBe(27);
    expect(report.status_counts?.READY_TO_IMPORT).toBe(27);
    const wcReady = ready.filter(r => r.brand === 'World Class');
    const katlaReady = ready.filter(r => r.brand === 'Katla Fitness');
    expect(wcReady.length).toBe(20);
    expect(katlaReady.length).toBe(7);
    expect(inventory.class_a_open_estimate).toBe(27);
  });

  it('READY data-quality gates pass', () => {
    expect(report.data_quality?.all_gates_pass).toBe(true);
    expect(report.data_quality?.duplicate_ids?.length ?? 0).toBe(0);
    for (const r of ready) {
      expect(ICELAND_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(isPlausibleIcelandCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.operator_class).toBe('A');
    }
  });

  it('no unresolved rebrand conflicts in READY', () => {
    expect((rebrand.unresolved || []).length).toBe(0);
  });

  it('NORMAL_CHAIN_MODEL_SUFFICIENT; merge-grade verdict', () => {
    expect(report.small_market_model).toBe('NORMAL_CHAIN_MODEL_SUFFICIENT');
    expect(inventory.small_market?.recommended_model).toBe('NORMAL_CHAIN_MODEL_SUFFICIENT');
    expect(inventory.small_market?.qualifying_class_a_chains).toBe(2);
    expect(report.phase2_required).toBe(false);
    expect(report.verdict).toBe('READY FOR ICELAND MERGE');
  });

  it('country / display / i18n / search support is_ and Iceland', () => {
    expect(isIcelandCountry('Iceland')).toBe(true);
    expect(isIcelandCountry('IS')).toBe(true);
    expect(isIcelandCountry('Ísland')).toBe(true);
    expect(gymCountryTranslationKey('Iceland')).toBe('countries.iceland');
    expect(en.countries.iceland).toBe('Iceland');
    expect(da.countries.iceland).toBe('Island');
    expect(sv.countries.iceland).toBe('Island');
    expect(nb.countries.iceland).toBe('Island');
    expect(resolveGymOrStub('is_nonexistent_test').region).toBe('Iceland');
    const g = fakeGym({id: 'is_probe_reykjavik', name: 'Probe Reykjavík', city: 'Reykjavík'});
    const entry = buildGymSearchEntry(g);
    expect(normalizeGymSearchValue(entry.haystack).includes('iceland')).toBe(true);
    expect(normalizeGymSearchValue(entry.haystack).includes('reykjavik')).toBe(true);
  });

  it('coordinate gate rejects foreign cores; allows Akureyri and Vestmannaeyjar', () => {
    expect(isPlausibleIcelandCoordinate(64.14, -21.9)).toBe(true);
    expect(isPlausibleIcelandCoordinate(65.68, -18.09)).toBe(true);
    expect(isPlausibleIcelandCoordinate(63.44, -20.28)).toBe(true);
    expect(isPlausibleIcelandCoordinate(55.67, -12.57)).toBe(false);
    expect(isPlausibleIcelandCoordinate(62.0, -6.8)).toBe(false);
    expect(ICELAND_POSTAL_RE.test('101')).toBe(true);
    expect(ICELAND_POSTAL_RE.test('000')).toBe(false);
  });

  it('check-in unchanged; projected catalog under 12500', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_if_merged).toBe(11692);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
  });
});
