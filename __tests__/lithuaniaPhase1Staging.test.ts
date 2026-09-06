/**
 * Lithuania Deep Phase 1 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLithuaniaCoordinate,
  LITHUANIA_POSTAL_RE,
  isLithuaniaCountry,
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
  id: partial.id ?? 'lt_probe',
  name: partial.name ?? 'Probe',
  brand: partial.brand ?? 'Probe',
  city: partial.city ?? 'Vilnius',
  country: 'Lithuania',
  address: 'Test 1',
  postal_code: '01103',
  lat: 54.69,
  lng: 25.28,
});

describe('Lithuania Deep Phase 1 staging (existing production)', () => {
  const dataDir = path.join(__dirname, '../data/lithuania');
  const phase1Dir = path.join(dataDir, 'phase1');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_STAGING.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    diacritic_duplicate_conflicts: number;
    multilingual_duplicate_conflicts: number;
    gym_plus_gym_exclamation_collisions: number;
  };
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE1_CHAIN_ESTATE_AUDIT.json'), 'utf8'),
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

  test('production frozen at 11923 / Lithuania 61 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('lt_')).length).toBe(61);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.baseline_lithuania).toBe(61);
    expect(report.existing_lithuania_production).toBe(true);
    expect(existingSnap.length).toBe(61);
  });

  test('prior-country counts unchanged (LV 33 / EE 69 / SI 33 / HR 80 / IS 27)', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging counts reconcile: 103 total = 61 READY + 24 NR + 3 CS + 15 EXCLUDED', () => {
    expect(staging.length).toBe(103);
    expect(ready.length).toBe(61);
    expect(report.ready_count).toBe(61);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(61);
    expect(sc.NEEDS_REVIEW).toBe(24);
    expect(sc.COMING_SOON).toBe(3);
    expect(sc.EXCLUDED).toBe(15);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(61 + 24 + 3 + 15).toBe(103);
  });

  test('existing production 61/61 overlap — zero new merge delta', () => {
    const rec = report.existing_production_reconciliation as {
      exact_id_overlap: number;
      ready_missing_from_production: string[];
      production_not_in_phase1_ready: string[];
    };
    expect(rec.exact_id_overlap).toBe(61);
    expect(rec.ready_missing_from_production).toEqual([]);
    expect(rec.production_not_in_phase1_ready).toEqual([]);
    expect(report.actual_potential_new_delta).toBe(0);
    expect(report.genuinely_new_ready).toBe(0);
    expect(report.projected_catalog_after_future_merge).toBe(CURRENT_PRODUCTION_TOTAL);
  });

  test('Class A chains: Gym+ 38, Lemon Gym 18, Impuls 5 — complete estates', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Gym+']).toBe(38);
    expect(byBrand['Lemon Gym']).toBe(18);
    expect(byBrand['Impuls']).toBe(5);
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.final_class_a_ready_count).toBe(61);
    expect(chain.summary.chain_estate_gaps).toBe(0);
  });

  test('market model CHAIN_LED; postcode NNNNN; no READY leakage', () => {
    expect(report.market_model).toBe('CHAIN_LED');
    expect(String(report.postcode_model)).toMatch(/NNNNN/);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
  });

  test('Gym+ vs Gym! identity safety — zero collisions', () => {
    expect(dup.gym_plus_gym_exclamation_collisions).toBe(0);
    expect(report.gym_plus_gym_exclamation_identity_collisions).toBe(0);
    expect(normalizeGymSearchValue('Gym+')).not.toBe(normalizeGymSearchValue('Gym!'));
    const gymPlus = ready.filter(r => r.brand === 'Gym+');
    expect(gymPlus.length).toBe(38);
    expect(ready.some(r => r.brand === 'Gym!')).toBe(false);
  });

  test('cross-border, duplicates = 0 for READY', () => {
    expect(cross.latvia_ready_outliers).toBe(0);
    expect(cross.poland_ready_outliers).toBe(0);
    expect(cross.belarus_ready_outliers).toBe(0);
    expect(cross.russia_kaliningrad_ready_outliers).toBe(0);
    expect(cross.gym_plus_gym_exclamation_collisions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.multilingual_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  test('READY data quality — valid lt_* IDs, postcodes, coordinates', () => {
    for (const r of ready) {
      expect(r.id).toMatch(/^lt_[a-f0-9]{10}$/);
      expect(r.country).toBe('Lithuania');
      expect(LITHUANIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleLithuaniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('lt_')).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('country/ID resolution, search aliases, check-in boundaries', () => {
    expect(GYM_ID_PREFIX.lithuania).toBe('lt_');
    expect(isLithuaniaCountry('Lietuva')).toBe(true);
    expect(gymCountryTranslationKey('Lithuania')).toBe('countries.lithuania');
    expect(en.countries.lithuania).toBe('Lithuania');
    expect(normalizeGymSearchValue('Vilnius')).toBe('vilnius');
    expect(normalizeGymSearchValue('Kaunas')).toBe('kaunas');
    expect(normalizeGymSearchValue('Klaipėda')).toBe('klaipeda');
    expect(normalizeGymSearchValue('Gym+')).not.toBe(normalizeGymSearchValue('Gym!'));
    expect(resolveGymOrStub('lt_nonexistent_test').region).toBe('Lithuania');

    const entry = buildGymSearchEntry(
      fakeGym({id: 'lt_probe', city: 'Vilnius', brand: 'Gym+'}),
    );
    expect(entry.haystack).toMatch(/lithuania|lietuva|gym\+/i);

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
    expect(report.verdict).toBe(
      'LITHUANIA PHASE 2 REQUIRED — EXISTING PRODUCTION RECONCILIATION',
    );
    expect(report.phase2_required).toBe(true);
  });
});
