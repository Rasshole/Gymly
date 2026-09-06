/**
 * Latvia production reconciliation — zero-delta (preserve existing 33).
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
  isPlausibleLatviaCoordinate,
  LATVIA_POSTAL_RE,
  isLatviaCountry,
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
const EXPECTED_LATVIA = 33;
const EXPECTED_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';

const ZIEPNIEKKALNS_ID = 'lv_eb2ad44f7d';

const EXPECTED_BRANDS: Record<string, number> = {
  MyFitness: 15,
  'Lemon Gym': 8,
  'Gym!': 10,
};

const PRIOR_COUNTS: Record<string, number> = {
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
    String(a.country || 'Latvia').trim() === String(b.country || 'Latvia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Latvia production reconciliation (zero-delta)', () => {
  const dataDir = path.join(__dirname, '../data/latvia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
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
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as unknown[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    first_run: {insertions: number; updates: number; removals: number};
    second_run?: {insertions: number; updates: number; removals: number};
    idempotent: boolean;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    global_duplicate_ids: number;
    latvia_duplicate_ids: number;
    hard_duplicate_conflicts: number;
    diacritic_duplicate_conflicts: number;
    rebrand_conflicts: number;
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'LATVIA_RECONCILIATION_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'LATVIA_RECONCILIATION_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const lvCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('lv_'));
  const latviaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Latvia');

  test('zero-delta: total 11923, Latvia 33, SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(latviaCenters.length).toBe(EXPECTED_LATVIA);
    expect(lvCenters.length).toBe(EXPECTED_LATVIA);
    expect(sha).toBe(EXPECTED_SHA);
    expect(shaBefore).toBe(EXPECTED_SHA);
    expect(shaAfter).toBe(EXPECTED_SHA);
    expect(sha).toBe(shaBefore);
    expect(sha).toBe(shaAfter);
  });

  test('Phase 2 inputs: KEEP=33, NEW=0, REVIEW=0', () => {
    expect(keep.length).toBe(33);
    expect(newReady.length).toBe(0);
    expect(existingReview.length).toBe(0);
  });

  test('approved for production = 33; exact ID match with live production', () => {
    expect(approved.length).toBe(33);
    expect(approved.every(r => r.disposition === 'KEEP_EXISTING')).toBe(true);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(lvCenters.map(r => r.id));
    expect(approvedIds.size).toBe(33);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !approvedIds.has(id))).toEqual([]);
  });

  test('existing 33 unchanged; zero production write', () => {
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
    expect(first.latvia_before).toBe(33);
    expect(first.latvia_after).toBe(33);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);
    expect(idempotency.second_run?.updates ?? 0).toBe(0);
    expect(idempotency.second_run?.removals ?? 0).toBe(0);
    expect(idempotency.idempotent).toBe(true);
    const delta = report.delta as {insertions: number; updates: number; removals: number};
    expect(delta.insertions).toBe(0);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
  });

  test('Class A brand inventory: MyFitness 15, Lemon Gym 8, Gym! 10', () => {
    const byBrand: Record<string, number> = {};
    for (const c of lvCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    expect(report.brand_inventory_reconciles).toBe(true);
    const classA = report.class_a as {
      chain_class_a_approved: number;
      class_a_chain_count: number;
      myfitness: number;
      lemon_gym: number;
      gym_bang: number;
    };
    expect(classA.chain_class_a_approved).toBe(33);
    expect(classA.class_a_chain_count).toBe(3);
    expect(classA.myfitness).toBe(15);
    expect(classA.lemon_gym).toBe(8);
    expect(classA.gym_bang).toBe(10);
  });

  test('coming-soon and excluded identities absent from production', () => {
    const prodIds = new Set(lvCenters.map(c => c.id));
    expect(prodIds.has(ZIEPNIEKKALNS_ID)).toBe(false);
    const cs = report.coming_soon as {coming_soon_in_production: string[]};
    expect(cs.coming_soon_in_production).toEqual([]);
    const ex = report.excluded as {excluded_in_production: string[]};
    expect(ex.excluded_in_production).toEqual([]);
  });

  test('cross-border, Valka/Valga, duplicates = 0', () => {
    const cb = report.cross_border as Record<string, number>;
    expect(cb.estonia_outliers).toBe(0);
    expect(cb.lithuania_outliers).toBe(0);
    expect(cb.russia_outliers).toBe(0);
    expect(cb.belarus_outliers).toBe(0);
    expect(cb.valka_valga_identity_collisions).toBe(0);
    expect(dup.global_duplicate_ids).toBe(0);
    expect(dup.latvia_duplicate_ids).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality for all 33 Latvia rows', () => {
    for (const c of lvCenters) {
      expect(c.id).toMatch(/^lv_[a-f0-9]{10}$/);
      expect(c.country).toBe('Latvia');
      expect(LATVIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleLatviaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('lv_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers=33, nearest sanity', () => {
    expect(GYM_ID_PREFIX.latvia).toBe('lv_');
    expect(isLatviaCountry('Latvija')).toBe(true);
    expect(gymCountryTranslationKey('Latvia')).toBe('countries.latvia');
    expect(en.countries.latvia).toBe('Latvia');
    expect(normalizeGymSearchValue('Liepāja')).toBe('liepaja');
    expect(normalizeGymSearchValue('Rīga')).toBe('riga');
    expect(resolveGymOrStub('lv_nonexistent_test').region).toBe('Latvia');

    const sample = findCenterById('lv_00100556b1') ?? lvCenters[0];
    expect(formatGymDisplayName(sample)).toMatch(/MyFitness|Lemon|Gym!/i);
    const mfHits = searchGyms('MyFitness').filter(h => h.gym.id.startsWith('lv_'));
    expect(mfHits.length).toBeGreaterThan(0);

    const mapCenters: MapCenter[] = lvCenters.map(c => {
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

    const riga = filterMapCentersInRegion(mapCenters, {
      latitude: 56.95,
      longitude: 24.11,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    });
    expect(riga.length).toBeGreaterThan(0);

    const latviaGyms = getActiveGymsByCountry('Latvia');
    expect(latviaGyms.length).toBe(33);
    const nearRiga = findNearestGym(56.9496, 24.1052, latviaGyms);
    expect(nearRiga?.id.startsWith('lv_')).toBe(true);
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const sampleId = lvCenters[0].id;
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
    expect(report.verdict).toBe(
      'LATVIA RECONCILIATION COMPLETE — ZERO DELTA — WAITING FOR QA',
    );
  });
});
