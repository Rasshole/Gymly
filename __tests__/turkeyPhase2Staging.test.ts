/**
 * Turkey Deep Phase 2 staging — terminal NR resolution + merge readiness (no catalog writes).
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
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 12080;
const LIVE_PRODUCTION_SHA256 =
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';
const LIVE_PRODUCTION_BYTES = 3761727;
const PHASE1_CATEGORIES = new Set([
  'READY_TO_IMPORT',
  'NEEDS_REVIEW',
  'NEEDS_COORDINATES',
  'COMING_SOON',
  'EXCLUDED',
  'CLOSED',
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
  phase2_disposition?: string;
  operation_status?: string;
  source_recency?: string;
};

describe('Turkey Deep Phase 2 staging (merge readiness, no production writes)', () => {
  const dataDir = path.join(__dirname, '../data/turkey');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'turkey_centers_staging.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {summary: {chain_estate_gaps: number; class_a_estate_gaps: number}};
  const provCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_PROVINCE_COVERAGE.json'), 'utf8'),
  ) as {
    material_d_gaps_count: number;
    diyarbakir_grade: string;
    gaziantep_grade: string;
    kayseri_grade: string;
    mersin_grade: string;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; turkish_diacritic_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_GEOCODE_AUDIT.json'), 'utf8'),
  ) as {ready_invalid_coordinates: number; ready_missing_coordinates: number};
  const postcodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_POSTCODE_AUDIT.json'), 'utf8'),
  ) as {invalid_ready_postcodes: number; missing_ready_postcodes: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const phase1Transitions = transitions.filter(t => PHASE1_CATEGORIES.has(t.phase1_category));

  test('production frozen at 12080 / Turkey 0 / BY 46 / UA 105 / MT 24 / SHA+bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes).toBe(LIVE_PRODUCTION_BYTES);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_belarus).toBe(46);
    expect(report.baseline_ukraine).toBe(105);
    expect(report.baseline_malta).toBe(24);
    expect(report.turkey_live).toBe(0);
    expect(report.tr_prefix_live).toBe(0);
  });

  test('prior-country counts unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
  });

  test('Phase 1 recovered 135/135 — every Phase 1 identity transitions exactly once', () => {
    expect(phase1Transitions.length).toBe(135);
    expect(new Set(phase1Transitions.map(t => t.id)).size).toBe(135);
    expect(report.phase1_rows_recovered).toBe(135);
  });

  test('all 2 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = phase1Transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(2);
    expect(nr.every(t => t.phase2_disposition !== 'NEEDS_REVIEW')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(report.phase1_nr_resolved).toBe(2);
    expect(report.phase1_nr_unresolved).toBe(0);
  });

  test('zero production reconciliation — KEEP_EXISTING and EXISTING_REVIEW = 0', () => {
    expect(report.keep_existing_count).toBe(0);
    expect(report.existing_review_required_count).toBe(0);
  });

  test('final buckets reconcile — NEW_READY=198, CS=2, approved matches', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(newReady.length).toBe(198);
    expect(sc.NEW_READY_TO_IMPORT).toBe(198);
    expect(sc.COMING_SOON).toBe(2);
    expect(sc.EXCLUDED).toBe(19);
    expect(newReady.every(r => r.import_category === 'NEW_READY_TO_IMPORT')).toBe(true);
    expect(approved.length).toBe(newReady.length);
    expect(report.final_approved_turkey).toBe(198);
  });

  test('Class A estate gaps = 0', () => {
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(chain.summary.class_a_estate_gaps).toBe(0);
    expect(report.class_a_estate_gaps).toBe(0);
  });

  test('material D provinces terminalized — not grade D', () => {
    expect(provCov.material_d_gaps_count).toBe(0);
    expect(provCov.diyarbakir_grade).not.toBe('D');
    expect(provCov.gaziantep_grade).not.toBe('D');
    expect(provCov.kayseri_grade).not.toBe('D');
    expect(provCov.mersin_grade).not.toBe('D');
  });

  test('NEW_READY quality gates — IDs, postcodes, coords, no leakage', () => {
    for (const r of newReady) {
      expect(r.id.startsWith(GYM_ID_PREFIX.turkey)).toBe(true);
      expect(r.country).toBe('Turkey');
      expect(TURKEY_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleTurkeyCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
    }
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.turkish_diacritic_duplicate_conflicts).toBe(0);
    expect(postcodeAudit.invalid_ready_postcodes).toBe(0);
    expect(postcodeAudit.missing_ready_postcodes).toBe(0);
    expect(geocodeAudit.ready_invalid_coordinates).toBe(0);
    expect(geocodeAudit.ready_missing_coordinates).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('cross-border and Cyprus separation', () => {
    const outlierKeys = [
      'greece_ready_outliers',
      'bulgaria_ready_outliers',
      'georgia_ready_outliers',
      'armenia_ready_outliers',
      'azerbaijan_ready_outliers',
      'iran_ready_outliers',
      'iraq_ready_outliers',
      'syria_ready_outliers',
      'cyprus_turkey_conflicts',
    ] as const;
    for (const k of outlierKeys) {
      expect(cross[k] ?? 0).toBe(0);
    }
  });

  test('country infrastructure / check-in / scale / verdict', () => {
    expect(isTurkeyCountry('Turkey')).toBe(true);
    expect(isTurkeyCountry('Türkiye')).toBe(true);
    expect(gymCountryTranslationKey('Turkey')).toBe('countries.turkey');
    expect(en.countries.turkey).toBeTruthy();
    expect(resolveGymOrStub('tr_nonexistent_test').country).toBe('Turkey');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.turkey_specific_radius_override).toBe(0);
    expect(report.projected_catalog_total).toBe(CURRENT_PRODUCTION_TOTAL + newReady.length);
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_after_future_merge).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.search_display_qa).toBe('PASS');
    expect(report.nearest_qa).toBe('PLAUSIBLE');
    expect(report.verdict).toBe('READY FOR TURKEY PRODUCTION MERGE');
  });
});
