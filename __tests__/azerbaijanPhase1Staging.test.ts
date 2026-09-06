/**
 * Azerbaijan Deep Phase 1 staging — discovery + staging only (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAzerbaijanCoordinate,
  AZERBAIJAN_POSTAL_RE,
  isAzerbaijanCountry,
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
const CURRENT_PRODUCTION_TOTAL = 12339;
const LIVE_PRODUCTION_SHA256 =
  '7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7';
const LIVE_PRODUCTION_BYTES = 3844273;
const FOREIGN_PROBE =
  /\b(moscow|tbilisi|yerevan|tehran|istanbul)\b.*\b(probe|foreign|cross-border)\b/i;

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
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Baku',
    address: partial.address ?? 'Nizami Street 1',
    postalCode: partial.postalCode ?? '1010',
    country: 'Azerbaijan',
    region: 'Azerbaijan',
    latitude: partial.latitude ?? 40.41,
    longitude: partial.longitude ?? 49.87,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Nizami Street 1',
      postal_code: partial.postalCode ?? '1010',
      city: partial.city ?? 'Baku',
      country: 'Azerbaijan',
      lat: partial.latitude ?? 40.41,
      lng: partial.longitude ?? 49.87,
      is_active: true,
    },
  };
}

describe('Azerbaijan Deep Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/azerbaijan');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const reportPath = path.join(dataDir, 'AZERBAIJAN_PHASE1_READINESS_REPORT.json');

  const loadJson = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8'));

  it('frozen production baseline intact', () => {
    const bytes = fs.readFileSync(centersPath);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes.length).toBe(LIVE_PRODUCTION_BYTES);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(36);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_')).length).toBe(0);
  });

  it('phase1 SHA before/after files match frozen baseline', () => {
    const before = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
    const after = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
    expect(before).toBe(LIVE_PRODUCTION_SHA256);
    expect(after).toBe(LIVE_PRODUCTION_SHA256);
  });

  it('Azerbaijan infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.azerbaijan).toBe('az_');
    expect(isAzerbaijanCountry('Azerbaijan')).toBe(true);
    expect(isAzerbaijanCountry('Azərbaycan')).toBe(true);
    expect(isAzerbaijanCountry('Azerbaycan')).toBe(true);
    expect(AZERBAIJAN_POSTAL_RE.test('1010')).toBe(true);
    expect(AZERBAIJAN_POSTAL_RE.test('010')).toBe(false);
    const postcodeModel = loadJson<{regex: string}>(path.join(dataDir, 'AZERBAIJAN_POSTCODE_MODEL.json'));
    expect(postcodeModel.regex).toBe('^\\d{4}$');
    expect(gymCountryTranslationKey('Azerbaijan')).toBe('countries.azerbaijan');
    expect(en.countries.azerbaijan).toBeTruthy();
    expect(da.countries.azerbaijan).toBeTruthy();
    expect(sv.countries.azerbaijan).toBeTruthy();
    expect(nb.countries.azerbaijan).toBeTruthy();
    expect(resolveGymOrStub('az_nonexistent_test').country).toBe('Azerbaijan');
  });

  it('existing production snapshot empty', () => {
    const snap = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_EXISTING_PRODUCTION_SNAPSHOT.json'));
    expect(snap.length).toBe(0);
  });

  it('staging buckets exist and each candidate has exactly one status', () => {
    const staging = loadJson<Row[]>(path.join(dataDir, 'azerbaijan_centers_staging.json'));
    const buckets = [
      'AZERBAIJAN_PHASE1_READY_TO_IMPORT.json',
      'AZERBAIJAN_PHASE1_NEEDS_REVIEW.json',
      'AZERBAIJAN_PHASE1_NEEDS_COORDINATES.json',
      'AZERBAIJAN_PHASE1_COMING_SOON.json',
      'AZERBAIJAN_PHASE1_EXCLUDED.json',
      'AZERBAIJAN_PHASE1_CLOSED.json',
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
    const ready = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_PHASE1_READY_TO_IMPORT.json'));
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^az_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Azerbaijan');
      expect(AZERBAIJAN_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleAzerbaijanCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source ?? ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('az_')).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
      expect(r.conflict_region).not.toBe(true);
      expect(FOREIGN_PROBE.test(`${r.name} ${r.city} ${r.address}`)).toBe(false);
    }
  });

  it('safety gates — no leakage into READY', () => {
    const ready = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_PHASE1_READY_TO_IMPORT.json'));
    const excluded = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_PHASE1_EXCLUDED.json'));
    const cs = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_PHASE1_COMING_SOON.json'));
    const closed = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_PHASE1_CLOSED.json'));
    const readyIds = new Set(ready.map(r => r.id));
    for (const r of [...excluded, ...cs, ...closed]) {
      expect(readyIds.has(r.id)).toBe(false);
    }
    const report = loadJson<{
      data_quality: {
        conflict_region_ready: number;
        foreign_probe_ready: number;
        invalid_ids: number;
        invalid_postcodes: number;
        invalid_coordinates: number;
        fallback_coordinates: number;
      };
    }>(reportPath);
    const dq = report.data_quality;
    expect(dq.conflict_region_ready).toBe(0);
    expect(dq.foreign_probe_ready).toBe(0);
    expect(dq.invalid_ids).toBe(0);
    expect(dq.invalid_postcodes).toBe(0);
    expect(dq.invalid_coordinates).toBe(0);
    expect(dq.fallback_coordinates).toBe(0);
  });

  it('Class A chain audit + regional coverage + duplicates', () => {
    const chain = loadJson<{summary: {chain_estate_gaps: number}}>(
      path.join(dataDir, 'AZERBAIJAN_PHASE1_CHAIN_AUDIT.json'),
    );
    const regional = loadJson<{material_d_gaps_count: number}>(
      path.join(dataDir, 'AZERBAIJAN_PHASE1_REGIONAL_COVERAGE.json'),
    );
    const dup = loadJson<{
      hard_duplicate_conflicts: number;
      azerbaijani_transliteration_duplicate_conflicts: number;
    }>(path.join(dataDir, 'AZERBAIJAN_PHASE1_DUPLICATE_ANALYSIS.json'));
    const rebrand = loadJson<{unresolved_conflicts: number}>(
      path.join(dataDir, 'AZERBAIJAN_PHASE1_REBRAND_MAP.json'),
    );
    const cross = loadJson<Record<string, number>>(
      path.join(dataDir, 'AZERBAIJAN_PHASE1_CROSS_BORDER_AUDIT.json'),
    );
    expect(chain.summary.chain_estate_gaps).toBeGreaterThanOrEqual(0);
    expect(regional.material_d_gaps_count).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.azerbaijani_transliteration_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(cross.foreign_outliers ?? cross.azerbaijan_ready_outliers).toBe(0);
    expect(cross.georgia_outliers).toBe(0);
    expect(cross.turkey_outliers).toBe(0);
    expect(cross.armenia_outliers).toBe(0);
    expect(cross.iran_outliers).toBe(0);
    expect(cross.russia_outliers).toBe(0);
  });

  it('search/display staging QA + scale projection + verdict', () => {
    const ready = loadJson<Row[]>(path.join(dataDir, 'AZERBAIJAN_PHASE1_READY_TO_IMPORT.json'));
    const report = loadJson<{
      verdict: string;
      projected_catalog_total: number;
      projected_remaining_headroom: number;
      projected_crosses_12500: boolean;
      phase2_required: boolean;
    }>(reportPath);

    const probes = [
      fakeGym({
        id: ready[0]?.id ?? 'az_probe00001',
        name: ready[0]?.name ?? 'FS Club Megacity',
        brand: ready[0]?.brand ?? 'FS Club Network',
        city: 'Baku',
      }),
      fakeGym({id: 'az_search_ganja', name: 'Ganja Sports Club', city: 'Ganja', brand: 'Independent'}),
    ];
    for (const gym of probes) {
      const entry = buildGymSearchEntry(gym);
      expect(entry.haystack.length).toBeGreaterThan(0);
      expect(entry.haystack).toMatch(/azerbaijan|azərbaycan|baku|ganja|fs club|fitness/i);
    }
    for (const q of ['Azerbaijan', 'Azərbaycan', 'Baku', 'Ganja', 'Nakhchivan', 'FS Club']) {
      expect(normalizeGymSearchValue(q).length).toBeGreaterThan(0);
    }

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog_total).toBe(12339 + ready.length);
    expect(report.projected_remaining_headroom).toBe(12500 - report.projected_catalog_total);
    expect(report.projected_crosses_12500).toBe(report.projected_catalog_total >= 12500);
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('AZERBAIJAN PHASE 2 REQUIRED — TERMINAL NATIONAL RESOLUTION');
  });
});
