/**
 * Russia Deep Phase 2 staging — terminal NR resolution + merge readiness (no catalog writes).
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
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 12385;
const LIVE_PRODUCTION_SHA256 =
  '1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1';
const LIVE_PRODUCTION_BYTES = 3858778;
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
  eligibility?: string;
  disputed_territory?: boolean;
  foreign_probe?: boolean;
};

describe('Russia Deep Phase 2 staging (merge readiness, no production writes)', () => {
  const dataDir = path.join(__dirname, '../data/russia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'russia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const nrAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_NR_RESOLUTION_AUDIT.json'), 'utf8'),
  ) as {
    phase1_nr_total: number;
    resolved: number;
    disposition_distribution: Record<string, number>;
    nr_promoted_to_ready: number;
  };
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      chain_estate_gaps: number;
      class_a_estate_gaps: number;
      final_class_a_chain_count: number;
      class_a_semantics_correct: string;
      spirit_official_adjusted: number;
    };
  };
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; moscow_ready: number; material_city_audits: Record<string, {audit_grade: string}>};
  const regCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const disputed = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_CONFLICT_AREA_AUDIT.json'), 'utf8'),
  ) as {
    disputed_territory_candidates: number;
    disputed_territory_unresolved: number;
    disputed_territory_ready_leakage: number;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; russian_transliteration_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_GEOCODE_AUDIT.json'), 'utf8'),
  ) as {ready_invalid_coordinates: number; ready_missing_coordinates: number; foreign_probe_ready: number};
  const postcodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_POSTCODE_AUDIT.json'), 'utf8'),
  ) as {invalid_ready_postcodes: number; missing_ready_postcodes: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const phase1Transitions = transitions.filter(t => PHASE1_CATEGORIES.has(t.phase1_category));

  test('production frozen at 12385 / Russia 0 / AZ 46 / AM 36 / GE 25 / SHA+bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ru_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(36);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes).toBe(LIVE_PRODUCTION_BYTES);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_azerbaijan).toBe(46);
    expect(report.baseline_armenia).toBe(36);
    expect(report.baseline_georgia).toBe(25);
    expect(report.russia_live).toBe(0);
  });

  test('Russia infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.russia).toBe('ru_');
    expect(isRussiaCountry('Russia')).toBe(true);
    expect(RUSSIA_POSTAL_RE.test('101000')).toBe(true);
    expect(isPlausibleRussiaCoordinate(55.75, 37.62)).toBe(true);
    expect(isDisputedUkraineTerritory(44.95, 34.1)).toBe(true);
    expect(gymCountryTranslationKey('Russia')).toBe('countries.russia');
    expect(en.countries.russia).toBeTruthy();
    expect(resolveGymOrStub('ru_nonexistent_test').country).toBe('Russia');
  });

  test('Phase 1 recovered 1656/1656 — every identity transitions exactly once', () => {
    expect(phase1Transitions.length).toBe(1656);
    expect(new Set(phase1Transitions.map(t => t.id)).size).toBe(1656);
    expect(report.phase1_rows_recovered).toBe(1656);
  });

  test('all 1386 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = phase1Transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(1386);
    expect(nr.every(t => t.phase2_disposition !== 'NEEDS_REVIEW')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(nrAudit.phase1_nr_total).toBe(1386);
    expect(nrAudit.resolved).toBe(1386);
    expect(report.phase1_nr_resolved).toBe(1386);
    expect(report.phase1_nr_unresolved).toBe(0);
  });

  test('zero production reconciliation — KEEP_EXISTING and EXISTING_REVIEW = 0', () => {
    expect(report.keep_existing_count).toBe(0);
    expect(report.existing_review_required_count).toBe(0);
  });

  test('final buckets — approved matches NEW_READY; no legacy READY_TO_IMPORT', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(newReady.length).toBe(sc.NEW_READY_TO_IMPORT);
    expect(approved.length).toBe(newReady.length);
    expect(newReady.every(r => r.import_category === 'NEW_READY_TO_IMPORT')).toBe(true);
    expect(staging.some(r => r.import_category === 'READY_TO_IMPORT')).toBe(false);
    expect(staging.some(r => r.import_category === 'NEEDS_REVIEW')).toBe(false);
    expect(staging.some(r => r.import_category === 'NEEDS_COORDINATES')).toBe(false);
  });

  test('Class A estate gaps = 0 — all five chains fully accounted', () => {
    const byBrand = newReady.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['World Class']).toBe(35);
    expect(byBrand['X-Fit']).toBe(31);
    expect(byBrand['Alex Fitness']).toBe(11);
    expect(byBrand['DDxFitness']).toBe(25);
    expect(byBrand['Spirit Fitness']).toBe(2);
    expect(chain.summary.final_class_a_chain_count).toBe(5);
    expect(chain.summary.class_a_semantics_correct).toBe('YES');
    expect(chain.summary.class_a_estate_gaps).toBe(0);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(report.class_a_estate_gaps).toBe(0);
    expect(chain.summary.spirit_official_adjusted).toBe(5);
  });

  test('disputed territory 27 terminalized — zero READY leakage', () => {
    expect(disputed.disputed_territory_candidates).toBe(27);
    expect(disputed.disputed_territory_unresolved).toBe(0);
    expect(disputed.disputed_territory_ready_leakage).toBe(0);
    expect(newReady.every(r => !r.disputed_territory)).toBe(true);
    const dtExcluded = staging.filter(r => r.disputed_territory && r.import_category === 'EXCLUDED');
    expect(dtExcluded.length).toBe(27);
  });

  test('material D cities closed — Voronezh/Krasnodar/Khabarovsk/Vladivostok/Kursk grade B+', () => {
    expect(cityCov.material_d_gaps_count).toBe(0);
    expect(regCov.material_d_gaps_count).toBe(0);
    expect(report.material_d_gaps_count).toBe(0);
    for (const city of ['Voronezh', 'Krasnodar', 'Khabarovsk', 'Vladivostok', 'Kursk']) {
      expect(cityCov.material_city_audits[city].audit_grade).not.toBe('D');
      expect(cityCov.material_city_audits[city].material_d_closed).toBe('YES');
    }
  });

  test('Moscow/SPb NR fully resolved — Moscow READY not capped at 114', () => {
    const moscowAudit = report.moscow_audit as {final_unresolved: number; final_ready: number};
    const spbAudit = report.spb_audit as {final_unresolved: number; final_ready: number};
    expect(moscowAudit.final_unresolved).toBe(0);
    expect(spbAudit.final_unresolved).toBe(0);
    expect(cityCov.moscow_ready).toBeGreaterThan(114);
    expect(moscowAudit.final_ready).toBeGreaterThan(114);
    expect(spbAudit.final_ready).toBeGreaterThanOrEqual(14);
  });

  test('NEW_READY quality gates — postcodes, coords, no leakage', () => {
    for (const r of newReady) {
      expect(r.id.startsWith(GYM_ID_PREFIX.russia)).toBe(true);
      expect(r.country).toBe('Russia');
      expect(RUSSIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleRussiaCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
    }
    expect(geocodeAudit.ready_invalid_coordinates).toBe(0);
    expect(geocodeAudit.ready_missing_coordinates).toBe(0);
    expect(geocodeAudit.foreign_probe_ready).toBe(0);
    expect(postcodeAudit.invalid_ready_postcodes).toBe(0);
    expect(postcodeAudit.missing_ready_postcodes).toBe(0);
    expect(cross.russia_ready_outliers ?? 0).toBe(0);
    expect(cross.foreign_probe_ready ?? 0).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.russian_transliteration_duplicate_conflicts).toBe(0);
  });

  test('chain photon duplicates terminalized in NR resolution', () => {
    const nrClass = (report.nr_resolution_audit as {classification_distribution: Record<string, number>})
      .classification_distribution;
    expect(nrClass.DUPLICATE_STALE_CHAIN_PHOTON).toBeGreaterThan(50);
    expect(nrAudit.disposition_distribution.EXCLUDED).toBeGreaterThan(1000);
    expect(nrAudit.nr_promoted_to_ready).toBeGreaterThan(200);
  });

  test('scale projection and merge verdict', () => {
    const projected = report.projected_catalog_total as number;
    expect(projected).toBe(CURRENT_PRODUCTION_TOTAL + newReady.length);
    expect(projected).toBe(12850);
    expect(report.projected_crosses_12500).toBe(true);
    expect(newReady.length).toBeGreaterThan(210);
    expect(newReady.length).toBe(465);
    expect(report.verdict).toBe('READY FOR RUSSIA PRODUCTION MERGE');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
