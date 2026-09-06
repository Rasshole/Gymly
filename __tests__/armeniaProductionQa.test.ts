/**
 * Armenia Production QA — final read-only validation gate.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {
  isPlausibleArmeniaCoordinate,
  ARMENIA_POSTAL_RE,
  isArmeniaCountry,
} from '../src/utils/gymCountry';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const LIVE_SHA =
  '7ddc9977a7273668b3fcc6edb68b9a490b873e478bccd1e51b9f31710a2585e7';
const EXPECTED_TOTAL = 12339;
const EXPECTED_ARMENIA = 36;
const EXPECTED_GE = 25;
const EXPECTED_BYTES = 3844273;
const HEADROOM = 161;

const CLASS_A_COUNTS: Record<string, number> = {
  'Orange Fitness': 6,
};

const CURATED_COUNTS: Record<string, number> = {
  "Gold's Gym": 1,
  'Panorama Fitness': 1,
  'World Gym Armenia': 1,
  'Energy Fitness': 1,
  'Grand Sport Club': 1,
};

const EXPECTED_CITY_COUNTS: Record<string, number> = {
  Yerevan: 27,
  Vanadzor: 2,
  Gyumri: 1,
  Abovyan: 1,
  Hrazdan: 1,
  Kapan: 1,
  Armavir: 1,
  Goris: 1,
  'Մասիս': 1,
};

const PRIOR_COUNTS: Record<string, number> = {
  Georgia: 25,
  Turkey: 198,
  Belarus: 46,
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
    String(a.country || 'Armenia').trim() === String(b.country || 'Armenia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Armenia Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/armenia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
      OTHER_TEST_DEBT: number;
    };
  };
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
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
  const phase2Approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const needsReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_NEEDS_REVIEW.json'), 'utf8'),
  ) as Array<{id: string}>;
  const regionalCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {dilijan_material_d: string};
  const chainAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {
    summary: {class_a_estate_gaps: number; missed_class_a_estate_gaps: number};
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_DUPLICATES.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    armenian_transliteration_duplicate_conflicts: number;
  };
  const searchMap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_SEARCH_MAP.json'), 'utf8'),
  ) as {search_display_qa: string; active_map_markers: number; raw_ids_surfaced: number};
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {status: string};
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const mergeReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as {delta: {insertions: number; updates: number; removals: number}};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'ARMENIA_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const armenia = ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_'));

  test('frozen post-merge baseline — 12339 / Armenia 36 / SHA+bytes exact', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(armenia.length).toBe(EXPECTED_ARMENIA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(EXPECTED_GE);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(198);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_SHA);
    expect(bytes).toBe(EXPECTED_BYTES);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
  });

  test('inventory reconciliation A = B = C = 36', () => {
    expect(phase2Approved.length).toBe(36);
    expect(approved.length).toBe(36);
    expect(armenia.length).toBe(36);
    const a = new Set(phase2Approved.map(r => r.id));
    const b = new Set(approved.map(r => r.id));
    const c = new Set(armenia.map(r => r.id));
    for (const id of a) {
      expect(b.has(id)).toBe(true);
      expect(c.has(id)).toBe(true);
    }
  });

  test('Phase 2 provenance — 312 recovered, NR/NC = 0, material D = 0', () => {
    expect(needsReview.length).toBe(0);
    expect(excluded.length).toBe(276);
    expect(regionalCov.material_d_gaps_count).toBe(0);
    expect(cityCov.dilijan_material_d).toBe('NO');
    expect(chainAudit.summary.class_a_estate_gaps).toBe(0);
    expect(chainAudit.summary.missed_class_a_estate_gaps).toBe(0);
  });

  test('authorized material drift = 0', () => {
    for (const row of approved) {
      const live = armenia.find(r => r.id === row.id);
      expect(live).toBeDefined();
      expect(identityMatch(row, live!)).toBe(true);
    }
  });

  test('merge reconstruction +36/0/0 and Class A + curated inventory exact', () => {
    expect(mergeReport.delta.insertions).toBe(36);
    expect(mergeReport.delta.updates).toBe(0);
    expect(mergeReport.delta.removals).toBe(0);

    const byBrand = armenia.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    for (const [brand, n] of Object.entries(CURATED_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(36);
  });

  test('city inventory exact — Yerevan 27, Vanadzor 2, regional cities', () => {
    const byCity = armenia.reduce<Record<string, number>>((acc, r) => {
      acc[r.city] = (acc[r.city] ?? 0) + 1;
      return acc;
    }, {});
    for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
      expect(byCity[city]).toBe(n);
    }
    expect(Object.values(byCity).reduce((a, b) => a + b, 0)).toBe(36);
  });

  test('safety — non-ready buckets, Dilijan, conflict region absent from production', () => {
    const exIds = new Set(excluded.map(r => r.id));
    const nrIds = new Set(needsReview.map(r => r.id));
    expect(armenia.some(r => exIds.has(r.id))).toBe(false);
    expect(armenia.some(r => nrIds.has(r.id))).toBe(false);
    expect(armenia.some(r => /dilijan|դիլիջան/i.test(String(r.city)))).toBe(false);
  });

  test('production data quality — IDs, postcodes, coords, no duplicates', () => {
    for (const r of armenia) {
      expect(r.id.startsWith(GYM_ID_PREFIX.armenia)).toBe(true);
      expect(r.country).toBe('Armenia');
      expect(ARMENIA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleArmeniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('am_')).toBe(false);
    }
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.armenian_transliteration_duplicate_conflicts).toBe(0);
    expect(new Set(armenia.map(r => r.id)).size).toBe(36);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('infrastructure / search / check-in / scale / QA immutability', () => {
    expect(isArmeniaCountry('Armenia')).toBe(true);
    expect(gymCountryTranslationKey('Armenia')).toBe('countries.armenia');
    expect(en.countries.armenia).toBeTruthy();
    expect(resolveGymOrStub(armenia[0].id).country).toBe('Armenia');

    expect(searchGyms('Orange Fitness').some(h => h.gym.country === 'Armenia')).toBe(true);
    expect(searchGyms('Armenia').some(h => h.gym.country === 'Armenia')).toBe(true);
    expect(searchGyms('Հայաստան').some(h => h.gym.country === 'Armenia')).toBe(true);
    expect(searchGyms('Երևան').some(h => h.gym.country === 'Armenia')).toBe(true);
    expect(normalizeGymSearchValue(armenia[0].name)).not.toBe(armenia[0].id);

    const gym: DanishGym = {
      id: armenia[0].id,
      name: armenia[0].name,
      city: armenia[0].city,
      address: armenia[0].address,
      postalCode: armenia[0].postal_code,
      country: 'Armenia',
      region: 'Armenia',
      latitude: armenia[0].lat!,
      longitude: armenia[0].lng!,
      brand: armenia[0].brand,
      _center: armenia[0] as never,
    };
    expect(findNearestGym(40.181, 44.514, [gym])?.country).toBe('Armenia');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(searchMap.search_display_qa).toBe('PASS');
    expect(searchMap.active_map_markers).toBe(36);
    expect(searchMap.raw_ids_surfaced).toBe(0);
    expect(idempotency.idempotent).toBe(true);
    expect(idempotency.second_run.insertions).toBe(0);

    expect(qaReport.verdict).toBe('ARMENIA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect((qaReport.scale as {headroom: number}).headroom).toBe(HEADROOM);
    expect((qaReport.scale as {crosses_12500: boolean}).crosses_12500).toBe(false);
    expect(perf.status).toBe('HEALTHY');
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect((qaReport.qa_immutability as {delta_insertions: number}).delta_insertions).toBe(0);
  });
});
