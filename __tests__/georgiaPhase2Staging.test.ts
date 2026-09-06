/**
 * Georgia Deep Phase 2 staging — terminal NR resolution + merge readiness (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleGeorgiaCoordinate,
  GEORGIA_POSTAL_RE,
  isGeorgiaCountry,
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
const CURRENT_PRODUCTION_TOTAL = 12278;
const LIVE_PRODUCTION_SHA256 =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';
const LIVE_PRODUCTION_BYTES = 3824712;
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
};

describe('Georgia Deep Phase 2 staging (merge readiness, no production writes)', () => {
  const dataDir = path.join(__dirname, '../data/georgia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'georgia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const nrAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_NR_RESOLUTION_AUDIT.json'), 'utf8'),
  ) as {
    phase1_nr_total: number;
    resolved: number;
    disposition_distribution: Record<string, number>;
  };
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      chain_estate_gaps: number;
      class_a_estate_gaps: number;
      snap_fitness_estate_gaps: number;
      fitness_house_class_a: boolean;
    };
  };
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const regCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; georgian_transliteration_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_GEOCODE_AUDIT.json'), 'utf8'),
  ) as {ready_invalid_coordinates: number; ready_missing_coordinates: number; usa_probe_ready: number};
  const postcodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_POSTCODE_AUDIT.json'), 'utf8'),
  ) as {invalid_ready_postcodes: number; missing_ready_postcodes: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const phase1Transitions = transitions.filter(t => PHASE1_CATEGORIES.has(t.phase1_category));

  test('production frozen at 12278 / Georgia 0 / TR 198 / BY 46 / UA 105 / MT 24 / SHA+bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes).toBe(LIVE_PRODUCTION_BYTES);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_turkey).toBe(198);
    expect(report.baseline_belarus).toBe(46);
    expect(report.baseline_ukraine).toBe(105);
    expect(report.baseline_malta).toBe(24);
    expect(report.georgia_live).toBe(0);
  });

  test('Georgia infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.georgia).toBe('ge_');
    expect(isGeorgiaCountry('Georgia')).toBe(true);
    expect(GEORGIA_POSTAL_RE.test('0108')).toBe(true);
    expect(gymCountryTranslationKey('Georgia')).toBe('countries.georgia');
    expect(en.countries.georgia).toBeTruthy();
    expect(resolveGymOrStub('ge_nonexistent_test').country).toBe('Georgia');
  });

  test('Phase 1 recovered 556/556 — every identity transitions exactly once', () => {
    expect(phase1Transitions.length).toBe(556);
    expect(new Set(phase1Transitions.map(t => t.id)).size).toBe(556);
    expect(report.phase1_rows_recovered).toBe(556);
  });

  test('all 533 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = phase1Transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(533);
    expect(nr.every(t => t.phase2_disposition !== 'NEEDS_REVIEW')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(nrAudit.phase1_nr_total).toBe(533);
    expect(nrAudit.resolved).toBe(533);
    expect(report.phase1_nr_resolved).toBe(533);
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

  test('Class A estates — Oktopus 8, Champion 3; Fitness House NOT Class A (2 sites)', () => {
    const byBrand = newReady.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Oktopus Fitness']).toBe(8);
    expect(byBrand.Champion).toBe(3);
    expect(byBrand['Fitness House']).toBe(2);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(chain.summary.class_a_estate_gaps).toBe(0);
    expect(chain.summary.snap_fitness_estate_gaps).toBe(0);
    expect(chain.summary.fitness_house_class_a).toBe(false);
    expect(report.class_a_estate_gaps).toBe(0);
    expect(report.snap_fitness_estate_gaps).toBe(0);
  });

  test('Snap Fitness estate closed — 1-2 locations, NR duplicates excluded', () => {
    const snapReady = newReady.filter(r => r.brand === 'Snap Fitness');
    expect(snapReady.length).toBeGreaterThanOrEqual(1);
    expect(snapReady.length).toBeLessThanOrEqual(2);
    const snapNr = staging.filter(
      r =>
        (r.brand === 'Snap Fitness' || r.brand === 'Snap-Fitness') &&
        r.import_category === 'EXCLUDED',
    );
    expect(snapNr.length).toBeGreaterThanOrEqual(2);
    expect(snapReady[0]?.id).toBe('ge_3bd67719e5');
  });

  test('chain photon duplicates terminalized — Fitness House / Life Sport NR excluded', () => {
    const fhExcluded = staging.filter(
      r => r.brand === 'Fitness House' && r.import_category === 'EXCLUDED',
    );
    const lsExcluded = staging.filter(
      r => r.brand === 'Life Sport' && r.import_category === 'EXCLUDED',
    );
    expect(fhExcluded.length).toBeGreaterThanOrEqual(110);
    expect(lsExcluded.length).toBeGreaterThanOrEqual(50);
    expect(nrAudit.disposition_distribution.EXCLUDED).toBeGreaterThan(400);
  });

  test('NEW_READY quality gates — postcodes, coords, no leakage', () => {
    for (const r of newReady) {
      expect(r.id.startsWith(GYM_ID_PREFIX.georgia)).toBe(true);
      expect(r.country).toBe('Georgia');
      expect(GEORGIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleGeorgiaCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
    }
    expect(geocodeAudit.ready_invalid_coordinates).toBe(0);
    expect(geocodeAudit.ready_missing_coordinates).toBe(0);
    expect(geocodeAudit.usa_probe_ready).toBe(0);
    expect(postcodeAudit.invalid_ready_postcodes).toBe(0);
    expect(postcodeAudit.missing_ready_postcodes).toBe(0);
    expect(cross.usa_georgia_outliers ?? 0).toBe(0);
    expect(cross.georgia_ready_outliers ?? 0).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.georgian_transliteration_duplicate_conflicts).toBe(0);
  });

  test('material D gaps = 0; check-in radius unchanged', () => {
    expect(cityCov.material_d_gaps_count).toBe(0);
    expect(regCov.material_d_gaps_count).toBe(0);
    expect(report.material_d_gaps_count).toBe(0);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('scale projection and merge verdict', () => {
    const projected = report.projected_catalog_total as number;
    expect(projected).toBe(CURRENT_PRODUCTION_TOTAL + newReady.length);
    expect(report.projected_remaining_headroom).toBe(12500 - projected);
    expect(report.verdict).toBe('READY FOR GEORGIA PRODUCTION MERGE');
  });
});
