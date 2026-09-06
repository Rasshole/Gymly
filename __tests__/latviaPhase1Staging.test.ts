/**
 * Latvia Deep Phase 1 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLatviaCoordinate,
  LATVIA_POSTAL_RE,
  isLatviaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11923;
const LIVE_PRODUCTION_SHA256 =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';

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
  eligibility?: string;
  classification?: string;
};

const fakeGym = (partial: Record<string, string>) => ({
  id: partial.id ?? 'lv_probe',
  name: partial.name ?? 'Probe',
  brand: partial.brand ?? 'Probe',
  city: partial.city ?? 'Rīga',
  country: 'Latvia',
  address: 'Test 1',
  postal_code: '1050',
  lat: 56.95,
  lng: 24.11,
});

describe('Latvia Deep Phase 1 staging (existing production)', () => {
  const dataDir = path.join(__dirname, '../data/latvia');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_STAGING.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number; multilingual_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_CHAIN_ESTATE_AUDIT.json'), 'utf8'),
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

  test('production frozen at 11923 / Latvia 33 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('lv_')).length).toBe(33);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_latvia).toBe(33);
    expect(report.existing_latvia_production).toBe(true);
    expect(existingSnap.length).toBe(33);
  });

  test('prior-country counts unchanged (EE 69 / SI 33 / HR 80 / IS 27)', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging counts reconcile: 74 total = 33 READY + 28 NR + 1 CS + 12 EXCLUDED', () => {
    expect(staging.length).toBe(74);
    expect(ready.length).toBe(33);
    expect(report.ready_count).toBe(33);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(33);
    expect(sc.NEEDS_REVIEW).toBe(28);
    expect(sc.COMING_SOON).toBe(1);
    expect(sc.EXCLUDED).toBe(12);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(33 + 28 + 1 + 12).toBe(74);
  });

  test('existing production 33/33 overlap — zero new merge delta', () => {
    const rec = report.existing_production_reconciliation as {
      exact_id_overlap: number;
      ready_missing_from_production: string[];
      production_not_in_phase1_ready: string[];
    };
    expect(rec.exact_id_overlap).toBe(33);
    expect(rec.ready_missing_from_production).toEqual([]);
    expect(rec.production_not_in_phase1_ready).toEqual([]);
    expect(report.actual_potential_new_delta).toBe(0);
    expect(report.genuinely_new_ready).toBe(0);
    expect(report.projected_catalog_after_future_merge).toBe(CURRENT_PRODUCTION_TOTAL);
  });

  test('Class A chains: MyFitness 15, Lemon Gym 8, Gym! 10 — complete estates', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['MyFitness']).toBe(15);
    expect(byBrand['Lemon Gym']).toBe(8);
    expect(byBrand['Gym!']).toBe(10);
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.final_class_a_ready_count).toBe(33);
    expect(chain.summary.chain_estate_gaps).toBe(0);
  });

  test('market model CHAIN_LED; postcode NNNN; no READY leakage', () => {
    expect(report.market_model).toBe('CHAIN_LED');
    expect(String(report.postcode_model)).toMatch(/NNNN/);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('cross-border, Valka/Valga, duplicates = 0 for READY', () => {
    expect(cross.valka_valga_identity_collisions).toBe(0);
    expect(cross.russia_ready_outliers).toBe(0);
    expect(cross.belarus_ready_outliers).toBe(0);
    expect(cross.lithuania_ready_outliers).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.multilingual_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  test('READY data quality — valid lv_* IDs, postcodes, coordinates', () => {
    for (const r of ready) {
      expect(r.id).toMatch(/^lv_[a-f0-9]{10}$/);
      expect(r.country).toBe('Latvia');
      expect(LATVIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleLatviaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('lv_')).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('country/ID resolution, search aliases, check-in boundaries', () => {
    expect(GYM_ID_PREFIX.latvia).toBe('lv_');
    expect(isLatviaCountry('Latvija')).toBe(true);
    expect(gymCountryTranslationKey('Latvia')).toBe('countries.latvia');
    expect(en.countries.latvia).toBe('Latvia');
    expect(normalizeGymSearchValue('Liepāja')).toBe('liepaja');
    expect(normalizeGymSearchValue('Rīga')).toBe('riga');
    expect(resolveGymOrStub('lv_nonexistent_test').region).toBe('Latvia');

    const entry = buildGymSearchEntry(
      fakeGym({id: 'lv_probe', city: 'Rīga', brand: 'MyFitness'}),
    );
    expect(entry.haystack).toMatch(/latvia|latvija|myfitness/i);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);
  });

  test('scale projection and Phase 2 verdict', () => {
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.projected_remaining_headroom).toBe(577);
    expect(report.global_stress_qa_will_be_required_after_future_merge).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.verdict).toBe('LATVIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION');
    expect(report.phase2_required).toBe(true);
  });
});
