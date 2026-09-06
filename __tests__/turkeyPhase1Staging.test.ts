/**
 * Turkey Deep Phase 1 staging — discovery + staging only (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleTurkeyCoordinate,
  TURKEY_POSTAL_RE,
  isTurkeyCountry,
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
const CURRENT_PRODUCTION_TOTAL = 12080;
const LIVE_PRODUCTION_SHA256 =
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';
const LIVE_PRODUCTION_BYTES = 3761727;

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
  discovery_class?: string;
  operation_status?: string;
  source_confidence?: string;
  source_url?: string;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'İstanbul',
    address: partial.address ?? 'Bağdat Caddesi 1',
    postalCode: partial.postalCode ?? '34710',
    country: 'Turkey',
    region: 'Turkey',
    latitude: partial.latitude ?? 41.0,
    longitude: partial.longitude ?? 29.0,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Bağdat Caddesi 1',
      postal_code: partial.postalCode ?? '34710',
      city: partial.city ?? 'İstanbul',
      country: 'Turkey',
      lat: partial.latitude ?? 41.0,
      lng: partial.longitude ?? 29.0,
      is_active: true,
    },
  };
}

describe('Turkey Deep Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/turkey');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const reportPath = path.join(dataDir, 'TURKEY_PHASE1_READINESS_REPORT.json');

  const loadJson = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8'));

  it('frozen production baseline intact', () => {
    const bytes = fs.readFileSync(centersPath);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes.length).toBe(LIVE_PRODUCTION_BYTES);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(0);
  });

  it('phase1 SHA before/after files match frozen baseline', () => {
    const before = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
    const after = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
    expect(before).toBe(LIVE_PRODUCTION_SHA256);
    expect(after).toBe(LIVE_PRODUCTION_SHA256);
  });

  it('Turkey infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.turkey).toBe('tr_');
    expect(isTurkeyCountry('Turkey')).toBe(true);
    expect(isTurkeyCountry('Türkiye')).toBe(true);
    expect(isTurkeyCountry('Turkiye')).toBe(true);
    expect(TURKEY_POSTAL_RE.test('34055')).toBe(true);
    expect(TURKEY_POSTAL_RE.test('3405')).toBe(false);
    const postcodeModel = loadJson<{regex: string}>(path.join(dataDir, 'TURKEY_POSTCODE_MODEL.json'));
    expect(postcodeModel.regex).toBe('^\\d{5}$');
    expect(gymCountryTranslationKey('Turkey')).toBe('countries.turkey');
    expect(en.countries.turkey).toBeTruthy();
    expect(da.countries.turkey).toBeTruthy();
    expect(sv.countries.turkey).toBeTruthy();
    expect(nb.countries.turkey).toBeTruthy();
    expect(resolveGymOrStub('tr_nonexistent_test').country).toBe('Turkey');
  });

  it('staging buckets exist and each candidate has exactly one status', () => {
    const staging = loadJson<Row[]>(path.join(dataDir, 'turkey_centers_staging.json'));
    const buckets = [
      'TURKEY_PHASE1_READY_TO_IMPORT.json',
      'TURKEY_PHASE1_NEEDS_REVIEW.json',
      'TURKEY_PHASE1_NEEDS_COORDINATES.json',
      'TURKEY_PHASE1_COMING_SOON.json',
      'TURKEY_PHASE1_EXCLUDED.json',
      'TURKEY_PHASE1_CLOSED.json',
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
    const ready = loadJson<Row[]>(path.join(dataDir, 'TURKEY_PHASE1_READY_TO_IMPORT.json'));
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^tr_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(isTurkeyCountry(r.country)).toBe(true);
      expect(TURKEY_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleTurkeyCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(r.coord_source ?? '')).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address}`)).toBe(false);
      if (r.source_confidence === 'LOW' && !r.source_url) {
        throw new Error(`stale-only READY: ${r.id}`);
      }
    }
  });

  it('no leakage buckets in READY', () => {
    const ready = loadJson<Row[]>(path.join(dataDir, 'TURKEY_PHASE1_READY_TO_IMPORT.json'));
    const cs = /coming soon|yakında/i;
    const closed = /closed|kapalı|permanently closed/i;
    const hotel = /hotel|resort|guest.?only|spa.?only/i;
    const specialist = /crossfit|pilates.?only|yoga.?only|ems\b|boxing.?only|martial arts/i;
    const institutional = /university.?only|military|employee.?only|staff.?only/i;
    for (const r of ready) {
      const blob = `${r.name} ${r.address} ${r.brand}`;
      expect(cs.test(blob)).toBe(false);
      expect(closed.test(blob)).toBe(false);
      expect(hotel.test(blob)).toBe(false);
      expect(specialist.test(blob)).toBe(false);
      expect(institutional.test(blob)).toBe(false);
    }
  });

  it('province coverage and chain audit artifacts generated', () => {
    const prov = loadJson<{
      grade_a_provinces: string[];
      grade_d_provinces: string[];
    }>(path.join(dataDir, 'TURKEY_PHASE1_PROVINCE_COVERAGE.json'));
    expect(prov.grade_a_provinces.length + prov.grade_d_provinces.length).toBeGreaterThan(0);
    const chain = loadJson<{summary: {class_a_chain_count: number}}>(
      path.join(dataDir, 'TURKEY_PHASE1_CHAIN_AUDIT.json'),
    );
    expect(chain.summary.class_a_chain_count).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dataDir, 'TURKEY_PHASE1_REBRAND_MAP.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'TURKEY_EXISTING_PRODUCTION_SNAPSHOT.json'))).toBe(true);
  });

  it('search/display QA for Turkey aliases and major cities', () => {
    const probes = [
      fakeGym({id: 'tr_search_istanbul', name: 'MACFit Kadıköy', city: 'İstanbul', brand: 'MACFit'}),
      fakeGym({id: 'tr_search_ankara', name: 'GymFit Ankara', city: 'Ankara', brand: 'GymFit'}),
    ];
    for (const gym of probes) {
      const entry = buildGymSearchEntry(gym);
      expect(entry.haystack.length).toBeGreaterThan(0);
      expect(entry.haystack).toMatch(/turkey|türkiye|istanbul|ankara|macfit|gymfit/i);
    }
    for (const q of ['Turkey', 'Türkiye', 'Turkiye', 'Istanbul', 'İstanbul', 'Ankara', 'MACFit', 'GymFit']) {
      expect(normalizeGymSearchValue(q).length).toBeGreaterThan(0);
    }
  });

  it('check-in and auto-checkout unchanged; no Turkey radius override', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  it('prior-country counts unchanged', () => {
    const prior: Record<string, number> = {
      by_: 46,
      ua_: 105,
      mt_: 24,
      lt_: 61,
      lv_: 33,
      ee_: 69,
      si_: 33,
      hr_: 80,
      rs_: 63,
      xk_: 18,
      al_: 9,
      ba_: 31,
      mk_: 25,
      me_: 26,
      md_: 28,
      sm_: 6,
      mc_: 4,
      ad_: 12,
      li_: 7,
      is_: 27,
    };
    for (const [prefix, expected] of Object.entries(prior)) {
      expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith(prefix)).length).toBe(expected);
    }
  });

  it('readiness report: scale projection and Global Stress QA not run', () => {
    const report = loadJson<{
      projected_catalog_total: number;
      projected_crosses_12500: boolean;
      global_stress_qa_run: boolean;
      production_modified: boolean;
      verdict: string;
    }>(reportPath);
    expect(report.production_modified).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.projected_catalog_total).toBe(CURRENT_PRODUCTION_TOTAL + loadJson<Row[]>(path.join(dataDir, 'TURKEY_PHASE1_READY_TO_IMPORT.json')).length);
    if (report.projected_crosses_12500) {
      expect(report.projected_catalog_total).toBeGreaterThanOrEqual(12500);
    }
    expect(report.verdict).toMatch(/TURKEY PHASE/);
  });
});
