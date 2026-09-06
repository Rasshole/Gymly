/**
 * Belarus Production QA — final read-only validation gate.
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
import {
  isPlausibleBelarusCoordinate,
  BELARUS_POSTAL_RE,
  isBelarusCountry,
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
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';
const EXPECTED_TOTAL = 12080;
const EXPECTED_BELARUS = 46;
const EXPECTED_UKRAINE = 105;
const EXPECTED_MALTA = 24;
const EXPECTED_BYTES = 3761727;
const HEADROOM = 420;

const EXPECTED_BRANDS: Record<string, number> = {
  Adrenalin: 29,
  Lifestyle: 3,
  'Fox Club': 5,
  Olympic: 4,
  'World Class': 1,
  'Gym Express 24h': 1,
  Grafit: 1,
  Delta: 1,
  FitWorld: 1,
};

const PRIOR_COUNTS: Record<string, number> = {
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

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Belarus',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Belarus Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/belarus');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
    };
    prior_country_verification: {regressions: unknown[]};
  };
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string; address: string}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string}>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_QA_CROSS_BORDER.json'), 'utf8'),
  ) as {live_outliers: string[]};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_QA_DUPLICATES.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: unknown[];
    transliteration_duplicate_conflicts: unknown[];
    unresolved_rebrand_conflicts: number;
  };
  const searchMap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_QA_SEARCH_MAP.json'), 'utf8'),
  ) as {
    map_active_markers: number;
    search_failures: unknown[];
    nearest_failures: unknown[];
  };
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {assessment: string; architecture: string; headroom_to_12500: number};

  const byCenters = ALL_GYM_CENTERS.filter(
    c => c.country === 'Belarus' || c.id.startsWith('by_'),
  );

  test('frozen baseline — total 12080 / Belarus 46 / Ukraine 105 / Malta 24 / SHA / bytes', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(byCenters.length).toBe(EXPECTED_BELARUS);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(EXPECTED_BELARUS);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Ukraine').length).toBe(EXPECTED_UKRAINE);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(EXPECTED_MALTA);
    expect(sha).toBe(LIVE_SHA);
    expect(bytes).toBe(EXPECTED_BYTES);
    expect(qaReport.qa_sha_before).toBe(LIVE_SHA);
    expect(qaReport.qa_bytes_before).toBe(EXPECTED_BYTES);
    expect(qaReport.qa_sha_after).toBe(LIVE_SHA);
    expect(qaReport.qa_bytes_after).toBe(EXPECTED_BYTES);
  });

  test('four-way reconciliation — approved = live = 46', () => {
    expect(newReady.length).toBe(46);
    expect(approved.length).toBe(46);
    const approvedIds = new Set(approved.map(r => r.id));
    const readyIds = new Set(newReady.map(r => r.id));
    const prodIds = new Set(byCenters.map(r => r.id));
    expect(approvedIds.size).toBe(46);
    expect(readyIds.size).toBe(46);
    expect(prodIds.size).toBe(46);
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
    const byBrand = byCenters.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(46);
    const classA = qaReport.class_a as {
      chain_count: number;
      approved: number;
      non_class_a: number;
    };
    expect(classA.chain_count).toBe(4);
    expect(classA.approved).toBe(41);
    expect(classA.non_class_a).toBe(5);
  });

  test('Adrenalin / Lifestyle / Fox Club / Olympic gates + special checks', () => {
    expect((qaReport.adrenalin as {active: number}).active).toBe(29);
    expect((qaReport.lifestyle as {active: number}).active).toBe(3);
    expect((qaReport.fox_club as {active: number}).active).toBe(5);
    expect((qaReport.olympic as {active: number}).active).toBe(4);

    const borovlyany = findCenterById('by_3633cd3ae9');
    expect(borovlyany).toBeTruthy();
    expect(borovlyany!.city).toBe('Borovlyany');
    expect(borovlyany!.city).not.toBe('Minsk');

    const kupaly = byCenters.filter(c => c.address === 'пр-т Я. Купалы 22');
    expect(kupaly).toHaveLength(1);
    expect(kupaly[0].brand).toBe('Fox Club');

    expect(byCenters.some(c => c.id === 'by_aed96cf298')).toBe(false);
    expect((qaReport.olympic_loshitsa as {in_production: boolean}).in_production).toBe(false);

    const vitebsk = qaReport.vitebsk as {
      production_count: number;
      unauthorized_production: string[];
    };
    expect(vitebsk.production_count).toBe(0);
    expect(vitebsk.unauthorized_production).toEqual([]);
  });

  test('CS / excluded / closed leakage = 0', () => {
    const cs = qaReport.coming_soon as {production_leakage: string[]; authoritative_count: number};
    expect(cs.authoritative_count).toBe(1);
    expect(cs.production_leakage).toEqual([]);
    const ex = qaReport.excluded as {production_leakage: string[]; authoritative_count: number};
    expect(ex.authoritative_count).toBe(11);
    expect(ex.production_leakage).toEqual([]);
    const cl = qaReport.closed as {production_leakage: string[]; authoritative_count: number};
    expect(cl.authoritative_count).toBe(0);
    expect(cl.production_leakage).toEqual([]);
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
    for (const c of byCenters) {
      expect(c.id).toMatch(/^by_[a-f0-9]{10}$/);
      expect(c.country).toBe('Belarus');
      expect(BELARUS_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleBelarusCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('by_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source ?? ''))).toBe(
        false,
      );
    }
    const dq = qaReport.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers, nearest QA', () => {
    expect(GYM_ID_PREFIX.belarus).toBe('by_');
    expect(isBelarusCountry('Belarus')).toBe(true);
    expect(isBelarusCountry('Беларусь')).toBe(true);
    expect(gymCountryTranslationKey('Belarus')).toBe('countries.belarus');
    expect(en.countries.belarus).toBeTruthy();
    expect(resolveGymOrStub(byCenters[0].id).country).toBe('Belarus');

    const sample = byCenters[0];
    expect(formatGymDisplayName(sample)).not.toMatch(/^by_/);
    expect(searchGyms('Minsk').some(h => h.gym.country === 'Belarus')).toBe(true);
    expect(searchGyms('Adrenalin').some(h => h.gym.country === 'Belarus')).toBe(true);
    expect(searchGyms('Беларусь').some(h => h.gym.country === 'Belarus')).toBe(true);

    expect(searchMap.map_active_markers).toBe(46);
    expect(searchMap.search_failures).toEqual([]);
    expect(searchMap.nearest_failures).toEqual([]);

    const mapCenters: MapCenter[] = byCenters.map(c => {
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
    expect(mapCenters.length).toBe(46);

    const belarusGyms = getActiveGymsByCountry('Belarus');
    expect(belarusGyms.length).toBe(46);
    expect(findNearestGym(53.9006, 27.559, belarusGyms)?.country).toBe('Belarus');
    expect(findNearestGym(53.6693, 23.8131, belarusGyms)?.country).toBe('Belarus');
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    for (const id of [byCenters[0].id, ...approved.slice(0, 3).map(r => r.id)]) {
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

    expect(qaReport.verdict).toBe('BELARUS STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect(qaReport.catalog_total).toBe(EXPECTED_TOTAL);
    expect(qaReport.belarus_live).toBe(EXPECTED_BELARUS);
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
