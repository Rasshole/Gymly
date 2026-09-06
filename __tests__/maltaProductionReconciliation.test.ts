/**
 * Malta production reconciliation — preserve 18 + insert 6 NEW_READY.
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

const EXPECTED_TOTAL = 11929;
const EXPECTED_MALTA = 24;
const PRE_SHA =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';
const PRE_BYTES = 3706426;

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

function identityMatch(
  a: {
    name?: string;
    brand?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  },
  b: {
    name?: string;
    brand?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
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

describe('Malta production reconciliation (+6 NEW_READY)', () => {
  const dataDir = path.join(__dirname, '../data/malta');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; address: string; postal_code: string; city: string; lat: number; lng: number}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; address: string; postal_code: string; city: string; lat: number; lng: number}>;
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Array<{id: string; name: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const closed = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_CLOSED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; disposition: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    first_run: {insertions: number; updates: number; removals: number};
    second_run?: {insertions: number; updates: number; removals: number};
    idempotent: boolean;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    diacritic_duplicate_conflicts: number;
    multilingual_duplicate_conflicts: number;
    rebrand_conflicts: number;
  };

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'MALTA_RECONCILIATION_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'MALTA_RECONCILIATION_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const mtCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_'));
  const maltaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Malta');

  test('post-reconciliation: total 11929, Malta 24, mt_* 24', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(maltaCenters.length).toBe(EXPECTED_MALTA);
    expect(mtCenters.length).toBe(EXPECTED_MALTA);
    expect(sha).toBe(shaAfter);
    expect(shaBefore).toBe(PRE_SHA);
    expect(sha).not.toBe(PRE_SHA);
    expect(bytes).toBeGreaterThan(PRE_BYTES);
  });

  test('Phase 2 inputs: KEEP=18, NEW=6, REVIEW=0, CS=1, EXCLUDED=73, CLOSED=3', () => {
    expect(keep.length).toBe(18);
    expect(newReady.length).toBe(6);
    expect(existingReview.length).toBe(0);
    expect(comingSoon.length).toBe(1);
    expect(excluded.length).toBe(73);
    expect(closed.length).toBe(3);
    expect(newReady.map(r => r.id).sort()).toEqual([...NEW_READY_IDS].sort());
  });

  test('approved for production = 24; exact ID match with live production', () => {
    expect(approved.length).toBe(24);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(mtCenters.map(r => r.id));
    expect(approvedIds.size).toBe(24);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !approvedIds.has(id))).toEqual([]);
  });

  test('existing 18 unchanged; six NEW_READY inserted exactly once', () => {
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      expect(p).toBeDefined();
      expect(identityMatch(k, p)).toBe(true);
    }
    for (const n of newReady) {
      const rows = mtCenters.filter(c => c.id === n.id);
      expect(rows.length).toBe(1);
      expect(identityMatch(n, rows[0])).toBe(true);
    }
    const meta = report.metadata as {existing_rows_changed: number};
    expect(meta.existing_rows_changed).toBe(0);
  });

  test('exact production delta +6/0/0; idempotent second run', () => {
    const first = idempotency.first_run;
    expect(first.insertions).toBe(6);
    expect(first.updates).toBe(0);
    expect(first.removals).toBe(0);
    expect(first.total_before).toBe(11923);
    expect(first.total_after).toBe(11929);
    expect(first.malta_before).toBe(18);
    expect(first.malta_after).toBe(24);
    expect(idempotency.second_run?.insertions ?? 0).toBe(0);
    expect(idempotency.second_run?.updates ?? 0).toBe(0);
    expect(idempotency.second_run?.removals ?? 0).toBe(0);
    expect(idempotency.idempotent).toBe(true);
  });

  test('Class A + independent brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of mtCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    const classification = report.classification as {
      chain_class_a: number;
      small_market_independent: number;
    };
    expect(classification.chain_class_a).toBe(18);
    expect(classification.small_market_independent).toBe(6);
  });

  test('Fort Fitness, Cynergi, ActiveZone, Kinetika QA', () => {
    expect(mtCenters.filter(c => c.brand === 'Fort Fitness').length).toBe(2);
    expect(mtCenters.some(c => c.name === 'Fort Fitness Sliema')).toBe(true);
    expect(mtCenters.some(c => c.name === 'Fort Fitness Mrieħel')).toBe(true);
    expect(mtCenters.filter(c => c.brand === 'Cynergi').length).toBe(1);
    expect(mtCenters.filter(c => c.brand === 'ActiveZone').length).toBe(1);
    expect(mtCenters.filter(c => c.brand === 'Kinetika Gozo').length).toBe(2);
    expect(mtCenters.filter(c => c.name.includes('Kinetika Victoria')).length).toBe(1);
    expect(mtCenters.filter(c => c.name.includes('Kinetika Xewkija')).length).toBe(1);
    for (const c of mtCenters.filter(x => x.brand === 'Kinetika Gozo')) {
      expect(c.country).toBe('Malta');
    }
  });

  test('coming-soon, excluded, closed, Fitness Café absent from production', () => {
    const prodIds = new Set(mtCenters.map(c => c.id));
    expect(prodIds.has(COMING_SOON_ID)).toBe(false);
    expect(prodIds.has(FITNESS_CAFE_ID)).toBe(false);
    for (const row of excluded) {
      expect(prodIds.has(row.id)).toBe(false);
    }
    for (const row of closed) {
      expect(prodIds.has(row.id)).toBe(false);
    }
    const cs = report.coming_soon as {coming_soon_production_leakage: string[]; bgm_birgu_in_production: number};
    expect(cs.coming_soon_production_leakage).toEqual([]);
    expect(cs.bgm_birgu_in_production).toBe(0);
    const ex = report.excluded as {excluded_production_leakage: string[]; fitness_cafe_active_identities: number};
    expect(ex.excluded_production_leakage).toEqual([]);
    expect(ex.fitness_cafe_active_identities).toBe(0);
    const cl = report.closed as {closed_production_leakage: string[]};
    expect(cl.closed_production_leakage).toEqual([]);
  });

  test('cross-border, duplicates = 0', () => {
    const cb = report.cross_border as Record<string, number>;
    expect(cb.italy_outliers).toBe(0);
    expect(cb.sicily_outliers).toBe(0);
    expect(cb.other_foreign_outliers).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.multilingual_duplicate_conflicts).toBe(0);
    expect(dup.rebrand_conflicts).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality for all 24 Malta rows', () => {
    for (const c of mtCenters) {
      expect(c.id).toMatch(/^mt_[a-f0-9]{10}$/);
      expect(c.country).toBe('Malta');
      expect(MALTA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleMaltaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('mt_')).toBe(false);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    const dq = report.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('search/display, map markers, nearest sanity', () => {
    expect(GYM_ID_PREFIX.malta).toBe('mt_');
    expect(isMaltaCountry('Malta')).toBe(true);
    expect(isMaltaCountry('Republic of Malta')).toBe(true);
    expect(gymCountryTranslationKey('Malta')).toBe('countries.malta');
    expect(en.countries.malta).toBe('Malta');
    expect(normalizeGymSearchValue('Gżira')).toBe('gzira');
    expect(normalizeGymSearchValue("St Julian's")).toMatch(/st julian/);
    expect(searchGyms('Malta').some(h => h.gym.country === 'Malta')).toBe(true);
    expect(searchGyms('Sliema').some(h => h.gym.id === 'mt_2f5b8d74db')).toBe(true);
    expect(resolveGymOrStub('mt_nonexistent_test').region).toBe('Malta');

    for (const id of NEW_READY_IDS) {
      const center = findCenterById(id)!;
      expect(formatGymDisplayName(center)).not.toMatch(/^mt_/);
      const hits = searchGyms(center.brand).filter(h => h.gym.id === id);
      expect(hits.length).toBeGreaterThan(0);
    }

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

    const sliema = filterMapCentersInRegion(mapCenters, {
      latitude: 35.912,
      longitude: 14.504,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
    expect(sliema.some(c => c.id === 'mt_2f5b8d74db')).toBe(true);

    const maltaGyms = getActiveGymsByCountry('Malta');
    expect(maltaGyms.length).toBe(24);
    const nearValletta = findNearestGym(35.898, 14.514, maltaGyms);
    expect(nearValletta?.country).toBe('Malta');
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m for new gyms', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    for (const id of ['mt_26d7f37a30', ...NEW_READY_IDS]) {
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      const center = findCenterById(id)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
    }

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
    expect(getActiveGymsByCountry('Malta').length).toBe(24);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.remaining_headroom).toBe(571);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.verdict).toBe('MALTA RECONCILIATION COMPLETE — WAITING FOR QA');
  });
});
