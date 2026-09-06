/**
 * Malta Production QA — final read-only validation gate.
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
  isPlausibleMaltaCoordinate,
  MALTA_POSTAL_RE,
  isMaltaCountry,
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
  '286729e8a8228863be19cf9f88108f4ebf91d2f9974c04145900622e444fed83';
const EXPECTED_TOTAL = 11929;
const EXPECTED_MALTA = 24;
const EXPECTED_BYTES = 3708345;

const NEW_READY_IDS = [
  'mt_2f5b8d74db',
  'mt_e99920262f',
  'mt_56d27e8f31',
  'mt_77de3a4365',
  'mt_69e8de5961',
  'mt_decf1d09bc',
];

const COMING_SOON_ID = 'mt_75a13770ff';
const FITNESS_CAFE_ID = 'mt_ba5266dbb1';

const EXPECTED_BRANDS: Record<string, number> = {
  'Best Gyms Malta': 10,
  '24/7 Fitness Club': 4,
  'Challenger Fitness': 4,
  'Fort Fitness': 2,
  Cynergi: 1,
  ActiveZone: 1,
  'Kinetika Gozo': 2,
};

const PRIOR_COUNTS: Record<string, number> = {
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
    String(a.country || 'Malta').trim() === String(b.country || 'Malta').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Malta Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/malta');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
      HISTORICAL_SUITES_FAILED: number;
      TOTAL_HISTORICAL_TEST_FAILURES: number;
    };
    prior_country_verification: {regressions: unknown[]};
  };
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
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
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
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
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Array<{id: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const closed = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_CLOSED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const originalSnap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_EXISTING_PRODUCTION_SNAPSHOT.json'), 'utf8'),
  ) as Array<{id: string; name: string; brand: string; address: string; postal_code: string; city: string; lat: number; lng: number}>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    idempotent: boolean;
    second_run?: {insertions: number; updates: number; removals: number};
  };
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {
    catalog_total: number;
    assessment: string;
    architecture: string;
    crosses_12500: boolean;
    headroom_to_12500: number;
    centers_json_bytes: number;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_DUPLICATE_AUDIT.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; rebrand_duplicate_conflicts: number};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as {live_outliers: string[]; gozo_country_errors: number};
  const searchMap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_SEARCH_MAP.json'), 'utf8'),
  ) as {
    map_active_markers: number;
    nearest_failures: unknown[];
    search_failures: unknown[];
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const mtCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_'));
  const maltaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Malta');

  test('frozen production baseline and QA SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(maltaCenters.length).toBe(EXPECTED_MALTA);
    expect(mtCenters.length).toBe(EXPECTED_MALTA);
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

  test('four-way ID reconciliation: KEEP 18 + NEW 6 = APPROVED 24 = PRODUCTION 24', () => {
    expect(keep.length).toBe(18);
    expect(newReady.length).toBe(6);
    expect(existingReview.length).toBe(0);
    expect(comingSoon.length).toBe(1);
    expect(excluded.length).toBe(73);
    expect(closed.length).toBe(3);
    expect(approved.length).toBe(24);

    const keepIds = new Set(keep.map(r => r.id));
    const newIds = new Set(newReady.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(mtCenters.map(r => r.id));

    expect([...keepIds].filter(id => newIds.has(id))).toEqual([]);
    expect([...keepIds, ...newIds].sort()).toEqual([...approvedIds].sort());
    expect([...approvedIds].sort()).toEqual([...prodIds].sort());
  });

  test('original 18 present with zero material drift', () => {
    for (const s of originalSnap) {
      const p = findCenterById(s.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(s, p)).toBe(true);
    }
    const orig = qaReport.original_18 as {
      present: number;
      material_metadata_drift: unknown[];
    };
    expect(orig.present).toBe(18);
    expect(orig.material_metadata_drift).toEqual([]);
  });

  test('six NEW_READY identities exact in production', () => {
    for (const n of newReady) {
      const p = findCenterById(n.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(n, p)).toBe(true);
    }
    const six = qaReport.six_new_identities as {present: number; material_drift: unknown[]};
    expect(six.present).toBe(6);
    expect(six.material_drift).toEqual([]);
    expect(NEW_READY_IDS.every(id => findCenterById(id))).toBe(true);
  });

  test('Class A + independent brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of mtCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    const classA = qaReport.class_a as {
      chain_class_a_approved: number;
      class_a_chain_count: number;
      small_market_independent: number;
      estate_drift: number;
    };
    expect(classA.chain_class_a_approved).toBe(18);
    expect(classA.class_a_chain_count).toBe(3);
    expect(classA.small_market_independent).toBe(6);
    expect(classA.estate_drift).toBe(0);
  });

  test('coming-soon, excluded, closed, Fitness Café absent', () => {
    const prodIds = new Set(mtCenters.map(c => c.id));
    expect(prodIds.has(COMING_SOON_ID)).toBe(false);
    expect(prodIds.has(FITNESS_CAFE_ID)).toBe(false);
    for (const row of excluded) expect(prodIds.has(row.id)).toBe(false);
    for (const row of closed) expect(prodIds.has(row.id)).toBe(false);
    const cs = qaReport.coming_soon as {production_leakage: string[]};
    expect(cs.production_leakage).toEqual([]);
    const ex = qaReport.excluded as {production_leakage: string[]};
    expect(ex.production_leakage).toEqual([]);
    const cl = qaReport.closed as {production_leakage: string[]};
    expect(cl.production_leakage).toEqual([]);
    const rb = qaReport.rebrand as {fitness_cafe_active_identities: number};
    expect(rb.fitness_cafe_active_identities).toBe(0);
  });

  test('cross-border, duplicates, data quality clean', () => {
    expect(cross.live_outliers).toEqual([]);
    expect(cross.gozo_country_errors).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_duplicate_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
    for (const c of mtCenters) {
      expect(c.id).toMatch(/^mt_[a-f0-9]{10}$/);
      expect(c.country).toBe('Malta');
      expect(MALTA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleMaltaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('mt_')).toBe(false);
    }
    const dq = qaReport.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers, nearest QA', () => {
    expect(GYM_ID_PREFIX.malta).toBe('mt_');
    expect(isMaltaCountry('Malta')).toBe(true);
    expect(isMaltaCountry('Republic of Malta')).toBe(true);
    expect(gymCountryTranslationKey('Malta')).toBe('countries.malta');
    expect(en.countries.malta).toBe('Malta');
    expect(normalizeGymSearchValue('Gżira')).toBe('gzira');
    expect(resolveGymOrStub('mt_nonexistent_test').region).toBe('Malta');

    for (const id of NEW_READY_IDS) {
      const center = findCenterById(id)!;
      expect(formatGymDisplayName(center)).not.toMatch(/^mt_/);
      expect(searchGyms(center.brand).some(h => h.gym.id === id)).toBe(true);
    }

    expect(searchMap.map_active_markers).toBe(24);
    expect(searchMap.search_failures).toEqual([]);
    expect(searchMap.nearest_failures).toEqual([]);

    const mapCenters: MapCenter[] = mtCenters.map(c => {
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
    expect(mapCenters.length).toBe(24);

    const maltaGyms = getActiveGymsByCountry('Malta');
    expect(findNearestGym(35.912, 14.504, maltaGyms)?.id).toBe('mt_2f5b8d74db');
    expect(findNearestGym(35.89, 14.461, maltaGyms)?.id).toBe('mt_e99920262f');
    expect(findNearestGym(36.044, 14.241, maltaGyms)?.id).toBe('mt_69e8de5961');
    expect(findNearestGym(36.035, 14.258, maltaGyms)?.id).toBe('mt_decf1d09bc');
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    for (const id of ['mt_26d7f37a30', ...NEW_READY_IDS]) {
      expect(getGymLatLngForCheckIn(id)).not.toBeNull();
    }

    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
    expect(qaReport.malta_specific_runtime_hacks).toBe(0);
  });

  test('prior-country counts unchanged; idempotency; performance; READY verdict', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect(historicalDebt.prior_country_verification.regressions).toEqual([]);
    expect(idempotency.idempotent).toBe(true);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);

    const dry = qaReport.dry_run_delta as {insertions: number; updates: number; removals: number};
    expect(dry.insertions).toBe(0);
    expect(dry.updates).toBe(0);
    expect(dry.removals).toBe(0);

    expect(perf.catalog_total).toBe(EXPECTED_TOTAL);
    expect(perf.centers_json_bytes).toBe(EXPECTED_BYTES);
    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(perf.assessment).toBe('HEALTHY');
    expect(perf.crosses_12500).toBe(false);
    expect(perf.headroom_to_12500).toBe(571);

    expect(qaReport.verdict).toBe('MALTA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect(qaReport.malta_infrastructure_gaps).toBe(0);
    const gates = qaReport.gates as Record<string, boolean>;
    expect(gates.reconciliation_idempotent).toBe(true);
    expect(gates.prior_country_counts_unchanged).toBe(true);
    expect(gates.bgm_birgu_absent).toBe(true);
  });
});
