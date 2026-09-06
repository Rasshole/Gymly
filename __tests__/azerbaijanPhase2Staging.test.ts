/**
 * Azerbaijan Deep Phase 2 staging — terminal NR resolution + merge readiness (no catalog writes).
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
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 12339;
const LIVE_PRODUCTION_SHA256 =
  '7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7';
const LIVE_PRODUCTION_BYTES = 3844273;
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

describe('Azerbaijan Deep Phase 2 staging (merge readiness, no production writes)', () => {
  const dataDir = path.join(__dirname, '../data/azerbaijan');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'azerbaijan_centers_staging.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const nrAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_NR_RESOLUTION_AUDIT.json'), 'utf8'),
  ) as {
    phase1_nr_total: number;
    resolved: number;
    disposition_distribution: Record<string, number>;
    nr_promoted_to_ready: number;
  };
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      chain_estate_gaps: number;
      class_a_estate_gaps: number;
      curated_operator_estate_gaps: number;
      curated_operator_count: number;
      final_class_a_chain_count: number;
      missed_class_a_estate_gaps: number;
      class_a_semantics_correct: string;
      fs_club_network_estate_gaps: number;
    };
  };
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; nakhchivan_material_d: string};
  const regCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const conflict = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_CONFLICT_REGION_AUDIT.json'), 'utf8'),
  ) as {
    conflict_region_unresolved: number;
    conflict_region_operation_unverified_ready: number;
    conflict_region_candidates: number;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; azerbaijani_transliteration_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const geocodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_GEOCODE_AUDIT.json'), 'utf8'),
  ) as {ready_invalid_coordinates: number; ready_missing_coordinates: number; foreign_probe_ready: number};
  const postcodeAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_POSTCODE_AUDIT.json'), 'utf8'),
  ) as {invalid_ready_postcodes: number; missing_ready_postcodes: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const phase1Transitions = transitions.filter(t => PHASE1_CATEGORIES.has(t.phase1_category));

  test('production frozen at 12339 / Azerbaijan 0 / AM 36 / GE 25 / SHA+bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_')).length).toBe(0);
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
    expect(report.baseline_armenia).toBe(36);
    expect(report.baseline_georgia).toBe(25);
    expect(report.azerbaijan_live).toBe(0);
  });

  test('Azerbaijan infrastructure: prefix, country, postcode model', () => {
    expect(GYM_ID_PREFIX.azerbaijan).toBe('az_');
    expect(isAzerbaijanCountry('Azerbaijan')).toBe(true);
    expect(AZERBAIJAN_POSTAL_RE.test('1010')).toBe(true);
    expect(gymCountryTranslationKey('Azerbaijan')).toBe('countries.azerbaijan');
    expect(en.countries.azerbaijan).toBeTruthy();
    expect(resolveGymOrStub('az_nonexistent_test').country).toBe('Azerbaijan');
  });

  test('Phase 1 recovered 434/434 — every identity transitions exactly once', () => {
    expect(phase1Transitions.length).toBe(434);
    expect(new Set(phase1Transitions.map(t => t.id)).size).toBe(434);
    expect(report.phase1_rows_recovered).toBe(434);
  });

  test('all 406 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = phase1Transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(406);
    expect(nr.every(t => t.phase2_disposition !== 'NEEDS_REVIEW')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(nrAudit.phase1_nr_total).toBe(406);
    expect(nrAudit.resolved).toBe(406);
    expect(report.phase1_nr_resolved).toBe(406);
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

  test('Class A semantics — only FS Club Network is Class A (3 sites); curated operators NOT Class A', () => {
    const byBrand = newReady.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['FS Club Network']).toBe(3);
    expect(byBrand['World Class Azerbaijan']).toBe(1);
    expect(byBrand['1st Fitness']).toBe(1);
    expect(byBrand['FitClub']).toBe(1);
    expect(byBrand['Fit Way']).toBe(1);
    expect(byBrand['Pulse']).toBe(1);
    expect(byBrand["Gold's Gym"]).toBe(1);
    expect(byBrand['Sport Life']).toBe(1);
    expect(byBrand['Dream Body']).toBe(1);
    expect(chain.summary.final_class_a_chain_count).toBe(1);
    expect(chain.summary.curated_operator_count).toBe(8);
    expect(chain.summary.class_a_semantics_correct).toBe('YES');
    expect(report.class_a_semantics_correct).toBe('YES');
    expect(chain.summary.class_a_estate_gaps).toBe(0);
    expect(chain.summary.curated_operator_estate_gaps).toBe(0);
    expect(chain.summary.fs_club_network_estate_gaps).toBe(0);
    expect(chain.summary.missed_class_a_estate_gaps).toBe(0);
    expect(report.class_a_estate_gaps).toBe(0);
  });

  test('chain photon duplicates terminalized — Fit Way / Gold\'s Gym / Sport Life / World Class / FS Club NR excluded', () => {
    const fwExcluded = staging.filter(
      r => r.brand === 'Fit Way' && r.import_category === 'EXCLUDED',
    );
    const ggExcluded = staging.filter(
      r => r.brand === "Gold's Gym" && r.import_category === 'EXCLUDED',
    );
    const slExcluded = staging.filter(
      r => r.brand === 'Sport Life' && r.import_category === 'EXCLUDED',
    );
    const wcExcluded = staging.filter(
      r => r.brand === 'World Class' && r.import_category === 'EXCLUDED',
    );
    const fsExcluded = staging.filter(
      r => r.brand === 'FS Club' && r.import_category === 'EXCLUDED',
    );
    expect(fwExcluded.length).toBe(43);
    expect(ggExcluded.length).toBe(14);
    expect(slExcluded.length).toBe(12);
    expect(wcExcluded.length).toBe(11);
    expect(fsExcluded.length).toBe(4);
    expect(nrAudit.disposition_distribution.EXCLUDED).toBeGreaterThan(300);
  });

  test('conflict region terminalized — probes excluded, zero unverified READY', () => {
    const crExcluded = staging.filter(
      r =>
        (r.brand === 'Conflict region probe' || r.conflict_region) &&
        r.import_category === 'EXCLUDED',
    );
    expect(crExcluded.length).toBeGreaterThanOrEqual(19);
    expect(conflict.conflict_region_unresolved).toBe(0);
    expect(conflict.conflict_region_operation_unverified_ready).toBe(0);
    expect(newReady.every(r => !r.conflict_region)).toBe(true);
  });

  test('Nakhchivan material D closed — grade B audit, no READY in Nakhchivan', () => {
    expect(cityCov.nakhchivan_material_d).toBe('NO');
    expect(cityCov.material_d_gaps_count).toBe(0);
    expect(regCov.material_d_gaps_count).toBe(0);
    expect(report.material_d_gaps_count).toBe(0);
    const nakReady = newReady.filter(r => /nakhchivan|naxcivan|naxçıvan/i.test(`${r.city} ${r.name}`));
    expect(nakReady.length).toBe(0);
  });

  test('NEW_READY quality gates — postcodes, coords, no leakage', () => {
    for (const r of newReady) {
      expect(r.id.startsWith(GYM_ID_PREFIX.azerbaijan)).toBe(true);
      expect(r.country).toBe('Azerbaijan');
      expect(AZERBAIJAN_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleAzerbaijanCoordinate(r.lat as number, r.lng as number)).toBe(true);
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
    expect(cross.azerbaijan_ready_outliers ?? 0).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.azerbaijani_transliteration_duplicate_conflicts).toBe(0);
  });

  test('regional coverage — Sumqayit/Ganja promoted independents', () => {
    const sumReady = newReady.filter(r => /sumqayit|sumgayit|sumqayıt/i.test(`${r.city} ${r.brand}`));
    const ganReady = newReady.filter(r => /ganja|gəncə|gence/i.test(`${r.city} ${r.brand}`));
    expect(sumReady.length).toBeGreaterThanOrEqual(1);
    expect(ganReady.length).toBeGreaterThanOrEqual(1);
  });

  test('Baku NR fully resolved — zero unresolved in Baku audit', () => {
    const bakuAudit = report.baku_audit as {final_unresolved: number; final_ready: number};
    expect(bakuAudit.final_unresolved).toBe(0);
    expect(bakuAudit.final_ready).toBeGreaterThanOrEqual(10);
  });

  test('scale projection and merge verdict', () => {
    const projected = report.projected_catalog_total as number;
    expect(projected).toBe(CURRENT_PRODUCTION_TOTAL + newReady.length);
    expect(report.projected_remaining_headroom).toBe(12500 - projected);
    expect(newReady.length).toBeGreaterThan(11);
    expect(newReady.length).toBeLessThanOrEqual(200);
    expect(report.verdict).toBe('READY FOR AZERBAIJAN PRODUCTION MERGE');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
