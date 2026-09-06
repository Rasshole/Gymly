/**
 * Slovenia production reconciliation — preserve 32 + insert 1 (Alfa Gym).
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_TOTAL = 11922;
const EXPECTED_SLOVENIA = 33;
const PRE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
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

describe('Slovenia production reconciliation (+1 Alfa Gym)', () => {
  const dataDir = path.join(__dirname, '../data/slovenia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; city: string; lat: number; lng: number}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; address: string; lat: number; lng: number}>;
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    first_run: {insertions: number; updates: number; removals: number};
    second_run?: {insertions: number; updates: number; removals: number};
    idempotent: boolean;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'SLOVENIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number; rebrand_conflicts: number};
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'slovenia_centers_staging.json'), 'utf8'),
  ) as Array<{id: string; import_category: string; brand?: string}>;

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'SLOVENIA_RECONCILIATION_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'SLOVENIA_RECONCILIATION_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const siCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('si_'));
  const sloveniaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia');

  test('post-reconciliation: total 11922, Slovenia 33, si_* 33', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(sloveniaCenters.length).toBe(EXPECTED_SLOVENIA);
    expect(siCenters.length).toBe(EXPECTED_SLOVENIA);
    expect(sha).toBe(shaAfter);
    expect(shaBefore).toBe(PRE_SHA);
    expect(sha).not.toBe(PRE_SHA);
  });

  test('Phase 2 inputs: KEEP=32, NEW=1, REVIEW=0', () => {
    expect(keep.length).toBe(32);
    expect(newReady.length).toBe(1);
    expect(existingReview.length).toBe(0);
    expect(newReady[0].id).toBe(ALFA_ID);
  });

  test('approved for production = 33; exact ID match with live production', () => {
    expect(approved.length).toBe(33);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(siCenters.map(r => r.id));
    expect(approvedIds.size).toBe(33);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !approvedIds.has(id))).toEqual([]);
  });

  test('existing 32 unchanged; Alfa Gym inserted exactly once', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }
    const alfaRows = siCenters.filter(c => c.id === ALFA_ID);
    expect(alfaRows.length).toBe(1);
    expect(alfaRows[0].address).toMatch(/Dunajska cesta 49/i);
    expect(alfaRows[0].brand).toBe('Alfa Gym');
    const meta = report.metadata as {existing_rows_changed: number};
    expect(meta.existing_rows_changed).toBe(0);
  });

  test('exact production delta +1/0/0; idempotent second run', () => {
    const delta = report.delta as {
      insertions: number;
      updates: number;
      removals: number;
      total_before: number;
      total_after: number;
      slovenia_before: number;
      slovenia_after: number;
    };
    expect(delta.insertions).toBe(1);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
    expect(delta.total_before).toBe(11921);
    expect(delta.total_after).toBe(11922);
    expect(delta.slovenia_before).toBe(32);
    expect(delta.slovenia_after).toBe(33);
    expect(idempotency.first_run.insertions).toBe(1);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);
    expect(idempotency.second_run?.updates ?? 0).toBe(0);
    expect(idempotency.second_run?.removals ?? 0).toBe(0);
    expect(idempotency.idempotent).toBe(true);
  });

  test('Class A + Alfa brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of siCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    const classA = report.class_a as {
      existing: number;
      shape_house: number;
      bodifit: number;
      fitinn: number;
      small_market_independent_new: number;
    };
    expect(classA.existing).toBe(32);
    expect(classA.shape_house).toBe(18);
    expect(classA.bodifit).toBe(8);
    expect(classA.fitinn).toBe(6);
    expect(classA.small_market_independent_new).toBe(1);
  });

  test('excluded identities absent from production', () => {
    const prodIds = new Set(siCenters.map(c => c.id));
    for (const id of EXCLUDED_IDS) {
      expect(prodIds.has(id)).toBe(false);
    }
    const ex = report.excluded as {excluded_production_leakage: string[]};
    expect(ex.excluded_production_leakage).toEqual([]);
  });

  test('cross-border, Gorizia, duplicates = 0', () => {
    const cb = report.cross_border as Record<string, number>;
    expect(cb.italy_outliers).toBe(0);
    expect(cb.austria_outliers).toBe(0);
    expect(cb.hungary_outliers).toBe(0);
    expect(cb.croatia_outliers).toBe(0);
    expect(cb.gorica_gorizia_identity_collisions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality for all 33 Slovenia rows', () => {
    for (const c of siCenters) {
      expect(c.id).toMatch(/^si_[a-f0-9]{10}$/);
      expect(c.country).toBe('Slovenia');
      expect(SLOVENIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleSloveniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('si_')).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers, nearest sanity', () => {
    expect(GYM_ID_PREFIX.slovenia).toBe('si_');
    expect(isSloveniaCountry('Slovenija')).toBe(true);
    expect(gymCountryTranslationKey('Slovenia')).toBe('countries.slovenia');
    expect(en.countries.slovenia).toBe('Slovenia');
    expect(normalizeGymSearchValue('Šiška')).toBe('siska');
    expect(resolveGymOrStub('si_nonexistent_test').region).toBe('Slovenia');

    const alfa = findCenterById(ALFA_ID)!;
    expect(formatGymDisplayName(alfa)).toMatch(/Alfa Gym/i);
    const alfaHits = searchGyms('Alfa Gym').filter(h => h.gym.id === ALFA_ID);
    expect(alfaHits.length).toBeGreaterThan(0);

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

    const sloveniaGyms = getActiveGymsByCountry('Slovenia');
    const nearAlfa = findNearestGym(46.0645, 14.5084, sloveniaGyms);
    expect(nearAlfa?.id).toBe(ALFA_ID);
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m for Alfa Gym', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const coords = getGymLatLngForCheckIn(ALFA_ID);
    expect(coords).not.toBeNull();
    const center = findCenterById(ALFA_ID)!;
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
    expect(getActiveGymsByCountry('Slovenia').length).toBe(33);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.verdict).toBe('SLOVENIA RECONCILIATION COMPLETE — WAITING FOR QA');
  });
});
