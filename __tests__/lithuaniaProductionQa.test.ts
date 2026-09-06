/**
 * Lithuania Production QA — final read-only validation gate.
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
  isPlausibleLithuaniaCoordinate,
  LITHUANIA_POSTAL_RE,
  isLithuaniaCountry,
} from '../src/utils/gymCountry';
import {formatGymDisplayName, resolveGymOrStub} from '../src/utils/gymDisplay';
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
const EXPECTED_LITHUANIA = 61;
const EXPECTED_BYTES = 3706426;

const COMING_SOON_IDS = ['lt_bc21f9653f', 'lt_4decf7f80b', 'lt_c3d4f6ba00'];

const EXPECTED_BRANDS: Record<string, number> = {
  'Gym+': 38,
  'Lemon Gym': 18,
  Impuls: 5,
};

const PRIOR_COUNTS: Record<string, number> = {
  Latvia: 33,
  Estonia: 69,
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
    String(a.country || 'Lithuania').trim() === String(b.country || 'Lithuania').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Lithuania Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/lithuania');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
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
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
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
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as unknown[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Array<{id: string; name: string; address: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    idempotent: boolean;
    first_run?: {insertions: number; updates: number; removals: number};
    second_run?: {insertions: number; updates: number; removals: number};
  };
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {
    catalog_total: number;
    assessment: string;
    architecture: string;
    crosses_12500: boolean;
    headroom_to_12500: number;
    centers_json_bytes: number;
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'LITHUANIA_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const ltCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('lt_'));
  const lithuaniaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania');

  test('frozen production baseline and QA SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(lithuaniaCenters.length).toBe(EXPECTED_LITHUANIA);
    expect(ltCenters.length).toBe(EXPECTED_LITHUANIA);
    expect(sha).toBe(LIVE_SHA);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
    expect(shaBefore).toBe(shaAfter);
    expect(bytes).toBe(EXPECTED_BYTES);
    expect(qaReport.production_modified).toBe(false);
    const delta = qaReport.qa_delta as {insertions: number; updates: number; removals: number};
    expect(delta.insertions).toBe(0);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
  });

  test('four-way ID reconciliation: KEEP 61 + NEW 0 = APPROVED 61 = PRODUCTION 61', () => {
    expect(keep.length).toBe(61);
    expect(newReady.length).toBe(0);
    expect(approved.length).toBe(61);
    expect(ltCenters.length).toBe(61);

    const keepIds = new Set(keep.map(r => r.id));
    const newIds = new Set(newReady.map((r: {id: string}) => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(ltCenters.map(r => r.id));

    expect([...keepIds, ...newIds].sort()).toEqual([...approvedIds].sort());
    expect([...approvedIds].sort()).toEqual([...prodIds].sort());

    const fourWay = qaReport.four_way_reconciliation as {
      approved_missing_from_production: string[];
      production_not_approved: string[];
    };
    expect(fourWay.approved_missing_from_production).toEqual([]);
    expect(fourWay.production_not_approved).toEqual([]);
  });

  test('original 61 unchanged; zero reconciliation delta', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }

    const original = qaReport.original_61 as {
      present: number;
      material_metadata_drift: unknown[];
    };
    expect(original.present).toBe(61);
    expect(original.material_metadata_drift).toEqual([]);

    expect(idempotency.first_run?.insertions ?? 0).toBe(0);
    expect(idempotency.first_run?.updates ?? 0).toBe(0);
    expect(idempotency.first_run?.removals ?? 0).toBe(0);
    expect(idempotency.idempotent).toBe(true);
  });

  test('brand inventory 38/18/5; Class A = 61', () => {
    const byBrand: Record<string, number> = {};
    for (const c of ltCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRANDS);

    const classA = qaReport.class_a as {
      chain_class_a_approved: number;
      class_a_chain_count: number;
      gym_plus: number;
      lemon_gym: number;
      impuls: number;
    };
    expect(classA.chain_class_a_approved).toBe(61);
    expect(classA.class_a_chain_count).toBe(3);
    expect(classA.gym_plus).toBe(38);
    expect(classA.lemon_gym).toBe(18);
    expect(classA.impuls).toBe(5);
  });

  test('coming-soon (3), excluded (39), closed (0) leakage = 0', () => {
    expect(comingSoon.length).toBe(3);
    expect(excluded.length).toBe(39);
    const prodIds = new Set(ltCenters.map(c => c.id));
    for (const id of COMING_SOON_IDS) expect(prodIds.has(id)).toBe(false);
    for (const r of excluded) expect(prodIds.has(r.id)).toBe(false);

    const cs = qaReport.coming_soon as {production_leakage: string[]; approved_leakage: string[]};
    expect(cs.production_leakage).toEqual([]);
    expect(cs.approved_leakage).toEqual([]);

    const safety = qaReport.safety as Record<string, number>;
    expect(safety.hotel_resort_ready_leakage).toBe(0);
    expect(safety.specialist_ready_leakage).toBe(0);
    expect(safety.institutional_ready_leakage).toBe(0);
    expect(safety.gym_plus_gym_exclamation_collisions).toBe(0);
  });

  test('Gym+ vs Gym! identity safety; cross-border and duplicates = 0', () => {
    expect(normalizeGymSearchValue('Gym+')).not.toBe(normalizeGymSearchValue('Gym!'));
    expect(ltCenters.some(c => c.brand === 'Gym!')).toBe(false);

    const cb = qaReport.cross_border as {
      latvia_outliers?: number;
      poland_outliers?: number;
      belarus_outliers?: number;
      russia_kaliningrad_outliers?: number;
      live_production?: {live_outliers: string[]};
    };
    expect(cb.latvia_outliers ?? 0).toBe(0);
    expect(cb.poland_outliers ?? 0).toBe(0);
    expect(cb.belarus_outliers ?? 0).toBe(0);
    expect(cb.russia_kaliningrad_outliers ?? 0).toBe(0);
    expect(cb.live_production?.live_outliers ?? []).toEqual([]);

    const dup = qaReport.duplicates as {
      hard_duplicate_conflicts: number;
      rebrand_conflicts: number;
      gym_plus_gym_exclamation_collisions: number;
    };
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    expect(dup.gym_plus_gym_exclamation_collisions).toBe(0);
    expect(new Set(ALL_GYM_CENTERS.map(c => c.id)).size).toBe(ALL_GYM_CENTERS.length);
  });

  test('data quality for all 61 Lithuania rows', () => {
    for (const c of ltCenters) {
      expect(c.id).toMatch(/^lt_[a-f0-9]{10}$/);
      expect(c.country).toBe('Lithuania');
      expect(LITHUANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleLithuaniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('lt_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    const dq = qaReport.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers=61, nearest sanity', () => {
    expect(GYM_ID_PREFIX.lithuania).toBe('lt_');
    expect(isLithuaniaCountry('Lietuva')).toBe(true);
    expect(gymCountryTranslationKey('Lithuania')).toBe('countries.lithuania');
    expect(en.countries.lithuania).toBe('Lithuania');
    expect(normalizeGymSearchValue('Klaipėda')).toBe('klaipeda');
    expect(normalizeGymSearchValue('Šiauliai')).toBe('siauliai');
    expect(normalizeGymSearchValue('Gym+')).not.toBe(normalizeGymSearchValue('Gym!'));
    expect(resolveGymOrStub('lt_nonexistent_test').region).toBe('Lithuania');

    const gpHits = searchGyms('Gym+').filter(h => h.gym.id.startsWith('lt_'));
    expect(gpHits.length).toBeGreaterThan(0);
    const sample = findCenterById('lt_70c41d18a7') ?? ltCenters[0];
    expect(formatGymDisplayName(sample)).toMatch(/Gym\+|Lemon|Impuls/i);

    const mapCenters: MapCenter[] = ltCenters.map(c => {
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
    expect(mapCenters.length).toBe(61);

    const lithuaniaGyms = getActiveGymsByCountry('Lithuania');
    expect(lithuaniaGyms.length).toBe(61);
    const nearVilnius = findNearestGym(54.6872, 25.2797, lithuaniaGyms);
    expect(nearVilnius?.id.startsWith('lt_')).toBe(true);

    const vilnius = filterMapCentersInRegion(mapCenters, {
      latitude: 54.6872,
      longitude: 25.2797,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    });
    expect(vilnius.length).toBeGreaterThan(0);
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(getGymLatLngForCheckIn(ltCenters[0].id)).not.toBeNull();

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
    expect(perf.centers_json_bytes).toBe(EXPECTED_BYTES);
    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(perf.assessment).toBe('HEALTHY');
    expect(perf.crosses_12500).toBe(false);
    expect(perf.headroom_to_12500).toBe(577);

    expect(qaReport.verdict).toBe('LITHUANIA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect(qaReport.lithuania_specific_runtime_hacks).toBe(0);
    const gates = qaReport.gates as Record<string, boolean>;
    expect(gates.reconciliation_idempotent).toBe(true);
    expect(gates.prior_country_counts_unchanged).toBe(true);
    expect(gates.gym_plus_gym_bang_collision).toBe(true);
  });
});
