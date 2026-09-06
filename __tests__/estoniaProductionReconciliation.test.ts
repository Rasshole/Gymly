/**
 * Estonia production reconciliation — preserve 68 + insert 1 (FitLife).
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_TOTAL = 11923;
const EXPECTED_ESTONIA = 69;
const PRE_SHA =
  '18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab';
const FITLIFE_ID = 'ee_91d7bd69f0';

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

describe('Estonia production reconciliation (+1 FitLife)', () => {
  const dataDir = path.join(__dirname, '../data/estonia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; city: string; lat: number; lng: number}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; address: string; lat: number; lng: number}>;
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    first_run: {insertions: number; updates: number; removals: number};
    second_run?: {insertions: number; updates: number; removals: number};
    idempotent: boolean;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    diacritic_duplicate_conflicts: number;
    rebrand_conflicts: number;
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'ESTONIA_RECONCILIATION_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'ESTONIA_RECONCILIATION_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const eeCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('ee_'));
  const estoniaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Estonia');

  test('post-reconciliation: total 11923, Estonia 69, ee_* 69', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(estoniaCenters.length).toBe(EXPECTED_ESTONIA);
    expect(eeCenters.length).toBe(EXPECTED_ESTONIA);
    expect(sha).toBe(shaAfter);
    expect(shaBefore).toBe(PRE_SHA);
    expect(sha).not.toBe(PRE_SHA);
  });

  test('Phase 2 inputs: KEEP=68, NEW=1, REVIEW=0', () => {
    expect(keep.length).toBe(68);
    expect(newReady.length).toBe(1);
    expect(existingReview.length).toBe(0);
    expect(newReady[0].id).toBe(FITLIFE_ID);
  });

  test('approved for production = 69; exact ID match with live production', () => {
    expect(approved.length).toBe(69);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(eeCenters.map(r => r.id));
    expect(approvedIds.size).toBe(69);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !approvedIds.has(id))).toEqual([]);
  });

  test('existing 68 unchanged; FitLife inserted exactly once', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }
    const fitlifeRows = eeCenters.filter(c => c.id === FITLIFE_ID);
    expect(fitlifeRows.length).toBe(1);
    expect(fitlifeRows[0].address).toMatch(/Kalda tee 1c/i);
    expect(fitlifeRows[0].brand).toBe('FitLife');
    expect(fitlifeRows[0].city).toBe('Tartu');
    const meta = report.metadata as {existing_rows_changed: number};
    expect(meta.existing_rows_changed).toBe(0);
  });

  test('exact production delta +1/0/0; idempotent second run', () => {
    const first = idempotency.first_run;
    expect(first.insertions).toBe(1);
    expect(first.updates).toBe(0);
    expect(first.removals).toBe(0);
    expect(first.total_before).toBe(11922);
    expect(first.total_after).toBe(11923);
    expect(first.estonia_before).toBe(68);
    expect(first.estonia_after).toBe(69);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);
    expect(idempotency.second_run?.updates ?? 0).toBe(0);
    expect(idempotency.second_run?.removals ?? 0).toBe(0);
    expect(idempotency.idempotent).toBe(true);
  });

  test('Class A + FitLife brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of eeCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    const classA = report.class_a as {
      existing: number;
      myfitness: number;
      '24_7_fitness': number;
      gym_bang: number;
      golden_club: number;
      small_market_independent_new: number;
    };
    expect(classA.existing).toBe(68);
    expect(classA.myfitness).toBe(19);
    expect(classA['24_7_fitness']).toBe(31);
    expect(classA.gym_bang).toBe(15);
    expect(classA.golden_club).toBe(3);
    expect(classA.small_market_independent_new).toBe(1);
  });

  test('coming-soon and excluded identities absent from production', () => {
    const prodIds = new Set(eeCenters.map(c => c.id));
    for (const id of COMING_SOON_IDS) {
      expect(prodIds.has(id)).toBe(false);
    }
    const cs = report.coming_soon as {coming_soon_production_leakage: string[]};
    expect(cs.coming_soon_production_leakage).toEqual([]);
    const ex = report.excluded as {excluded_production_leakage: string[]};
    expect(ex.excluded_production_leakage).toEqual([]);
  });

  test('cross-border, Valga/Valka, duplicates = 0', () => {
    const cb = report.cross_border as Record<string, number>;
    expect(cb.latvia_outliers).toBe(0);
    expect(cb.russia_outliers).toBe(0);
    expect(cb.finland_outliers).toBe(0);
    expect(cb.valga_valka_identity_collisions).toBe(0);
    expect(cb.narva_ivangorod_identity_collisions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality for all 69 Estonia rows', () => {
    for (const c of eeCenters) {
      expect(c.id).toMatch(/^ee_[a-f0-9]{10}$/);
      expect(c.country).toBe('Estonia');
      expect(ESTONIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleEstoniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('ee_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers, nearest sanity', () => {
    expect(GYM_ID_PREFIX.estonia).toBe('ee_');
    expect(isEstoniaCountry('Eesti')).toBe(true);
    expect(gymCountryTranslationKey('Estonia')).toBe('countries.estonia');
    expect(en.countries.estonia).toBe('Estonia');
    expect(normalizeGymSearchValue('Pärnu')).toBe('parnu');
    expect(normalizeGymSearchValue('Jõhvi')).toBe('johvi');
    expect(resolveGymOrStub('ee_nonexistent_test').region).toBe('Estonia');

    const fitlife = findCenterById(FITLIFE_ID)!;
    expect(formatGymDisplayName(fitlife)).toMatch(/FitLife/i);
    const fitlifeHits = searchGyms('FitLife').filter(h => h.gym.id === FITLIFE_ID);
    expect(fitlifeHits.length).toBeGreaterThan(0);

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

    const tartu = filterMapCentersInRegion(mapCenters, {
      latitude: 58.37,
      longitude: 26.75,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
    expect(tartu.some(c => c.id === FITLIFE_ID)).toBe(true);

    const estoniaGyms = getActiveGymsByCountry('Estonia');
    const nearFitlife = findNearestGym(58.3731, 26.7512, estoniaGyms);
    expect(nearFitlife?.id).toBe(FITLIFE_ID);
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m for FitLife', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const coords = getGymLatLngForCheckIn(FITLIFE_ID);
    expect(coords).not.toBeNull();
    const center = findCenterById(FITLIFE_ID)!;
    expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
    expect(coords!.longitude).toBeCloseTo(center.lng!, 5);

    expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);

    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
  });

  test('prior-country counts unchanged; below 12,500 threshold', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    expect(getActiveGymsByCountry('Estonia').length).toBe(69);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.verdict).toBe('ESTONIA RECONCILIATION COMPLETE — WAITING FOR QA');
  });
});
