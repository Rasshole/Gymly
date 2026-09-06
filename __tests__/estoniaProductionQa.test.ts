/**
 * Estonia Production QA — final read-only validation gate.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveGymsByCountry} from '../src/data/danishGyms';
import {ALL_GYM_CENTERS, findCenterById} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {
  isPlausibleEstoniaCoordinate,
  ESTONIA_POSTAL_RE,
  isEstoniaCountry,
} from '../src/utils/gymCountry';
import {
  formatGymDisplayName,
  resolveGymOrStub,
} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import type {MapCenter} from '../src/data/mapCentersData';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';

const LIVE_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const EXPECTED_TOTAL = 11923;
const EXPECTED_ESTONIA = 69;
const FITLIFE_ID = 'ee_91d7bd69f0';
const SM_FITLIFE_ID = 'sm_a5d9743343';

const EXPECTED_BRANDS: Record<string, number> = {
  MyFitness: 19,
  '24-7 Fitness': 31,
  'Gym!': 15,
  'Golden Club': 3,
  FitLife: 1,
};

const COMING_SOON_IDS = [
  'ee_d6f5429ffa',
  'ee_525d7cb043',
  'ee_5c173a5f8b',
  'ee_05114ce91a',
  'ee_cc255a409d',
];

const PRIOR_COUNTS: Record<string, number> = {
  Slovenia: 33,
  Croatia: 80,
  Serbia: 63,
  Kosovo: 18,
  Albania: 9,
  'Bosnia and Herzegovina': 31,
  'North Macedonia': 25,
  Montenegro: 26,
  Moldova: 28,
  'San Marino': 6,
  Monaco: 4,
  Andorra: 12,
  Liechtenstein: 7,
  Iceland: 27,
};

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

function identityMatch(
  a: {name?: string; brand?: string; city?: string; country?: string; lat?: number; lng?: number},
  b: {name?: string; brand?: string; city?: string; country?: string; lat?: number; lng?: number},
) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Estonia').trim() === String(b.country || 'Estonia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Estonia Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/estonia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_TOTAL_FAILURES: number;
      HISTORICAL_SUITES_FAILED: number;
      TOTAL_HISTORICAL_TEST_FAILURES: number;
    };
    prior_country_verification: {regressions: unknown[]};
  };
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; city: string; lat: number; lng: number}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string; eligibility: string; classification: string}>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string; eligibility: string; classification: string}>;
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Array<{id: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run?: {insertions: number; updates: number; removals: number}};
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {
    catalog_total: number;
    assessment: string;
    architecture: string;
    crosses_12500: boolean;
    headroom_to_12500: number;
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'ESTONIA_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'ESTONIA_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const eeCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('ee_'));
  const estoniaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Estonia');

  test('frozen production baseline and QA SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(estoniaCenters.length).toBe(EXPECTED_ESTONIA);
    expect(eeCenters.length).toBe(EXPECTED_ESTONIA);
    expect(sha).toBe(LIVE_SHA);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
    expect(shaBefore).toBe(shaAfter);
    expect(qaReport.production_modified).toBe(false);
    const delta = qaReport.qa_delta as {insertions: number; updates: number; removals: number};
    expect(delta.insertions).toBe(0);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
  });

  test('four-way ID reconciliation: KEEP 68 + NEW 1 = APPROVED 69 = PRODUCTION 69', () => {
    expect(keep.length).toBe(68);
    expect(newReady.length).toBe(1);
    expect(approved.length).toBe(69);
    expect(eeCenters.length).toBe(69);

    const keepIds = new Set(keep.map(r => r.id));
    const newIds = new Set(newReady.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(eeCenters.map(r => r.id));

    expect([...keepIds, ...newIds].sort()).toEqual([...approvedIds].sort());
    expect([...approvedIds].sort()).toEqual([...prodIds].sort());

    const fourWay = qaReport.four_way_reconciliation as {
      approved_missing_from_production: string[];
      production_not_approved: string[];
    };
    expect(fourWay.approved_missing_from_production).toEqual([]);
    expect(fourWay.production_not_approved).toEqual([]);
  });

  test('original 68 unchanged; FitLife exact identity', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }

    const fitlife = findCenterById(FITLIFE_ID)!;
    expect(fitlife.name).toBe('FitLife Tartu Eeden');
    expect(fitlife.brand).toBe('FitLife');
    expect(fitlife.address).toMatch(/Kalda tee 1c/i);
    expect(fitlife.postal_code).toBe('50703');
    expect(fitlife.city).toBe('Tartu');
    expect(fitlife.country).toBe('Estonia');
    expect(fitlife.lat).toBeCloseTo(58.3731282, 5);
    expect(fitlife.lng).toBeCloseTo(26.751225, 5);
    expect(fitlife.is_active).toBe(true);
    expect(fitlife.is_coming_soon).toBe(false);

    const fitlifeApproved = approved.find(r => r.id === FITLIFE_ID)!;
    expect(fitlifeApproved.eligibility).toBe('SMALL_MARKET_INDEPENDENT');
    expect(fitlifeApproved.classification).toBe('A_CONVENTIONAL_PUBLIC_GYM');
    expect(eeCenters.filter(c => c.id === FITLIFE_ID).length).toBe(1);
  });

  test('brand inventory 19/31/15/3/1; Class A = 68; independent = 1', () => {
    const byBrand: Record<string, number> = {};
    for (const c of eeCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRANDS);

    const classA = qaReport.class_a as {
      chain_class_a: number;
      myfitness: number;
      '24_7_fitness': number;
      gym_bang: number;
      golden_club: number;
      small_market_independent: number;
    };
    expect(classA.chain_class_a).toBe(68);
    expect(classA.myfitness).toBe(19);
    expect(classA['24_7_fitness']).toBe(31);
    expect(classA.gym_bang).toBe(15);
    expect(classA.golden_club).toBe(3);
    expect(classA.small_market_independent).toBe(1);
  });

  test('coming-soon (5), excluded (29), closed (0) leakage = 0', () => {
    expect(comingSoon.length).toBe(5);
    expect(excluded.length).toBe(29);
    const prodIds = new Set(eeCenters.map(c => c.id));
    for (const id of COMING_SOON_IDS) expect(prodIds.has(id)).toBe(false);
    for (const r of excluded) expect(prodIds.has(r.id)).toBe(false);

    const safety = qaReport.safety as Record<string, number>;
    expect(safety.hotel_resort_ready_leakage).toBe(0);
    expect(safety.specialist_ready_leakage).toBe(0);
    expect(safety.institutional_ready_leakage).toBe(0);
  });

  test('cross-border, duplicates, rebrand = 0', () => {
    const cb = qaReport.cross_border as {
      latvia_ready_outliers?: number;
      russia_ready_outliers?: number;
      finland_ready_outliers?: number;
      valga_valka_identity_collisions?: number;
      narva_ivangorod_identity_collisions?: number;
      live_production?: {
        latvia_outliers: number;
        russia_outliers: number;
        finland_outliers: number;
        live_outliers: string[];
      };
    };
    expect(cb.latvia_ready_outliers ?? 0).toBe(0);
    expect(cb.russia_ready_outliers ?? 0).toBe(0);
    expect(cb.finland_ready_outliers ?? 0).toBe(0);
    expect(cb.valga_valka_identity_collisions ?? 0).toBe(0);
    expect(cb.narva_ivangorod_identity_collisions ?? 0).toBe(0);
    expect(cb.live_production?.live_outliers ?? []).toEqual([]);

    const dup = qaReport.duplicates as {hard_duplicate_conflicts: number; rebrand_conflicts: number};
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    expect(new Set(ALL_GYM_CENTERS.map(c => c.id)).size).toBe(ALL_GYM_CENTERS.length);
  });

  test('data quality for all 69 Estonia rows', () => {
    for (const c of eeCenters) {
      expect(c.id).toMatch(/^ee_[a-f0-9]{10}$/);
      expect(c.country).toBe('Estonia');
      expect(ESTONIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleEstoniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('ee_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    const dq = qaReport.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map, nearest, FitLife vs San Marino separation', () => {
    expect(GYM_ID_PREFIX.estonia).toBe('ee_');
    expect(isEstoniaCountry('Eesti')).toBe(true);
    expect(gymCountryTranslationKey('Estonia')).toBe('countries.estonia');
    expect(en.countries.estonia).toBe('Estonia');
    expect(normalizeGymSearchValue('Pärnu')).toBe('parnu');
    expect(resolveGymOrStub('ee_nonexistent_test').region).toBe('Estonia');

    const fitlifeHits = searchGyms('FitLife').filter(h => h.gym.id === FITLIFE_ID);
    expect(fitlifeHits.length).toBeGreaterThan(0);
    const smFitlife = findCenterById(SM_FITLIFE_ID);
    expect(smFitlife?.country).toBe('San Marino');
    expect(formatGymDisplayName(findCenterById(FITLIFE_ID)!).match(/FitLife/i)).toBeTruthy();

    const mapCenters: MapCenter[] = eeCenters.map(c => {
      const map = getMarkerMapCoordinate(c.id, c.lat!, c.lng!);
      return {
        id: c.id,
        name: c.name,
        latitude: c.lat!,
        longitude: c.lng!,
        mapLatitude: map.latitude,
        mapLongitude: map.longitude,
        brand: c.brand,
        friendsActiveCount: 0,
        totalActiveCount: 0,
        logoUrl: null,
        country: c.country,
      };
    });
    expect(mapCenters.length).toBe(69);
    expect(mapCenters.filter(c => c.id === FITLIFE_ID).length).toBe(1);

    const nearFitlife = findNearestGym(
      58.3731,
      26.7512,
      getActiveGymsByCountry('Estonia'),
    );
    expect(nearFitlife?.id).toBe(FITLIFE_ID);

    const tartu = filterMapCentersInRegion(mapCenters, {
      latitude: 58.37,
      longitude: 26.75,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
    expect(tartu.some(c => c.id === FITLIFE_ID)).toBe(true);
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(getGymLatLngForCheckIn(FITLIFE_ID)).not.toBeNull();

    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
  });

  test('prior-country counts unchanged; idempotency; performance; READY verdict', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect(historicalDebt.prior_country_verification.regressions).toEqual([]);
    expect(idempotency.idempotent).toBe(true);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);

    expect(perf.catalog_total).toBe(EXPECTED_TOTAL);
    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(perf.assessment).toBe('HEALTHY');
    expect(perf.crosses_12500).toBe(false);
    expect(perf.headroom_to_12500).toBe(577);

    expect(qaReport.verdict).toBe('ESTONIA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    const gates = qaReport.gates as Record<string, boolean>;
    expect(gates.reconciliation_idempotent).toBe(true);
    expect(gates.prior_country_counts_unchanged).toBe(true);
  });
});
