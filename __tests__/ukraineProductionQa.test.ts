/**
 * Ukraine Production QA — final read-only validation gate.
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
  isPlausibleUkraineCoordinate,
  UKRAINE_POSTAL_RE,
  isUkraineCountry,
} from '../src/utils/gymCountry';
import {formatGymDisplayName, resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import type {MapCenter} from '../src/data/mapCentersData';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const LIVE_SHA =
  'bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05';
const EXPECTED_TOTAL = 12034;
const EXPECTED_UKRAINE = 105;
const EXPECTED_MALTA = 24;
const EXPECTED_BYTES = 3746747;
const HEADROOM = 466;

const EXPECTED_BRANDS: Record<string, number> = {
  'Sport Life': 42,
  'Apollo Next': 24,
  Smartass: 10,
  'Total Fitness': 18,
  Grafit: 4,
  'Atlas Fitness': 1,
  'Grand Prix': 1,
  Olymp: 1,
  'Fitness Formula': 1,
  ProFitness: 1,
  FitCurves: 1,
  SportZal: 1,
};

const APOLLO_CITY: Record<string, string> = {
  '024': 'Lviv',
  '027': 'Boryspil',
  '033': 'Vinnytsia',
  '034': 'Lviv',
  '035': 'Bila Tserkva',
  '036': 'Odesa',
  '037': 'Odesa',
  '039': 'Ivano-Frankivsk',
  '041': 'Zhytomyr',
};

const PRIOR_COUNTS: Record<string, number> = {
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
  Montenegro: 26,
  Moldova: 28,
  'San Marino': 6,
  Monaco: 4,
  Andorra: 12,
  Liechtenstein: 7,
  Iceland: 27,
};

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

function apolloNum(name: string): string | null {
  const m = name.match(/APOLLO NEXT (\d{3})/i);
  return m ? m[1] : null;
}

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Ukraine',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Ukraine Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/ukraine');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
    };
    prior_country_verification: {regressions: unknown[]};
  };
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string}>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_QA_CROSS_BORDER.json'), 'utf8'),
  ) as {live_outliers: string[]};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_QA_DUPLICATES.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: unknown[];
    transliteration_duplicate_conflicts: unknown[];
    unresolved_rebrand_conflicts: number;
  };
  const searchMap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_QA_SEARCH_MAP.json'), 'utf8'),
  ) as {
    map_active_markers: number;
    search_failures: unknown[];
    nearest_failures: unknown[];
  };
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {assessment: string; architecture: string; headroom_to_12500: number};

  const uaCenters = ALL_GYM_CENTERS.filter(
    c => c.country === 'Ukraine' || c.id.startsWith('ua_'),
  );

  test('frozen baseline — total 12034 / Ukraine 105 / Malta 24 / SHA / bytes', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(uaCenters.length).toBe(EXPECTED_UKRAINE);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(EXPECTED_UKRAINE);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(EXPECTED_MALTA);
    expect(sha).toBe(LIVE_SHA);
    expect(bytes).toBe(EXPECTED_BYTES);
    expect(qaReport.qa_sha_before).toBe(LIVE_SHA);
    expect(qaReport.qa_bytes_before).toBe(EXPECTED_BYTES);
    expect(qaReport.qa_sha_after).toBe(LIVE_SHA);
    expect(qaReport.qa_bytes_after).toBe(EXPECTED_BYTES);
  });

  test('four-way reconciliation — approved = live = 105', () => {
    expect(newReady.length).toBe(105);
    expect(approved.length).toBe(105);
    const approvedIds = new Set(approved.map(r => r.id));
    const readyIds = new Set(newReady.map(r => r.id));
    const prodIds = new Set(uaCenters.map(r => r.id));
    expect(approvedIds.size).toBe(105);
    expect(readyIds.size).toBe(105);
    expect(prodIds.size).toBe(105);
    for (const id of approvedIds) expect(prodIds.has(id)).toBe(true);
    for (const id of readyIds) expect(approvedIds.has(id)).toBe(true);
    const recon = qaReport.four_way_reconciliation as {
      production_not_approved: string[] | number;
      approved_missing_from_production: string[] | number;
    };
    expect(
      Array.isArray(recon.production_not_approved)
        ? recon.production_not_approved.length
        : recon.production_not_approved,
    ).toBe(0);
    expect(
      Array.isArray(recon.approved_missing_from_production)
        ? recon.approved_missing_from_production.length
        : recon.approved_missing_from_production,
    ).toBe(0);
  });

  test('Class A + brand inventory exact', () => {
    const byBrand = uaCenters.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(byBrand['Energy Fitness'] ?? 0).toBe(0);
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(105);
    const classA = qaReport.class_a as {chain_count: number; approved: number; estate_drift: number};
    expect(classA.chain_count).toBe(4);
    expect(classA.approved).toBe(94);
    expect(classA.estate_drift).toBe(0);
  });

  test('Sport Life / Apollo / Smartass / Total Fitness / Grafit gates', () => {
    const sl = qaReport.sport_life as {active: number; cs_leakage: string[]};
    expect(sl.active).toBe(42);
    expect(sl.cs_leakage).toEqual([]);
    const ap = qaReport.apollo_next as {active: number; city_metadata_errors: unknown[]};
    expect(ap.active).toBe(24);
    expect(ap.city_metadata_errors).toEqual([]);
    for (const row of uaCenters.filter(c => c.brand === 'Apollo Next')) {
      const num = apolloNum(row.name);
      if (num && APOLLO_CITY[num]) expect(row.city).toBe(APOLLO_CITY[num]);
    }
    const sm = qaReport.smartass as {active: number; foreign_leakage: string[]};
    expect(sm.active).toBe(10);
    expect(sm.foreign_leakage).toEqual([]);
    const tf = qaReport.total_fitness as {active: number; city_metadata_errors: unknown[]};
    expect(tf.active).toBe(18);
    expect(tf.city_metadata_errors).toEqual([]);
    const gf = qaReport.grafit as {active: number};
    expect(gf.active).toBe(4);
    expect((qaReport.energy_fitness as {active: number}).active).toBe(0);
  });

  test('CS / excluded / closed / conflict-area leakage = 0', () => {
    const cs = qaReport.coming_soon as {production_leakage: string[]; authoritative_count: number};
    expect(cs.authoritative_count).toBe(6);
    expect(cs.production_leakage).toEqual([]);
    const ex = qaReport.excluded as {production_leakage: string[]; authoritative_count: number};
    expect(ex.authoritative_count).toBe(31);
    expect(ex.production_leakage).toEqual([]);
    const cl = qaReport.closed as {production_leakage: string[]; authoritative_count: number};
    expect(cl.authoritative_count).toBe(2);
    expect(cl.production_leakage).toEqual([]);
    const conflict = qaReport.conflict_area as {operation_unverified_production: string[]};
    expect(conflict.operation_unverified_production).toEqual([]);
  });

  test('hotel / specialist / institutional leakage = 0', () => {
    const hw = qaReport.hotel_wellness as {hotel_resort_leakage: string[]};
    expect(hw.hotel_resort_leakage).toEqual([]);
    const si = qaReport.specialist_institutional as {
      specialist_leakage: string[];
      institutional_leakage: string[];
    };
    expect(si.specialist_leakage).toEqual([]);
    expect(si.institutional_leakage).toEqual([]);
  });

  test('cross-border, duplicates, data quality clean', () => {
    expect(cross.live_outliers).toEqual([]);
    expect(dup.hard_duplicate_conflicts).toEqual([]);
    expect(dup.transliteration_duplicate_conflicts).toEqual([]);
    expect(dup.unresolved_rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
    for (const c of uaCenters) {
      expect(c.id).toMatch(/^ua_[a-f0-9]{10}$/);
      expect(c.country).toBe('Ukraine');
      expect(UKRAINE_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleUkraineCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('ua_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source ?? ''))).toBe(
        false,
      );
    }
    const dq = qaReport.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers, nearest QA', () => {
    expect(GYM_ID_PREFIX.ukraine).toBe('ua_');
    expect(isUkraineCountry('Ukraine')).toBe(true);
    expect(isUkraineCountry('Україна')).toBe(true);
    expect(gymCountryTranslationKey('Ukraine')).toBe('countries.ukraine');
    expect(en.countries.ukraine).toBeTruthy();
    expect(resolveGymOrStub(uaCenters[0].id).country).toBe('Ukraine');

    const sample = uaCenters[0];
    expect(formatGymDisplayName(sample)).not.toMatch(/^ua_/);
    expect(searchGyms('Kyiv').some(h => h.gym.country === 'Ukraine')).toBe(true);
    expect(searchGyms('Sport Life').some(h => h.gym.country === 'Ukraine')).toBe(true);
    expect(searchGyms('Україна').some(h => h.gym.country === 'Ukraine')).toBe(true);

    expect(searchMap.map_active_markers).toBe(105);
    expect(searchMap.search_failures).toEqual([]);
    expect(searchMap.nearest_failures).toEqual([]);

    const mapCenters: MapCenter[] = uaCenters.map(c => {
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
    expect(mapCenters.length).toBe(105);

    const ukraineGyms = getActiveGymsByCountry('Ukraine');
    expect(ukraineGyms.length).toBe(105);
    expect(findNearestGym(50.4501, 30.5234, ukraineGyms)?.country).toBe('Ukraine');
    expect(findNearestGym(49.8397, 24.0297, ukraineGyms)?.country).toBe('Ukraine');
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    for (const id of [uaCenters[0].id, ...approved.slice(0, 3).map(r => r.id)]) {
      expect(getGymLatLngForCheckIn(id)).not.toBeNull();
    }

    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
    const infra = qaReport.infrastructure as {runtime_hacks: number};
    expect(infra.runtime_hacks).toBe(0);
  });

  test('prior-country counts unchanged; idempotency; performance; READY verdict', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect(historicalDebt.prior_country_verification.regressions).toEqual([]);
    expect(idempotency.idempotent).toBe(true);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);
    const dryRun = qaReport.dry_run_delta as {insertions: number; updates: number; removals: number};
    expect(dryRun.insertions).toBe(0);
    expect(dryRun.updates).toBe(0);
    expect(dryRun.removals).toBe(0);

    expect(perf.headroom_to_12500).toBe(HEADROOM);
    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(perf.assessment).toBe('HEALTHY');
    expect(perf.crosses_12500 ?? false).toBe(false);

    expect(qaReport.verdict).toBe('UKRAINE STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect(qaReport.catalog_total).toBe(EXPECTED_TOTAL);
    expect(qaReport.ukraine_live).toBe(EXPECTED_UKRAINE);
  });

  test('authorized identities — no material drift', () => {
    const auth = qaReport.authorized_identities as {
      authorized_new_missing: unknown[];
      authorized_new_material_drift: unknown[];
    };
    expect(auth.authorized_new_missing).toEqual([]);
    expect(auth.authorized_new_material_drift).toEqual([]);
    for (const row of approved) {
      const center = findCenterById(row.id);
      expect(center).toBeTruthy();
      expect(center!.brand).toBe(row.brand);
      expect(center!.city).toBe(row.city);
    }
  });
});
