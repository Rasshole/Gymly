/**
 * Russia Production QA — final read-only validation gate.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {getActiveGyms} from '../src/data/danishGyms';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {
  isPlausibleRussiaCoordinate,
  RUSSIA_POSTAL_RE,
  isRussiaCountry,
  isDisputedUkraineTerritory,
} from '../src/utils/gymCountry';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {findNearestGym} from '../src/utils/nearestGym';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const LIVE_SHA =
  '968a997d91daf6424da847f0cb7144c148b42a47bd19f2715c3e52ae4b24d020';
const EXPECTED_TOTAL = 12850;
const EXPECTED_RUSSIA = 465;
const EXPECTED_BYTES = 4014884;
const NEXT_STRESS_THRESHOLD = 15000;
const DEMOTED_ID = 'ru_c7deae1519';

const CLASS_A_COUNTS: Record<string, number> = {
  'World Class': 35,
  'X-Fit': 31,
  'Alex Fitness': 11,
  DDxFitness: 25,
  'Spirit Fitness': 2,
};

const EXPECTED_CITY_COUNTS: Record<string, number> = {
  Moscow: 361,
  'Saint Petersburg': 23,
};

const PRIOR_COUNTS: Record<string, number> = {
  Azerbaijan: 46,
  Armenia: 36,
  Georgia: 25,
  Turkey: 198,
  Belarus: 46,
  Ukraine: 105,
  Malta: 24,
  Lithuania: 61,
  Latvia: 33,
  Estonia: 69,
  Slovenia: 33,
  Croatia: 80,
  Serbia: 63,
  Kosovo: 18,
  Albania: 9,
  'Bosnia and Herzegovina': 31,
  'North Macedonia': 25,
};

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

function identityMatch(
  a: {
    name?: string;
    brand?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    lat?: number | null;
    lng?: number | null;
  },
  b: {
    name?: string;
    brand?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    lat?: number | null;
    lng?: number | null;
  },
) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.address || '').trim() === String(b.address || '').trim() &&
    String(a.postal_code || '').trim() === String(b.postal_code || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Russia').trim() === String(b.country || 'Russia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Russia Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/russia');
  const globalDir = path.join(__dirname, '../data/global-stress');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      REAL_GLOBAL_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
      OTHER_TEST_DEBT: number;
    };
  };
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{
    id: string;
    brand: string;
    name: string;
    address: string;
    postal_code: string;
    city: string;
    lat: number;
    lng: number;
  }>;
  const phase2Approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const needsReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_NEEDS_REVIEW.json'), 'utf8'),
  ) as Array<{id: string}>;
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const regionalCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps: number; material_regional_gaps: number};
  const chainAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_CLASS_A_AUDIT.json'), 'utf8'),
  ) as {estate_gaps: number; production_drift: unknown[]};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number};
  const searchMap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_SEARCH_DISPLAY.json'), 'utf8'),
  ) as {search_display_qa: string; active_russia_map_markers: number; raw_ids_surfaced: number};
  const globalStress = JSON.parse(
    fs.readFileSync(path.join(globalDir, 'GLOBAL_STRESS_QA_REPORT.json'), 'utf8'),
  ) as {verdict: string};
  const globalStressInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_GLOBAL_STRESS_INVARIANT.json'), 'utf8'),
  ) as {global_stress_qa_verdict: string; recommended_next_global_stress_threshold: number};
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const mergeReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as {delta: {insertions: number; updates: number; removals: number}};
  const shaBefore = fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(dataDir, 'RUSSIA_QA_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const russia = ALL_GYM_CENTERS.filter(c => c.id.startsWith('ru_'));

  test('frozen post-merge baseline — 12850 / Russia 465 / SHA+bytes exact', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(russia.length).toBe(EXPECTED_RUSSIA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(36);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_SHA);
    expect(bytes).toBe(EXPECTED_BYTES);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
  });

  test('inventory reconciliation A = B = C = 465', () => {
    expect(phase2Approved.length).toBe(465);
    expect(approved.length).toBe(465);
    expect(russia.length).toBe(465);
    const a = new Set(phase2Approved.map(r => r.id));
    const b = new Set(approved.map(r => r.id));
    const c = new Set(russia.map(r => r.id));
    for (const id of a) {
      expect(b.has(id)).toBe(true);
      expect(c.has(id)).toBe(true);
    }
  });

  test('Phase 1 → Phase 2 provenance — 1656 recovered, NR/NC = 0', () => {
    expect(transitions.length).toBe(1656);
    expect(needsReview.length).toBe(0);
    expect(excluded.length).toBe(1191);
    const ready = transitions.filter(t => t.phase1_category === 'READY_TO_IMPORT');
    expect(ready.length).toBe(210);
    expect(ready.filter(t => t.phase2_disposition === 'NEW_READY_TO_IMPORT').length).toBe(209);
    expect(ready.filter(t => t.phase2_disposition === 'EXCLUDED').length).toBe(1);
    expect(ready.find(t => t.id === DEMOTED_ID)?.phase2_disposition).toBe('EXCLUDED');
    const nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(1386);
    expect(regionalCov.material_d_gaps).toBe(0);
    expect(regionalCov.material_regional_gaps).toBe(0);
    expect(chainAudit.estate_gaps).toBe(0);
    expect(chainAudit.production_drift.length).toBe(0);
  });

  test('authorized material drift = 0', () => {
    for (const row of approved) {
      const live = russia.find(r => r.id === row.id);
      expect(live).toBeDefined();
      expect(identityMatch(row, live!)).toBe(true);
    }
  });

  test('merge reconstruction +465/0/0 and Class A inventory exact', () => {
    expect(mergeReport.delta.insertions).toBe(465);
    expect(mergeReport.delta.updates).toBe(0);
    expect(mergeReport.delta.removals).toBe(0);
    expect(12385 + 465).toBe(12850);

    const byBrand = russia.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    const classATotal = Object.values(CLASS_A_COUNTS).reduce((a, b) => a + b, 0);
    expect(classATotal).toBe(104);
    expect(russia.length - classATotal).toBe(361);
  });

  test('city inventory — Moscow 361, Saint Petersburg 23', () => {
    const byCity = russia.reduce<Record<string, number>>((acc, r) => {
      acc[r.city] = (acc[r.city] ?? 0) + 1;
      return acc;
    }, {});
    for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
      expect(byCity[city]).toBe(n);
    }
  });

  test('safety — non-ready buckets, demoted specialist absent, disputed territory', () => {
    const exIds = new Set(excluded.map(r => r.id));
    expect(russia.some(r => exIds.has(r.id))).toBe(false);
    expect(russia.some(r => r.id === DEMOTED_ID)).toBe(false);
    expect(russia.every(r => !isDisputedUkraineTerritory(r.lat!, r.lng!))).toBe(true);
  });

  test('production data quality — IDs, postcodes, coords, no duplicates', () => {
    for (const r of russia) {
      expect(r.id.startsWith(GYM_ID_PREFIX.russia)).toBe(true);
      expect(r.country).toBe('Russia');
      expect(RUSSIA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleRussiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('ru_')).toBe(false);
    }
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(new Set(russia.map(r => r.id)).size).toBe(465);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('infrastructure / search / check-in / global stress / QA immutability', () => {
    expect(isRussiaCountry('Russia')).toBe(true);
    expect(gymCountryTranslationKey('Russia')).toBe('countries.russia');
    expect(en.countries.russia).toBeTruthy();
    expect(resolveGymOrStub(russia[0]!.id)?.country).toBe('Russia');

    expect(searchGyms('Russia').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Россия').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Moscow').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Москва').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('World Class').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(normalizeGymSearchValue(russia[0]!.name)).not.toBe(russia[0]!.id);

    const gym: DanishGym = {
      id: russia[0]!.id,
      name: russia[0]!.name,
      city: russia[0]!.city,
      address: russia[0]!.address,
      postalCode: russia[0]!.postal_code,
      country: russia[0]!.country,
      region: 'Russia',
      latitude: russia[0]!.lat!,
      longitude: russia[0]!.lng!,
      brand: russia[0]!.brand,
      _center: russia[0] as never,
    };
    expect(findNearestGym(55.76, 37.62, getActiveGyms())?.country).toBe('Russia');
    expect(getGymLatLngForCheckIn(russia[0]!.id)).not.toBeNull();

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(201 > CHECK_IN_RADIUS_METERS).toBe(true);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).not.toBe('set_away');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).not.toBe('set_away');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    expect(globalStress.verdict).toBe('GLOBAL STRESS QA: PASS');
    expect(globalStressInv.global_stress_qa_verdict).toBe('GLOBAL STRESS QA: PASS');
    expect(globalStressInv.recommended_next_global_stress_threshold).toBe(NEXT_STRESS_THRESHOLD);
    expect(EXPECTED_TOTAL).toBeLessThan(NEXT_STRESS_THRESHOLD);

    expect(searchMap.search_display_qa).toBe('PASS');
    expect(searchMap.raw_ids_surfaced).toBe(0);
    expect(searchMap.active_russia_map_markers).toBe(465);

    expect(idempotency.idempotent).toBe(true);
    expect(idempotency.second_run.insertions).toBe(0);

    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect(historicalDebt.summary.REAL_GLOBAL_REGRESSION).toBe(0);

    expect(qaReport.verdict).toBe('RUSSIA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect((qaReport.qa_delta as {insertions: number}).insertions).toBe(0);
  });
});
