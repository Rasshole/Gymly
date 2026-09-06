/**
 * Belarus Deep Phase 2 staging — terminal NR resolution + merge readiness (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBelarusCoordinate,
  BELARUS_POSTAL_RE,
  isBelarusCountry,
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
const CURRENT_PRODUCTION_TOTAL = 12034;
const LIVE_PRODUCTION_SHA256 =
  'bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05';

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
  eligibility?: string;
};

describe('Belarus Deep Phase 2 staging (merge readiness, no production writes)', () => {
  const dataDir = path.join(__dirname, '../data/belarus');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'belarus_centers_staging.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Row[];
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Row[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {summary: {chain_estate_gaps: number; missed_class_a_chains_found: number}};
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; borovlyany_grade: string; vitebsk_grade: string};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_GEOCODE_AUDIT.json'), 'utf8'),
  ) as {geocode_fix_residual_errors: number};
  const postcodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_POSTCODE_AUDIT.json'), 'utf8'),
  ) as {invalid_postcodes: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 12034 / Belarus 0 / Ukraine 105 / Malta 24 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Belarus').length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Ukraine').length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(24);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_ukraine).toBe(105);
    expect(report.baseline_malta).toBe(24);
    expect(report.belarus_live).toBe(0);
  });

  test('prior-country counts unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
  });

  test('Phase 1 recovered 58/58 — every identity transitions exactly once', () => {
    expect(transitions.length).toBe(58);
    expect(new Set(transitions.map(t => t.id)).size).toBe(58);
    expect(report.phase1_rows_recovered).toBe(58);
  });

  test('zero production reconciliation — KEEP_EXISTING and EXISTING_REVIEW = 0', () => {
    expect(keep.length).toBe(0);
    expect(existingReview.length).toBe(0);
    expect(report.keep_existing_count).toBe(0);
    expect(report.existing_review_required_count).toBe(0);
  });

  test('all 9 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(9);
    expect(nr.every(t => t.phase2_disposition !== 'NEEDS_REVIEW')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(report.phase1_nr_resolved).toBe(9);
    expect(report.phase1_nr_unresolved).toBe(0);
  });

  test('final buckets — NEW_READY=46, CS=1, EXCLUDED=11', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(newReady.length).toBe(46);
    expect(sc.NEW_READY_TO_IMPORT).toBe(46);
    expect(sc.COMING_SOON).toBe(1);
    expect(sc.EXCLUDED).toBe(11);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(newReady.every(r => r.import_category === 'NEW_READY_TO_IMPORT')).toBe(true);
    expect(staging.some(r => r.import_category === 'READY_TO_IMPORT')).toBe(false);
    expect(approved.length).toBe(newReady.length);
  });

  test('Class A estates complete — Adrenalin 29, Lifestyle 3, Fox Club 5, Olympic 4', () => {
    const byBrand = newReady.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand.Adrenalin).toBe(29);
    expect(byBrand.Lifestyle).toBe(3);
    expect(byBrand['Fox Club']).toBe(5);
    expect(byBrand.Olympic).toBe(4);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(report.class_a_estate_gaps).toBe(0);
  });

  test('geocode fixes applied for Phase 1 READY outliers', () => {
    const bogdan = newReady.find(r => r.id === 'by_79989cf6f9');
    const gomel = newReady.find(r => r.id === 'by_0abd3f74c4');
    const mogilev = newReady.find(r => r.id === 'by_e374a381ab');
    expect(bogdan?.postal_code).toBe('220040');
    expect(bogdan?.lat).toBeCloseTo(53.9227104, 4);
    expect(gomel?.address).toContain('Речицкий');
    expect(gomel?.postal_code).toBe('247000');
    expect(mogilev?.city).toBe('Mogilev');
    expect(geocodeAudit.geocode_fix_residual_errors).toBe(0);
  });

  test('NR resolutions — Borovlyany, World Class independent, Vitebsk excluded', () => {
    const borovlyany = newReady.find(r => r.id === 'by_3633cd3ae9');
    const worldClass = newReady.find(r => r.id === 'by_cc9170f013');
    const gymExpress = newReady.find(r => r.id === 'by_9f1ed8d6b8');
    const vitebsk = staging.find(r => r.id === 'by_de53fc35f8');
    const loshitsa = staging.find(r => r.id === 'by_aed96cf298');
    expect(borovlyany?.city).toBe('Borovlyany');
    expect(borovlyany?.postal_code).toBe('223053');
    expect(worldClass?.eligibility).toBe('SMALL_MARKET_INDEPENDENT');
    expect(gymExpress?.eligibility).toBe('SMALL_MARKET_INDEPENDENT');
    expect(vitebsk?.import_category).toBe('EXCLUDED');
    expect(loshitsa?.import_category).toBe('COMING_SOON');
    expect(cityCov.borovlyany_grade).toBe('A');
    expect(cityCov.vitebsk_grade).toBe('B');
  });

  test('NEW_READY quality gates — postcodes, coords, no leakage', () => {
    for (const r of newReady) {
      expect(r.id.startsWith(GYM_ID_PREFIX.belarus)).toBe(true);
      expect(r.country).toBe('Belarus');
      expect(BELARUS_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleBelarusCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect(cross.poland_ready_outliers ?? 0).toBe(0);
    expect(cross.ukraine_ready_outliers ?? 0).toBe(0);
    expect(cross.russia_ready_outliers ?? 0).toBe(0);
    expect(cityCov.material_d_gaps_count).toBe(0);
    expect(report.material_d_gaps_count).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(postcodeAudit.invalid_postcodes).toBe(0);
  });

  test('country resolution / check-in / scale / verdict', () => {
    expect(isBelarusCountry('Belarus')).toBe(true);
    expect(gymCountryTranslationKey('Belarus')).toBe('countries.belarus');
    expect(en.countries.belarus).toBe('Belarus');
    expect(resolveGymOrStub('by_nonexistent_test').country).toBe('Belarus');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.missed_class_a_chains_found).toBe(0);
    expect(chain.summary.missed_class_a_chains_found).toBe(0);
    expect(report.projected_catalog_after_merge).toBe(CURRENT_PRODUCTION_TOTAL + newReady.length);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.verdict).toBe('READY FOR BELARUS PRODUCTION MERGE');
  });
});
