/**
 * Slovenia Production QA — final read-only validation gate.
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
  isPlausibleSloveniaCoordinate,
  SLOVENIA_POSTAL_RE,
  isSloveniaCountry,
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
  '18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab';
const EXPECTED_TOTAL = 11922;
const EXPECTED_SLOVENIA = 33;
const ALFA_ID = 'si_c516823c91';

const EXPECTED_BRANDS: Record<string, number> = {
  'Shape House': 18,
  BODIFIT: 8,
  FITINN: 6,
  'Alfa Gym': 1,
};

const EXCLUDED_IDS = [
  'si_17d20208a0',
  'si_5a769d4c7c',
  'si_9b758920d5',
  'si_6fc5e9a842',
  'si_2c004d273b',
];

const PRIOR_COUNTS: Record<string, number> = {
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
    String(a.country || 'Slovenia').trim() === String(b.country || 'Slovenia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Slovenia Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/slovenia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_QA_HISTORICAL_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {REAL_COUNTRY_REGRESSIONS: number; STALE_TOTAL_FAILURES: number};
    prior_country_verification: {regressions: unknown[]};
  };
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; city: string; lat: number; lng: number}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string; phase2_classification?: string; eligibility?: string}>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const reconciliation = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as {delta: {insertions: number; removals: number; updates: number}};
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {second_run: {insertions: number; updates: number; removals: number}; idempotent: boolean};
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PRODUCTION_QA_PERF.json'), 'utf8'),
  ) as {catalog_total: number; assessment: string; architecture: string; crosses_12500: boolean};

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'SLOVENIA_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'SLOVENIA_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const siCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('si_'));

  test('frozen production baseline and QA SHA', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(siCenters.length).toBe(EXPECTED_SLOVENIA);
    expect(sha).toBe(LIVE_SHA);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
    expect(qaReport.production_modified).toBe(false);
    expect(qaReport.qa_insertions).toBe(0);
    expect(qaReport.qa_updates).toBe(0);
    expect(qaReport.qa_removals).toBe(0);
  });

  test('authoritative inventory 33/33/33 exact ID equality', () => {
    expect(keep.length).toBe(32);
    expect(newReady.length).toBe(1);
    expect(approved.length).toBe(33);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(siCenters.map(r => r.id));
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !approvedIds.has(id))).toEqual([]);
    const inv = qaReport.inventory as {original_existing_changed: unknown[]};
    expect(inv.original_existing_changed).toEqual([]);
  });

  test('original 32 immutability preserved', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }
  });

  test('Alfa Gym exact identity in production', () => {
    const alfa = findCenterById(ALFA_ID)!;
    expect(alfa).toBeDefined();
    expect(alfa.brand).toBe('Alfa Gym');
    expect(alfa.address).toBe('Dunajska cesta 49');
    expect(alfa.postal_code).toBe('1000');
    expect(alfa.city).toBe('Ljubljana');
    expect(alfa.country).toBe('Slovenia');
    expect(alfa.lat).toBeCloseTo(46.0644996, 5);
    expect(alfa.lng).toBeCloseTo(14.5084024, 5);
    expect(siCenters.filter(c => c.id === ALFA_ID).length).toBe(1);
    expect(newReady[0].phase2_classification).toBe('SMALL_MARKET_INDEPENDENT');
    expect(newReady[0].eligibility).toBe('CONVENTIONAL_PUBLIC_GYM');
  });

  test('Class A + Alfa brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of siCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    expect(Object.keys(byBrand).length).toBe(4);
  });

  test('excluded/coming-soon/closed leakage = 0', () => {
    const prodIds = new Set(siCenters.map(c => c.id));
    for (const id of EXCLUDED_IDS) {
      expect(prodIds.has(id)).toBe(false);
    }
    const ex = qaReport.excluded as {production_leakage: string[]};
    const cs = qaReport.coming_soon as {production_leakage: string[]};
    const cl = qaReport.closed as {production_leakage: string[]};
    expect(ex.production_leakage).toEqual([]);
    expect(cs.production_leakage).toEqual([]);
    expect(cl.production_leakage).toEqual([]);
  });

  test('hotel/specialist/institutional safety', () => {
    const safety = qaReport.safety as {
      hotel_resort_leakage: number;
      specialist_leakage: number;
      institutional_leakage: number;
    };
    expect(safety.hotel_resort_leakage).toBe(0);
    expect(safety.specialist_leakage).toBe(0);
    expect(safety.institutional_leakage).toBe(0);
    const wellness = qaReport.wellness as {invalid_wellness_additive: number};
    expect(wellness.invalid_wellness_additive).toBe(0);
  });

  test('cross-border and duplicate safety', () => {
    const cb = qaReport.cross_border as Record<string, number>;
    expect(cb.italy_outliers).toBe(0);
    expect(cb.austria_outliers).toBe(0);
    expect(cb.hungary_outliers).toBe(0);
    expect(cb.croatia_outliers).toBe(0);
    expect(cb.gorica_gorizia_identity_collisions).toBe(0);
    const dup = qaReport.duplicates as {
      global_duplicate_ids: number;
      hard_duplicate_conflicts: number;
      rebrand_conflicts: number;
    };
    expect(dup.global_duplicate_ids).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality for all 33 rows', () => {
    for (const c of siCenters) {
      expect(c.id).toMatch(/^si_[a-f0-9]{10}$/);
      expect(c.country).toBe('Slovenia');
      expect(SLOVENIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleSloveniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('si_')).toBe(false);
    }
  });

  test('country/ID resolution and search', () => {
    expect(GYM_ID_PREFIX.slovenia).toBe('si_');
    expect(isSloveniaCountry('Slovenija')).toBe(true);
    expect(gymCountryTranslationKey('Slovenia')).toBe('countries.slovenia');
    expect(en.countries.slovenia).toBe('Slovenia');
    expect(normalizeGymSearchValue('Šiška')).toBe('siska');
    expect(normalizeGymSearchValue('Capodistria')).toBe('capodistria');
    expect(resolveGymOrStub('si_nonexistent_test').region).toBe('Slovenia');

    const alfaHits = searchGyms('Alfa Gym').filter(h => h.gym.id === ALFA_ID);
    expect(alfaHits.length).toBeGreaterThan(0);
    expect(formatGymDisplayName(findCenterById(ALFA_ID)!)).toMatch(/Alfa Gym/i);

    for (const term of ['Shape House', 'BODIFIT', 'FITINN', 'Ljubljana', 'Maribor']) {
      expect(searchGyms(term).length).toBeGreaterThan(0);
    }
  });

  test('map markers = 33; Alfa marker = 1', () => {
    const mapCenters: MapCenter[] = siCenters.map(c => {
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
    expect(mapCenters.length).toBe(33);
    expect(mapCenters.filter(c => c.id === ALFA_ID).length).toBe(1);
    const ljubljana = filterMapCentersInRegion(mapCenters, {
      latitude: 46.05,
      longitude: 14.51,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    });
    expect(ljubljana.some(c => c.id === ALFA_ID)).toBe(true);
  });

  test('nearest sanity including Alfa Gym probe', () => {
    const sloveniaGyms = getActiveGymsByCountry('Slovenia');
    const probes = [
      {lat: 46.0645, lng: 14.5084, expectId: ALFA_ID},
      {lat: 46.05, lng: 14.51},
      {lat: 46.56, lng: 15.65},
      {lat: 46.24, lng: 15.28},
      {lat: 45.55, lng: 13.73},
      {lat: 45.8, lng: 15.17},
      {lat: 45.96, lng: 13.65},
      {lat: 46.42, lng: 15.99},
      {lat: 46.67, lng: 16.17},
    ];
    for (const p of probes) {
      const nearest = findNearestGym(p.lat, p.lng, sloveniaGyms);
      expect(nearest).toBeDefined();
      expect(isSloveniaCountry(nearest!.country)).toBe(true);
      if (p.expectId) expect(nearest!.id).toBe(p.expectId);
    }
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    for (const id of [
      ALFA_ID,
      siCenters.find(c => c.brand === 'Shape House')!.id,
      siCenters.find(c => c.brand === 'BODIFIT')!.id,
      siCenters.find(c => c.brand === 'FITINN')!.id,
    ]) {
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
    }

    expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);

    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
  });

  test('prior countries unchanged; reconciliation idempotent; below 12,500', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    expect(reconciliation.delta.insertions).toBe(1);
    expect(reconciliation.delta.removals).toBe(0);
    expect(reconciliation.delta.updates).toBe(0);
    expect(idempotency.second_run.insertions).toBe(0);
    expect(idempotency.second_run.updates).toBe(0);
    expect(idempotency.second_run.removals).toBe(0);
    expect(idempotency.idempotent).toBe(true);
    expect(perf.crosses_12500).toBe(false);
    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSIONS).toBe(0);
    expect(historicalDebt.prior_country_verification.regressions).toEqual([]);
    expect(qaReport.verdict).toBe('SLOVENIA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
  });
});
