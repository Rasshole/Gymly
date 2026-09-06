/**
 * Lithuania production reconciliation — zero-delta (preserve existing 61).
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_TOTAL = 11923;
const EXPECTED_LITHUANIA = 61;
const EXPECTED_BYTES = 3706426;
const EXPECTED_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';

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

describe('Lithuania production reconciliation (zero-delta)', () => {
  const dataDir = path.join(__dirname, '../data/lithuania');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

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
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Array<{id: string; name: string; address: string; city: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as unknown[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    first_run: {insertions: number; updates: number; removals: number};
    second_run?: {insertions: number; updates: number; removals: number};
    idempotent: boolean;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LITHUANIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    global_duplicate_ids: number;
    lithuania_duplicate_ids: number;
    hard_duplicate_conflicts: number;
    diacritic_duplicate_conflicts: number;
    rebrand_conflicts: number;
    gym_plus_gym_exclamation_collisions: number;
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'LITHUANIA_RECONCILIATION_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'LITHUANIA_RECONCILIATION_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const ltCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('lt_'));
  const lithuaniaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania');

  test('zero-delta: total 11923, Lithuania 61, SHA and bytes unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(lithuaniaCenters.length).toBe(EXPECTED_LITHUANIA);
    expect(ltCenters.length).toBe(EXPECTED_LITHUANIA);
    expect(sha).toBe(EXPECTED_SHA);
    expect(shaBefore).toBe(EXPECTED_SHA);
    expect(shaAfter).toBe(EXPECTED_SHA);
    expect(sha).toBe(shaBefore);
    expect(sha).toBe(shaAfter);
    expect(bytes).toBe(EXPECTED_BYTES);
  });

  test('Phase 2 inputs: KEEP=61, NEW=0, REVIEW=0, CS=3, EXCLUDED=39', () => {
    expect(keep.length).toBe(61);
    expect(newReady.length).toBe(0);
    expect(existingReview.length).toBe(0);
    expect(comingSoon.length).toBe(3);
    expect(excluded.length).toBe(39);
  });

  test('approved for production = 61; exact ID match with live production', () => {
    expect(approved.length).toBe(61);
    expect(approved.every(r => r.disposition === 'KEEP_EXISTING')).toBe(true);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(ltCenters.map(r => r.id));
    expect(approvedIds.size).toBe(61);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !approvedIds.has(id))).toEqual([]);
  });

  test('existing 61 unchanged; zero production write', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }
    const meta = report.metadata as {existing_rows_changed: number};
    expect(meta.existing_rows_changed).toBe(0);
    expect(report.production_write_performed).toBe(false);
  });

  test('exact production delta 0/0/0; idempotent second run', () => {
    const first = idempotency.first_run;
    expect(first.insertions).toBe(0);
    expect(first.updates).toBe(0);
    expect(first.removals).toBe(0);
    expect(first.total_before).toBe(11923);
    expect(first.total_after).toBe(11923);
    expect(first.lithuania_before).toBe(61);
    expect(first.lithuania_after).toBe(61);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);
    expect(idempotency.second_run?.updates ?? 0).toBe(0);
    expect(idempotency.second_run?.removals ?? 0).toBe(0);
    expect(idempotency.idempotent).toBe(true);
    const delta = report.delta as {insertions: number; updates: number; removals: number};
    expect(delta.insertions).toBe(0);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
  });

  test('Class A brand inventory: Gym+ 38, Lemon Gym 18, Impuls 5', () => {
    const byBrand: Record<string, number> = {};
    for (const c of ltCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    expect(report.brand_inventory_reconciles).toBe(true);
    const classA = report.class_a as {
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

  test('coming-soon and excluded identities absent from production', () => {
    const prodIds = new Set(ltCenters.map(c => c.id));
    for (const id of COMING_SOON_IDS) {
      expect(prodIds.has(id)).toBe(false);
    }
    const cs = report.coming_soon as {coming_soon_in_production: string[]};
    expect(cs.coming_soon_in_production).toEqual([]);
    expect(cs.coming_soon_inserted).toBe(0);
    const ex = report.excluded as {excluded_in_production: string[]};
    expect(ex.excluded_in_production).toEqual([]);
    expect(ex.excluded_inserted).toBe(0);
    expect(comingSoon.some(r => /viršuliškių|virsuliskiu/i.test(r.name))).toBe(true);
    expect(comingSoon.some(r => /riešė|riese/i.test(r.name))).toBe(true);
    expect(comingSoon.some(r => /jonava/i.test(r.name))).toBe(true);
  });

  test('Gym+ vs Gym! identity safety; cross-border and duplicates = 0', () => {
    expect(normalizeGymSearchValue('Gym+')).not.toBe(normalizeGymSearchValue('Gym!'));
    expect(ltCenters.some(c => c.brand === 'Gym!')).toBe(false);
    expect(dup.gym_plus_gym_exclamation_collisions).toBe(0);
    const cb = report.cross_border as Record<string, number>;
    expect(cb.latvia_outliers).toBe(0);
    expect(cb.poland_outliers).toBe(0);
    expect(cb.belarus_outliers).toBe(0);
    expect(cb.russia_kaliningrad_outliers).toBe(0);
    expect(dup.global_duplicate_ids).toBe(0);
    expect(dup.lithuania_duplicate_ids).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality for all 61 Lithuania rows', () => {
    for (const c of ltCenters) {
      expect(c.id).toMatch(/^lt_[a-f0-9]{10}$/);
      expect(c.country).toBe('Lithuania');
      expect(LITHUANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleLithuaniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('lt_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    const dq = report.data_quality as Record<string, number>;
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

    const sample = findCenterById('lt_70c41d18a7') ?? ltCenters[0];
    expect(formatGymDisplayName(sample)).toMatch(/Gym\+|Lemon|Impuls/i);
    const gpHits = searchGyms('Gym+').filter(h => h.gym.id.startsWith('lt_'));
    expect(gpHits.length).toBeGreaterThan(0);

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

    const vilnius = filterMapCentersInRegion(mapCenters, {
      latitude: 54.6872,
      longitude: 25.2797,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    });
    expect(vilnius.length).toBeGreaterThan(0);

    const lithuaniaGyms = getActiveGymsByCountry('Lithuania');
    expect(lithuaniaGyms.length).toBe(61);
    const nearVilnius = findNearestGym(54.6872, 25.2797, lithuaniaGyms);
    expect(nearVilnius?.id.startsWith('lt_')).toBe(true);
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const sampleId = ltCenters[0].id;
    const coords = getGymLatLngForCheckIn(sampleId);
    expect(coords).not.toBeNull();

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
    expect(report.crosses_12500).toBe(false);
    expect(report.remaining_headroom).toBe(577);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.lithuania_specific_runtime_hacks).toBe(0);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.verdict).toBe(
      'LITHUANIA RECONCILIATION COMPLETE — ZERO DELTA — WAITING FOR QA',
    );
  });
});
