/**
 * Slovenia Phase 2 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSloveniaCoordinate,
  SLOVENIA_POSTAL_RE,
  isSloveniaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

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
  phase2_disposition?: string;
  coord_source?: string | null;
};

describe('Slovenia Phase 2 staging (production reconciliation)', () => {
  const dataDir = path.join(__dirname, '../data/slovenia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(phase2Dir, 'SLOVENIA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const p1Snap = JSON.parse(
    fs.readFileSync(path.join(phase2Dir, 'SLOVENIA_PHASE1_STAGING_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const reconciliation = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json'), 'utf8'),
  ) as {
    phase1_ready: number;
    existing_production: number;
    exact_id_match_count: number;
    metadata_drift_count: number;
    material_metadata_drift_count?: number;
    ready_missing_from_production: string[];
    production_not_in_phase1_ready: string[];
  };
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as Row[];
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'slovenia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {unexplained_b_gaps: number; unexplained_d_gaps: number; material_city_gaps: number};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number; rebrand_conflicts?: number};
  const hotel = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_HOTEL_WELLNESS_AUDIT.json'), 'utf8'),
  ) as {hotel_resort_ready_leakage: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const prodIds = new Set(ALL_GYM_CENTERS.filter(c => c.id.startsWith('si_')).map(c => c.id));

  test('production frozen at 11921 / Slovenia 32 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(32);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('si_')).length).toBe(32);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(existingSnap.length).toBe(32);
  });

  test('prior-country regressions unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('Phase 1 recovery: 38 rows, all IDs preserved', () => {
    expect(p1Snap.length).toBe(38);
    expect(new Set(p1Snap.map(r => r.id)).size).toBe(38);
    expect(report.phase1_rows_recovered).toBe(38);
    expect(report.phase1_ids_missing).toBe(0);
  });

  test('32-vs-32 reconciliation: exact ID match, no material drift', () => {
    expect(reconciliation.phase1_ready).toBe(32);
    expect(reconciliation.existing_production).toBe(32);
    expect(reconciliation.exact_id_match_count).toBe(32);
    expect(reconciliation.ready_missing_from_production).toEqual([]);
    expect(reconciliation.production_not_in_phase1_ready).toEqual([]);
    expect(reconciliation.metadata_drift_count).toBe(0);
    expect(reconciliation.material_metadata_drift_count ?? 0).toBe(0);
  });

  test('KEEP_EXISTING = 32; no existing review; NEW_READY excludes production IDs', () => {
    expect(keep.length).toBe(32);
    expect(existingReview.length).toBe(0);
    expect(report.keep_existing_count).toBe(32);
    expect(report.existing_review_required_count).toBe(0);
    for (const r of keep) {
      expect(r.id).toMatch(/^si_/);
      expect(prodIds.has(r.id)).toBe(true);
      expect(r.phase2_disposition || r.import_category).toBe('KEEP_EXISTING');
    }
    for (const r of newReady) {
      expect(r.id).toMatch(/^si_/);
      expect(prodIds.has(r.id)).toBe(false);
    }
  });

  test('final NR=0 NC=0; Alfa Gym terminally resolved', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(report.alfa_gym_terminally_resolved).toBe(true);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    const alfa = staging.find(r => r.brand === 'Alfa Gym');
    expect(alfa?.import_category).toBe('NEW_READY_TO_IMPORT');
  });

  test('Class A chains: Shape House 18, BODIFIT 8, FITINN 6; estates complete', () => {
    const chain = report.chain_inventory as {
      summary: {
        final_class_a_chain_count: number;
        final_class_a_existing_count: number;
        shape_house_estate_gaps: number;
        bodifit_estate_gaps: number;
        fitinn_estate_gaps: number;
        chain_estate_gaps: number;
      };
    };
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.final_class_a_existing_count).toBe(32);
    expect(chain.summary.shape_house_estate_gaps).toBe(0);
    expect(chain.summary.bodifit_estate_gaps).toBe(0);
    expect(chain.summary.fitinn_estate_gaps).toBe(0);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(keep.filter(r => r.brand === 'Shape House').length).toBe(18);
    expect(keep.filter(r => r.brand === 'BODIFIT').length).toBe(8);
    expect(keep.filter(r => r.brand === 'FITINN').length).toBe(6);
  });

  test('approved rows pass data quality gates', () => {
    for (const r of [...keep, ...newReady]) {
      expect(r.country).toBe('Slovenia');
      expect(SLOVENIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleSloveniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    const dqExisting = report.data_quality_existing as Record<string, number>;
    const dqNew = report.data_quality_new_ready as Record<string, number>;
    expect(dqExisting.duplicate_ids).toBe(0);
    expect(dqExisting.invalid_postcodes).toBe(0);
    expect(dqExisting.invalid_coords).toBe(0);
    expect(dqExisting.fallback_coords).toBe(0);
    expect(dqExisting.mojibake).toBe(0);
    expect(dqExisting.foreign_outliers).toBe(0);
    expect(dqNew.invalid_coords).toBe(0);
    expect(dqNew.fallback_coords).toBe(0);
    expect(dqNew.centroid_coords).toBe(0);
  });

  test('cross-border, Gorizia, hotel/specialist/institutional leakage = 0', () => {
    expect(cross.italy_outliers).toBe(0);
    expect(cross.austria_outliers).toBe(0);
    expect(cross.hungary_outliers).toBe(0);
    expect(cross.croatia_outliers).toBe(0);
    expect(cross.gorica_gorizia_identity_collisions).toBe(0);
    expect(cross.italy_production_contamination).toBe(0);
    expect(hotel.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('duplicates, rebrands, city coverage gaps', () => {
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(rebrand.rebrand_conflicts ?? 0).toBe(0);
    expect(cityCov.unexplained_b_gaps).toBe(0);
    expect(cityCov.unexplained_d_gaps).toBe(0);
    expect(cityCov.material_city_gaps).toBe(0);
  });

  test('production delta, 12500 threshold, check-in 200 m, verdict', () => {
    expect(GYM_ID_PREFIX.slovenia).toBe('si_');
    expect(isSloveniaCountry('Slovenija')).toBe(true);
    expect(gymCountryTranslationKey('Slovenia')).toBe('countries.slovenia');
    expect(en.countries.slovenia).toBe('Slovenia');
    expect(normalizeGymSearchValue('Šiška')).toBe('siska');
    expect(resolveGymOrStub('si_nonexistent_test').region).toBe('Slovenia');

    const newCount = newReady.length;
    expect(report.actual_new_delta).toBe(newCount);
    expect(report.projected_catalog_after_reconciliation).toBe(CURRENT_PRODUCTION_TOTAL + newCount);
    expect(report.future_production_additions).toBe(newCount);
    expect(report.final_approved_slovenia).toBe(32 + newCount);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_after_reconciliation).toBe(false);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.slovenia_specific_radius_override).toBe(0);
    expect(report.verdict).toBe('READY FOR SLOVENIA PRODUCTION RECONCILIATION');
    expect(report.phase3_required).toBe(false);
  });
});
