/**
 * Russia Deep Phase 1 staging — discovery + staging only (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleRussiaCoordinate,
  RUSSIA_POSTAL_RE,
  isRussiaCountry,
  isDisputedUkraineTerritory,
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
const CURRENT_PRODUCTION_TOTAL = 12385;
const LIVE_PRODUCTION_SHA256 =
  '1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1';
const LIVE_PRODUCTION_BYTES = 3858778;
const FOREIGN_PROBE =
  /\b(helsinki|minsk|kyiv|tbilisi|almaty|probe|foreign|cross-border)\b/i;

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
  operation_status?: string;
  source_confidence?: string;
  source_url?: string;
  conflict_region?: boolean;
  disputed_territory?: boolean;
  foreign_probe?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Moscow',
    address: partial.address ?? 'Tverskaya Street 1',
    postalCode: partial.postalCode ?? '101000',
    country: 'Russia',
    region: 'Russia',
    latitude: partial.latitude ?? 55.75,
    longitude: partial.longitude ?? 37.62,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Tverskaya Street 1',
      postal_code: partial.postalCode ?? '101000',
      city: partial.city ?? 'Moscow',
      country: 'Russia',
      lat: partial.latitude ?? 55.75,
      lng: partial.longitude ?? 37.62,
      is_active: true,
    },
  };
}

describe('Russia Deep Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/russia');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const reportPath = path.join(dataDir, 'RUSSIA_PHASE1_READINESS_REPORT.json');

  const loadJson = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8'));

  it('frozen production baseline intact', () => {
    const bytes = fs.readFileSync(centersPath);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes.length).toBe(LIVE_PRODUCTION_BYTES);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(36);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ru_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Russia').length).toBe(0);
  });

  it('phase1 SHA before/after files match frozen baseline', () => {
    const before = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
    const after = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
    expect(before).toBe(LIVE_PRODUCTION_SHA256);
    expect(after).toBe(LIVE_PRODUCTION_SHA256);
  });

  it('Russia infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.russia).toBe('ru_');
    expect(isRussiaCountry('Russia')).toBe(true);
    expect(isRussiaCountry('Rossiya')).toBe(true);
    expect(isRussiaCountry('Россия')).toBe(true);
    expect(RUSSIA_POSTAL_RE.test('101000')).toBe(true);
    expect(RUSSIA_POSTAL_RE.test('10100')).toBe(false);
    expect(isPlausibleRussiaCoordinate(55.75, 37.62)).toBe(true);
    expect(isDisputedUkraineTerritory(44.95, 34.1)).toBe(true);
    expect(isPlausibleRussiaCoordinate(44.95, 34.1)).toBe(false);
    const postcodeModel = loadJson<{regex: string}>(path.join(dataDir, 'RUSSIA_POSTCODE_MODEL.json'));
    expect(postcodeModel.regex).toBe('^\\d{6}$');
    expect(gymCountryTranslationKey('Russia')).toBe('countries.russia');
    expect(en.countries.russia).toBeTruthy();
    expect(da.countries.russia).toBeTruthy();
    expect(sv.countries.russia).toBeTruthy();
    expect(nb.countries.russia).toBeTruthy();
    expect(resolveGymOrStub('ru_nonexistent_test').country).toBe('Russia');
  });

  it('existing production snapshot empty', () => {
    const snap = loadJson<Row[]>(path.join(dataDir, 'RUSSIA_EXISTING_PRODUCTION_SNAPSHOT.json'));
    expect(snap.length).toBe(0);
  });

  it('staging buckets exist and each candidate has exactly one status', () => {
    const staging = loadJson<Row[]>(path.join(dataDir, 'russia_centers_staging.json'));
    expect(staging.length).toBeGreaterThan(50);
    const buckets = [
      'RUSSIA_PHASE1_READY_TO_IMPORT.json',
      'RUSSIA_PHASE1_NEEDS_REVIEW.json',
      'RUSSIA_PHASE1_NEEDS_COORDINATES.json',
      'RUSSIA_PHASE1_COMING_SOON.json',
      'RUSSIA_PHASE1_EXCLUDED.json',
      'RUSSIA_PHASE1_CLOSED.json',
    ].map(f => loadJson<Row[]>(path.join(dataDir, f)));

    const union = buckets.flat();
    expect(union.length).toBe(staging.length);
    const ids = union.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of staging) {
      expect(r.import_category).toMatch(
        /^(READY_TO_IMPORT|NEEDS_REVIEW|NEEDS_COORDINATES|COMING_SOON|EXCLUDED|CLOSED)$/,
      );
    }
  });

  it('READY rows pass data quality gates', () => {
    const ready = loadJson<Row[]>(path.join(dataDir, 'RUSSIA_PHASE1_READY_TO_IMPORT.json'));
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^ru_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Russia');
      expect(RUSSIA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleRussiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source ?? ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
      expect(r.disputed_territory).not.toBe(true);
      expect(r.conflict_region).not.toBe(true);
      expect(FOREIGN_PROBE.test(`${r.name} ${r.city} ${r.address}`)).toBe(false);
    }
  });

  it('safety gates — no leakage into READY', () => {
    const ready = loadJson<Row[]>(path.join(dataDir, 'RUSSIA_PHASE1_READY_TO_IMPORT.json'));
    const excluded = loadJson<Row[]>(path.join(dataDir, 'RUSSIA_PHASE1_EXCLUDED.json'));
    const readyIds = new Set(ready.map(r => r.id));
    for (const r of excluded.filter(x => x.disputed_territory || x.foreign_probe)) {
      expect(readyIds.has(r.id)).toBe(false);
    }
    const report = loadJson<{
      data_quality: {
        disputed_territory_ready: number;
        foreign_probe_ready: number;
        conflict_region_ready: number;
        invalid_ids: number;
        invalid_postcodes: number;
        invalid_coordinates: number;
        fallback_coordinates: number;
      };
    }>(reportPath);
    const dq = report.data_quality;
    expect(dq.disputed_territory_ready).toBe(0);
    expect(dq.foreign_probe_ready).toBe(0);
    expect(dq.conflict_region_ready).toBe(0);
    expect(dq.invalid_ids).toBe(0);
    expect(dq.invalid_postcodes).toBe(0);
    expect(dq.invalid_coordinates).toBe(0);
    expect(dq.fallback_coordinates).toBe(0);
  });

  it('Class A chain audit + regional coverage + duplicates', () => {
    const chain = loadJson<{summary: {class_a_chain_count: number; chain_estate_gaps: number}}>(
      path.join(dataDir, 'RUSSIA_PHASE1_CHAIN_AUDIT.json'),
    );
    const regional = loadJson<{material_d_gaps_count: number}>(
      path.join(dataDir, 'RUSSIA_PHASE1_REGIONAL_COVERAGE.json'),
    );
    const dup = loadJson<{
      hard_duplicate_conflicts: number;
      russian_transliteration_duplicate_conflicts: number;
    }>(path.join(dataDir, 'RUSSIA_PHASE1_DUPLICATE_ANALYSIS.json'));
    const conflict = loadJson<{disputed_territory_ready: number}>(
      path.join(dataDir, 'RUSSIA_PHASE1_CONFLICT_AREA_AUDIT.json'),
    );
    const cross = loadJson<Record<string, number>>(
      path.join(dataDir, 'RUSSIA_PHASE1_CROSS_BORDER_AUDIT.json'),
    );
    expect(chain.summary.class_a_chain_count).toBe(5);
    expect(chain.summary.chain_estate_gaps).toBeGreaterThan(0);
    expect(regional.material_d_gaps_count).toBeGreaterThanOrEqual(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(conflict.disputed_territory_ready).toBe(0);
    expect(cross.russia_ready_outliers ?? 0).toBe(0);
    expect(cross.foreign_probe_ready ?? 0).toBe(0);
  });

  it('Moscow and Saint Petersburg deep audit coverage', () => {
    const city = loadJson<{moscow_staged: number; spb_staged: number}>(
      path.join(dataDir, 'RUSSIA_PHASE1_CITY_COVERAGE.json'),
    );
    expect(city.moscow_staged).toBeGreaterThan(10);
    expect(city.spb_staged).toBeGreaterThan(5);
  });

  it('search/display staging QA + scale projection + verdict', () => {
    const ready = loadJson<Row[]>(path.join(dataDir, 'RUSSIA_PHASE1_READY_TO_IMPORT.json'));
    const staging = loadJson<Row[]>(path.join(dataDir, 'russia_centers_staging.json'));
    const report = loadJson<{
      verdict: string;
      projected_catalog_total: number;
      projected_remaining_headroom: number;
      projected_crosses_12500: boolean;
      phase2_required: boolean;
      production_modified: boolean;
      global_stress_qa_run: boolean;
      status_counts: {NEEDS_REVIEW: number};
    }>(reportPath);

    const probes = [
      fakeGym({
        id: 'ru_search_moscow',
        name: 'World Class Moscow',
        city: 'Moscow',
        brand: 'World Class',
      }),
      fakeGym({
        id: 'ru_search_spb',
        name: 'X-Fit Saint Petersburg',
        city: 'Saint Petersburg',
        brand: 'X-Fit',
      }),
    ];
    for (const gym of probes) {
      const entry = buildGymSearchEntry(gym);
      expect(entry.haystack.length).toBeGreaterThan(0);
      expect(entry.haystack).toMatch(/russia|rossiya|moscow|petersburg|world class|x-fit/i);
    }
    for (const q of ['Russia', 'Rossiya', 'Moscow', 'Saint Petersburg', 'World Class', 'X-Fit']) {
      expect(normalizeGymSearchValue(q).length).toBeGreaterThan(0);
    }

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.production_modified).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.projected_catalog_total).toBe(CURRENT_PRODUCTION_TOTAL + ready.length);
    expect(report.projected_remaining_headroom).toBe(12500 - report.projected_catalog_total);
    expect(report.projected_crosses_12500).toBe(report.projected_catalog_total >= 12500);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('RUSSIA PHASE 2 REQUIRED — TERMINAL NATIONAL RESOLUTION');
    expect(staging.length).toBeGreaterThan(ready.length);
    expect(report.status_counts.NEEDS_REVIEW).toBeGreaterThan(0);
  });
});
