/**
 * Armenia Deep Phase 2 staging — terminal NR resolution + merge readiness (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleArmeniaCoordinate,
  ARMENIA_POSTAL_RE,
  isArmeniaCountry,
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
const CURRENT_PRODUCTION_TOTAL = 12303;
const LIVE_PRODUCTION_SHA256 =
  'eead8cd2ad6ad935ae564fd86a7dde856babfe80175bd20ded9eb3acdc1464b4';
const LIVE_PRODUCTION_BYTES = 3832712;
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
  conflict_region?: boolean | string;
};

describe('Armenia Deep Phase 2 staging (merge readiness, no production writes)', () => {
  const dataDir = path.join(__dirname, '../data/armenia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'armenia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const nrAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_NR_RESOLUTION_AUDIT.json'), 'utf8'),
  ) as {
    phase1_nr_total: number;
    resolved: number;
    disposition_distribution: Record<string, number>;
    nr_promoted_to_ready: number;
  };
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      chain_estate_gaps: number;
      class_a_estate_gaps: number;
      curated_operator_estate_gaps: number;
      curated_operator_count: number;
      final_class_a_chain_count: number;
      missed_class_a_estate_gaps: number;
      class_a_semantics_correct: string;
      orange_fitness_estate_gaps: number;
    };
  };
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; dilijan_material_d: string};
  const regCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const conflict = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_CONFLICT_REGION_AUDIT.json'), 'utf8'),
  ) as {
    conflict_region_unresolved: number;
    conflict_region_operation_unverified_ready: number;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; armenian_transliteration_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_GEOCODE_AUDIT.json'), 'utf8'),
  ) as {ready_invalid_coordinates: number; ready_missing_coordinates: number; foreign_probe_ready: number};
  const postcodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_POSTCODE_AUDIT.json'), 'utf8'),
  ) as {invalid_ready_postcodes: number; missing_ready_postcodes: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const phase1Transitions = transitions.filter(t => PHASE1_CATEGORIES.has(t.phase1_category));

  test('production frozen at 12303 / Armenia 0 / GE 25 / TR 198 / BY 46 / UA 105 / MT 24 / SHA+bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(bytes).toBe(LIVE_PRODUCTION_BYTES);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_georgia).toBe(25);
    expect(report.baseline_turkey).toBe(198);
    expect(report.baseline_belarus).toBe(46);
    expect(report.baseline_ukraine).toBe(105);
    expect(report.baseline_malta).toBe(24);
    expect(report.armenia_live).toBe(0);
  });

  test('Armenia infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.armenia).toBe('am_');
    expect(isArmeniaCountry('Armenia')).toBe(true);
    expect(ARMENIA_POSTAL_RE.test('0010')).toBe(true);
    expect(gymCountryTranslationKey('Armenia')).toBe('countries.armenia');
    expect(en.countries.armenia).toBeTruthy();
    expect(resolveGymOrStub('am_nonexistent_test').country).toBe('Armenia');
  });

  test('Phase 1 recovered 312/312 — every identity transitions exactly once', () => {
    expect(phase1Transitions.length).toBe(312);
    expect(new Set(phase1Transitions.map(t => t.id)).size).toBe(312);
    expect(report.phase1_rows_recovered).toBe(312);
  });

  test('all 293 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = phase1Transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(293);
    expect(nr.every(t => t.phase2_disposition !== 'NEEDS_REVIEW')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(nrAudit.phase1_nr_total).toBe(293);
    expect(nrAudit.resolved).toBe(293);
    expect(report.phase1_nr_resolved).toBe(293);
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

  test('Class A semantics — only Orange Fitness is Class A (6 sites); curated operators NOT Class A', () => {
    const byBrand = newReady.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Orange Fitness']).toBe(6);
    expect(byBrand["Gold's Gym"]).toBe(1);
    expect(byBrand['Panorama Fitness']).toBe(1);
    expect(byBrand['World Gym Armenia']).toBe(1);
    expect(byBrand['Energy Fitness']).toBe(1);
    expect(byBrand['Grand Sport Club']).toBe(1);
    expect(chain.summary.final_class_a_chain_count).toBe(1);
    expect(chain.summary.curated_operator_count).toBe(5);
    expect(chain.summary.class_a_semantics_correct).toBe('YES');
    expect(report.class_a_semantics_correct).toBe('YES');
    expect(chain.summary.class_a_estate_gaps).toBe(0);
    expect(chain.summary.curated_operator_estate_gaps).toBe(0);
    expect(chain.summary.orange_fitness_estate_gaps).toBe(0);
    expect(chain.summary.missed_class_a_estate_gaps).toBe(0);
    expect(report.class_a_estate_gaps).toBe(0);
  });

  test('chain photon duplicates terminalized — Grand Sport / World Gym NR excluded', () => {
    const gsExcluded = staging.filter(
      r => r.brand === 'Grand Sport' && r.import_category === 'EXCLUDED',
    );
    const wgExcluded = staging.filter(
      r => r.brand === 'World Gym' && r.import_category === 'EXCLUDED',
    );
    expect(gsExcluded.length).toBeGreaterThanOrEqual(28);
    expect(wgExcluded.length).toBeGreaterThanOrEqual(19);
    expect(nrAudit.disposition_distribution.EXCLUDED).toBeGreaterThan(200);
  });

  test('conflict region terminalized — probes excluded, zero unverified READY', () => {
    const crExcluded = staging.filter(
      r =>
        (r.brand === 'Conflict region probe' || r.conflict_region) &&
        r.import_category === 'EXCLUDED',
    );
    expect(crExcluded.length).toBeGreaterThanOrEqual(8);
    expect(conflict.conflict_region_unresolved).toBe(0);
    expect(conflict.conflict_region_operation_unverified_ready).toBe(0);
    expect(newReady.every(r => !r.conflict_region)).toBe(true);
  });

  test('Dilijan material D closed — grade B audit, no READY in Dilijan', () => {
    expect(cityCov.dilijan_material_d).toBe('NO');
    expect(cityCov.material_d_gaps_count).toBe(0);
    expect(regCov.material_d_gaps_count).toBe(0);
    expect(report.material_d_gaps_count).toBe(0);
    const dilReady = newReady.filter(r => /dilijan|դիլիջան/i.test(`${r.city} ${r.name}`));
    expect(dilReady.length).toBe(0);
  });

  test('NEW_READY quality gates — postcodes, coords, no leakage', () => {
    for (const r of newReady) {
      expect(r.id.startsWith(GYM_ID_PREFIX.armenia)).toBe(true);
      expect(r.country).toBe('Armenia');
      expect(ARMENIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleArmeniaCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.operation_status).not.toBe('OPERATION_UNVERIFIED');
    }
    expect(geocodeAudit.ready_invalid_coordinates).toBe(0);
    expect(geocodeAudit.ready_missing_coordinates).toBe(0);
    expect(geocodeAudit.foreign_probe_ready).toBe(0);
    expect(postcodeAudit.invalid_ready_postcodes).toBe(0);
    expect(postcodeAudit.missing_ready_postcodes).toBe(0);
    expect(cross.foreign_outliers ?? 0).toBe(0);
    expect(cross.armenia_ready_outliers ?? 0).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.armenian_transliteration_duplicate_conflicts).toBe(0);
  });

  test('regional coverage — Gyumri/Vanadzor promoted independents', () => {
    const gyReady = newReady.filter(r => /gyumri|գյումրի/i.test(`${r.city} ${r.brand}`));
    const vanReady = newReady.filter(r => /vanadzor|վանաձոր/i.test(`${r.city} ${r.brand}`));
    expect(gyReady.length).toBeGreaterThanOrEqual(1);
    expect(vanReady.length).toBeGreaterThanOrEqual(1);
  });

  test('scale projection and merge verdict', () => {
    const projected = report.projected_catalog_total as number;
    expect(projected).toBe(CURRENT_PRODUCTION_TOTAL + newReady.length);
    expect(report.projected_remaining_headroom).toBe(12500 - projected);
    expect(report.verdict).toBe('READY FOR ARMENIA PRODUCTION MERGE');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
