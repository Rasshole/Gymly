/**
 * Slovenia Deep Phase 1 staging — existing production reconciliation (no catalog writes).
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
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
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
  coord_source?: string | null;
};

describe('Slovenia Deep Phase 1 staging (existing production)', () => {
  const dataDir = path.join(__dirname, '../data/slovenia');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_STAGING.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE1_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      final_class_a_chain_count: number;
      final_class_a_ready_count: number;
      chain_estate_gaps: number;
    };
  };
  const shaBefore = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase1Dir, 'PHASE1_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 11921 / Slovenia 32 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(32);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('si_')).length).toBe(32);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_slovenia).toBe(32);
    expect(report.existing_slovenia_production).toBe(true);
    expect(existingSnap.length).toBe(32);
  });

  test('prior-country counts including Croatia 80 / Serbia 63', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
  });

  test('staging counts reconcile: 38 total = 32 READY + 1 NR + 5 EXCLUDED', () => {
    expect(staging.length).toBe(38);
    expect(ready.length).toBe(32);
    expect(report.ready_count).toBe(32);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(32);
    expect(sc.NEEDS_REVIEW).toBe(1);
    expect(sc.EXCLUDED).toBe(5);
    expect(sc.COMING_SOON ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(32 + 1 + 5).toBe(38);
  });

  test('existing production 32/32 overlap — zero new merge delta', () => {
    const rec = report.existing_production_reconciliation as {
      exact_overlap: number;
      ready_missing_from_production: string[];
      production_not_in_phase1_ready: string[];
    };
    expect(rec.exact_overlap).toBe(32);
    expect(rec.ready_missing_from_production).toEqual([]);
    expect(rec.production_not_in_phase1_ready).toEqual([]);
    expect(report.actual_potential_new_delta).toBe(0);
    expect(report.projected_catalog_after_future_merge).toBe(CURRENT_PRODUCTION_TOTAL);
  });

  test('Class A chains: FITINN 6, BODIFIT 8, Shape House 18', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand.FITINN).toBe(6);
    expect(byBrand.BODIFIT).toBe(8);
    expect(byBrand['Shape House']).toBe(18);
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.final_class_a_ready_count).toBe(32);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(report.market_model).toBe('CHAIN_LED');
  });

  test('READY rows pass data quality gates', () => {
    for (const r of ready) {
      expect(r.country).toBe('Slovenia');
      expect(SLOVENIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleSloveniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(dq.invalid_ids).toBe(0);
    expect(dq.invalid_postcodes).toBe(0);
    expect(dq.invalid_coordinates).toBe(0);
    expect(dq.fallback_coordinates).toBe(0);
    expect(dq.missing_required_fields).toBe(0);
    expect(dq.mojibake).toBe(0);
  });

  test('cross-border, Gorizia, hotel/specialist/institutional leakage = 0', () => {
    expect(cross.italy_ready).toBe(0);
    expect(cross.austria_ready).toBe(0);
    expect(cross.hungary_ready).toBe(0);
    expect(cross.croatia_ready).toBe(0);
    expect(cross.gorica_gorizia_collisions).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('duplicates and rebrand conflicts = 0', () => {
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('country infra, check-in 200 m, projected scale, verdict', () => {
    expect(GYM_ID_PREFIX.slovenia).toBe('si_');
    expect(isSloveniaCountry('Slovenija')).toBe(true);
    expect(gymCountryTranslationKey('Slovenia')).toBe('countries.slovenia');
    expect(en.countries.slovenia).toBe('Slovenia');
    expect(normalizeGymSearchValue('Domžale')).toBe('domzale');
    expect(resolveGymOrStub('si_nonexistent_test').region).toBe('Slovenia');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(report.projected_crosses_12500).toBe(false);
    expect(report.global_stress_qa_will_be_required_after_future_merge).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('SLOVENIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION');
  });
});
