/**
 * Estonia Deep Phase 1 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleEstoniaCoordinate,
  ESTONIA_POSTAL_RE,
  isEstoniaCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11922;
const LIVE_PRODUCTION_SHA256 =
  '18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab';

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
  is_active?: boolean;
  is_coming_soon?: boolean;
};

const fakeGym = (partial: Record<string, string>) => ({
  id: partial.id ?? 'ee_probe',
  name: partial.name ?? 'Probe',
  brand: partial.brand ?? 'Probe',
  city: partial.city ?? 'Tallinn',
  country: 'Estonia',
  address: 'Test 1',
  postal_code: '10111',
  lat: 59.43,
  lng: 24.75,
});

describe('Estonia Deep Phase 1 staging (existing production)', () => {
  const dataDir = path.join(__dirname, '../data/estonia');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_STAGING.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number; multilingual_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_CHAIN_ESTATE_AUDIT.json'), 'utf8'),
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

  test('production frozen at 11922 / Estonia 68 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(68);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ee_')).length).toBe(68);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_estonia).toBe(68);
    expect(report.existing_estonia_production).toBe(true);
    expect(existingSnap.length).toBe(68);
  });

  test('prior-country counts unchanged (SI 33 / HR 80 / RS 63 / IS 27)', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging counts reconcile: 103 total = 68 READY + 8 NR + 5 CS + 22 EXCLUDED', () => {
    expect(staging.length).toBe(103);
    expect(ready.length).toBe(68);
    expect(report.ready_count).toBe(68);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(68);
    expect(sc.NEEDS_REVIEW).toBe(8);
    expect(sc.COMING_SOON).toBe(5);
    expect(sc.EXCLUDED).toBe(22);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(68 + 8 + 5 + 22).toBe(103);
  });

  test('existing production 68/68 overlap — zero new merge delta', () => {
    const rec = report.existing_production_reconciliation as {
      exact_id_overlap: number;
      ready_missing_from_production: string[];
      production_not_in_phase1_ready: string[];
    };
    expect(rec.exact_id_overlap).toBe(68);
    expect(rec.ready_missing_from_production).toEqual([]);
    expect(rec.production_not_in_phase1_ready).toEqual([]);
    expect(report.actual_potential_new_delta).toBe(0);
    expect(report.projected_catalog_after_future_merge).toBe(CURRENT_PRODUCTION_TOTAL);
  });

  test('Class A chains: MyFitness 19, 24-7 31, Gym! 15, Golden Club 3', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['MyFitness']).toBe(19);
    expect(byBrand['24-7 Fitness']).toBe(31);
    expect(byBrand['Gym!']).toBe(15);
    expect(byBrand['Golden Club']).toBe(3);
    expect(chain.summary.final_class_a_chain_count).toBe(4);
    expect(chain.summary.final_class_a_ready_count).toBe(68);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    expect(report.market_model).toBe('CHAIN_LED');
  });

  test('READY rows pass data quality gates', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^ee_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Estonia');
      expect(r.is_active).toBe(true);
      expect(r.is_coming_soon).not.toBe(true);
      expect(ESTONIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleEstoniaCoordinate(r.lat!, r.lng!)).toBe(true);
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

  test('cross-border, Valga/Valka, Narva/Ivangorod, leakage = 0', () => {
    expect(cross.latvia_ready_outliers).toBe(0);
    expect(cross.russia_ready_outliers).toBe(0);
    expect(cross.finland_ready_outliers).toBe(0);
    expect(cross.valga_valka_identity_collisions).toBe(0);
    expect(cross.narva_ivangorod_identity_collisions).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('duplicates and rebrand conflicts = 0', () => {
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.multilingual_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('country infra, search normalization, check-in 200 m, projected scale, verdict', () => {
    expect(GYM_ID_PREFIX.estonia).toBe('ee_');
    expect(isEstoniaCountry('Estonia')).toBe(true);
    expect(isEstoniaCountry('Eesti')).toBe(true);
    expect(isEstoniaCountry('Latvia')).toBe(false);
    expect(gymCountryTranslationKey('Estonia')).toBe('countries.estonia');
    expect((en as {countries: {estonia: string}}).countries.estonia).toBe('Estonia');
    expect((da as {countries: {estonia?: string}}).countries.estonia).toBe('Estland');
    expect((sv as {countries: {estonia?: string}}).countries.estonia).toBe('Estland');
    expect((nb as {countries: {estonia?: string}}).countries.estonia).toBe('Estland');
    expect(resolveGymOrStub('ee_nonexistent_test').region).toBe('Estonia');
    expect(normalizeGymSearchValue('Pärnu')).toBe('parnu');
    expect(normalizeGymSearchValue('Jõhvi')).toBe('johvi');
    expect(normalizeGymSearchValue('Võru')).toBe('voru');
    const entry = buildGymSearchEntry(
      fakeGym({id: 'ee_probe', city: 'Tallinn', brand: 'MyFitness'}),
    );
    expect(entry.haystack).toMatch(/estonia|eesti/i);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(report.projected_crosses_12500).toBe(false);
    expect(report.global_stress_qa_will_be_required_after_future_merge).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('ESTONIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION');
  });
});
