/**
 * Croatia Phase 2 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleCroatiaCoordinate,
  CROATIA_POSTAL_RE,
  isCroatiaCountry,
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

describe('Croatia Phase 2 staging (production reconciliation)', () => {
  const dataDir = path.join(__dirname, '../data/croatia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(phase2Dir, 'CROATIA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const p1Snap = JSON.parse(
    fs.readFileSync(path.join(phase2Dir, 'CROATIA_PHASE1_STAGING_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const reconciliation = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json'), 'utf8'),
  ) as {
    phase1_ready: number;
    existing_production: number;
    exact_id_match_count: number;
    metadata_drift_count: number;
    ready_missing_from_production: string[];
    production_not_in_phase1_ready: string[];
  };
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as Row[];
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'croatia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {unexplained_b_gaps: number; unexplained_d_gaps: number};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const hotel = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_HOTEL_RESORT_AUDIT.json'), 'utf8'),
  ) as {hotel_resort_ready_leakage: number};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 11921 / Croatia 80 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('hr_')).length).toBe(80);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(existingSnap.length).toBe(80);
  });

  test('prior-country regressions including Serbia 63', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
  });

  test('Phase 1 recovery: 125 rows, all IDs preserved', () => {
    expect(p1Snap.length).toBe(125);
    expect(new Set(p1Snap.map(r => r.id)).size).toBe(125);
    expect(report.phase1_rows_recovered).toBe(125);
    expect(report.phase1_ids_missing).toBe(0);
  });

  test('80-vs-80 reconciliation: exact ID match, no drift', () => {
    expect(reconciliation.phase1_ready).toBe(80);
    expect(reconciliation.existing_production).toBe(80);
    expect(reconciliation.exact_id_match_count).toBe(80);
    expect(reconciliation.ready_missing_from_production).toEqual([]);
    expect(reconciliation.production_not_in_phase1_ready).toEqual([]);
    expect(reconciliation.metadata_drift_count).toBe(0);
  });

  test('KEEP_EXISTING = 80; NEW_READY = 0; no existing review required', () => {
    expect(keep.length).toBe(80);
    expect(newReady.length).toBe(0);
    expect(existingReview.length).toBe(0);
    expect(report.keep_existing_count).toBe(80);
    expect(report.new_ready_to_import_count).toBe(0);
    expect(report.existing_review_required_count).toBe(0);
    expect(report.final_approved_croatia).toBe(80);
    for (const r of keep) {
      expect(r.id).toMatch(/^hr_/);
      expect(r.phase2_disposition || r.import_category).toBe('KEEP_EXISTING');
    }
    for (const r of newReady) {
      expect(r.id).toMatch(/^hr_/);
    }
  });

  test('final NR=0 NC=0; coming-soon terminally resolved (8)', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(report.coming_soon).toBe(8);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'COMING_SOON').length).toBe(8);
  });

  test('Class A chains: 5 chains, 80 KEEP, estates complete', () => {
    const chain = report.chain_inventory as {
      summary: {
        final_class_a_chain_count: number;
        final_class_a_existing_count: number;
        final_class_a_new_ready_count: number;
        chain_estate_gaps: number;
      };
    };
    expect(chain.summary.final_class_a_chain_count).toBe(5);
    expect(chain.summary.final_class_a_existing_count).toBe(80);
    expect(chain.summary.final_class_a_new_ready_count).toBe(0);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(keep.filter(r => r.brand === 'Gyms4you').length).toBe(48);
    expect(keep.filter(r => r.brand === 'THE Fitness').length).toBe(21);
    expect(keep.filter(r => r.brand === 'Gibi Gib').length).toBe(4);
    expect(keep.filter(r => r.brand === 'Fitness Centar Joker').length).toBe(4);
    expect(keep.filter(r => r.brand === 'Multihealth').length).toBe(3);
  });

  test('approved rows pass data quality gates', () => {
    for (const r of keep) {
      expect(r.country).toBe('Croatia');
      expect(CROATIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleCroatiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(dq.duplicate_ids).toBe(0);
    expect(dq.invalid_postcodes).toBe(0);
    expect(dq.invalid_coords).toBe(0);
    expect(dq.fallback_coords).toBe(0);
    expect(dq.mojibake).toBe(0);
    expect(dq.foreign_outliers).toBe(0);
  });

  test('cross-border, Neum, Brod; hotel/specialist/institutional leakage = 0', () => {
    expect(cross.slovenia_ready).toBe(0);
    expect(cross.bosnia_ready).toBe(0);
    expect(cross.serbia_ready).toBe(0);
    expect(cross.montenegro_ready).toBe(0);
    expect(cross.hungary_ready).toBe(0);
    expect(cross.italy_ready).toBe(0);
    expect(cross.neum_croatia_collisions).toBe(0);
    expect(cross.brod_identity_collisions).toBe(0);
    expect(hotel.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('duplicates, rebrands, city coverage B/D gaps', () => {
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(cityCov.unexplained_b_gaps).toBe(0);
    expect(cityCov.unexplained_d_gaps).toBe(0);
  });

  test('production delta, 12500 threshold, check-in 200 m, verdict', () => {
    expect(GYM_ID_PREFIX.croatia).toBe('hr_');
    expect(isCroatiaCountry('Hrvatska')).toBe(true);
    expect(gymCountryTranslationKey('Croatia')).toBe('countries.croatia');
    expect(en.countries.croatia).toBe('Croatia');
    expect(normalizeGymSearchValue('Varaždin')).toBe('varazdin');
    expect(resolveGymOrStub('hr_nonexistent_test').region).toBe('Croatia');

    expect(report.projected_catalog_after_reconciliation).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.future_production_additions).toBe(0);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_after_reconciliation).toBe(false);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.verdict).toBe('READY FOR CROATIA PRODUCTION RECONCILIATION');
    expect(report.phase3_required).toBe(false);
  });
});
