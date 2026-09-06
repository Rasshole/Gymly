/**
 * Azerbaijan Production QA — final read-only validation gate.
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
  isPlausibleAzerbaijanCoordinate,
  AZERBAIJAN_POSTAL_RE,
  isAzerbaijanCountry,
} from '../src/utils/gymCountry';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const LIVE_SHA =
  '1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1';
const EXPECTED_TOTAL = 12385;
const EXPECTED_AZERBAIJAN = 46;
const EXPECTED_ARMENIA = 36;
const EXPECTED_GE = 25;
const EXPECTED_BYTES = 3858778;
const HEADROOM = 115;

const CLASS_A_COUNTS: Record<string, number> = {
  'FS Club Network': 3,
};

const CURATED_COUNTS: Record<string, number> = {
  'World Class Azerbaijan': 1,
  '1st Fitness': 1,
  FitClub: 1,
  'Fit Way': 1,
  Pulse: 1,
  "Gold's Gym": 1,
  'Sport Life': 1,
  'Dream Body': 1,
};

const EXPECTED_CITY_COUNTS: Record<string, number> = {
  Baku: 21,
  Sumqayit: 12,
  Ganja: 8,
  Mingachevir: 2,
  Lankaran: 2,
  Masazır: 1,
};

const PRIOR_COUNTS: Record<string, number> = {
  Armenia: 36,
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
    String(a.country || 'Azerbaijan').trim() === String(b.country || 'Azerbaijan').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Azerbaijan Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/azerbaijan');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
      OTHER_TEST_DEBT: number;
    };
  };
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
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
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const needsReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_NEEDS_REVIEW.json'), 'utf8'),
  ) as Array<{id: string}>;
  const regionalCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_REGIONAL_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps: number};
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {nakhchivan_material_d: string};
  const chainAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_CLASS_A_AUDIT.json'), 'utf8'),
  ) as {
    estate_gaps: number;
    production_drift: unknown[];
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    azerbaijani_transliteration_duplicate_conflicts: number;
  };
  const searchMap = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_SEARCH_DISPLAY.json'), 'utf8'),
  ) as {search_display_qa: string; active_map_markers: number; raw_ids_surfaced: number};
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_PERFORMANCE.json'), 'utf8'),
  ) as {status: string};
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const mergeReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'AZERBAIJAN_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as {delta: {insertions: number; updates: number; removals: number}};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'AZERBAIJAN_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const azerbaijan = ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_'));

  test('frozen post-merge baseline — 12385 / Azerbaijan 46 / SHA+bytes exact', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(azerbaijan.length).toBe(EXPECTED_AZERBAIJAN);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(EXPECTED_ARMENIA);
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

  test('inventory reconciliation A = B = C = 46', () => {
    expect(phase2Approved.length).toBe(46);
    expect(approved.length).toBe(46);
    expect(azerbaijan.length).toBe(46);
    const a = new Set(phase2Approved.map(r => r.id));
    const b = new Set(approved.map(r => r.id));
    const c = new Set(azerbaijan.map(r => r.id));
    for (const id of a) {
      expect(b.has(id)).toBe(true);
      expect(c.has(id)).toBe(true);
    }
  });

  test('Phase 2 provenance — 434 recovered, NR/NC = 0, material D = 0', () => {
    expect(needsReview.length).toBe(0);
    expect(excluded.length).toBe(388);
    expect(regionalCov.material_d_gaps).toBe(0);
    expect(cityCov.nakhchivan_material_d).toBe('NO');
    expect(chainAudit.estate_gaps).toBe(0);
    expect(chainAudit.production_drift.length).toBe(0);
  });

  test('authorized material drift = 0', () => {
    for (const row of approved) {
      const live = azerbaijan.find(r => r.id === row.id);
      expect(live).toBeDefined();
      expect(identityMatch(row, live!)).toBe(true);
    }
  });

  test('merge reconstruction +46/0/0 and Class A + curated inventory exact', () => {
    expect(mergeReport.delta.insertions).toBe(46);
    expect(mergeReport.delta.updates).toBe(0);
    expect(mergeReport.delta.removals).toBe(0);

    const byBrand = azerbaijan.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    for (const [brand, n] of Object.entries(CURATED_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(46);
  });

  test('city inventory exact — Baku 21, Sumqayit 12, Ganja 8, regional cities', () => {
    const byCity = azerbaijan.reduce<Record<string, number>>((acc, r) => {
      acc[r.city] = (acc[r.city] ?? 0) + 1;
      return acc;
    }, {});
    for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
      expect(byCity[city]).toBe(n);
    }
    expect(Object.values(byCity).reduce((a, b) => a + b, 0)).toBe(46);
  });

  test('safety — non-ready buckets, Nakhchivan, conflict region absent from production', () => {
    const exIds = new Set(excluded.map(r => r.id));
    const nrIds = new Set(needsReview.map(r => r.id));
    expect(azerbaijan.some(r => exIds.has(r.id))).toBe(false);
    expect(azerbaijan.some(r => nrIds.has(r.id))).toBe(false);
    expect(azerbaijan.some(r => /nakhchivan|naxcivan|naxçıvan/i.test(String(r.city)))).toBe(
      false,
    );
  });

  test('production data quality — IDs, postcodes, coords, no duplicates', () => {
    for (const r of azerbaijan) {
      expect(r.id.startsWith(GYM_ID_PREFIX.azerbaijan)).toBe(true);
      expect(r.country).toBe('Azerbaijan');
      expect(AZERBAIJAN_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleAzerbaijanCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('az_')).toBe(false);
    }
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.azerbaijani_transliteration_duplicate_conflicts).toBe(0);
    expect(new Set(azerbaijan.map(r => r.id)).size).toBe(46);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('infrastructure / search / check-in / scale / QA immutability', () => {
    expect(isAzerbaijanCountry('Azerbaijan')).toBe(true);
    expect(gymCountryTranslationKey('Azerbaijan')).toBe('countries.azerbaijan');
    expect(en.countries.azerbaijan).toBeTruthy();
    expect(resolveGymOrStub(azerbaijan[0].id).country).toBe('Azerbaijan');

    expect(searchGyms('FS Club Network').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Azerbaijan').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Azərbaycan').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(searchGyms('Bakı').some(h => h.gym.country === 'Azerbaijan')).toBe(true);
    expect(normalizeGymSearchValue(azerbaijan[0].name)).not.toBe(azerbaijan[0].id);

    const gym: DanishGym = {
      id: azerbaijan[0].id,
      name: azerbaijan[0].name,
      city: azerbaijan[0].city,
      address: azerbaijan[0].address,
      postalCode: azerbaijan[0].postal_code,
      country: 'Azerbaijan',
      region: 'Azerbaijan',
      latitude: azerbaijan[0].lat!,
      longitude: azerbaijan[0].lng!,
      brand: azerbaijan[0].brand,
      _center: azerbaijan[0] as never,
    };
    expect(findNearestGym(40.4093, 49.8671, [gym])?.country).toBe('Azerbaijan');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(searchMap.search_display_qa).toBe('PASS');
    expect(searchMap.active_map_markers).toBe(46);
    expect(searchMap.raw_ids_surfaced).toBe(0);
    expect(idempotency.idempotent).toBe(true);
    expect(idempotency.second_run.insertions).toBe(0);

    expect(qaReport.verdict).toBe('AZERBAIJAN STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect((qaReport.scale as {headroom: number}).headroom).toBe(HEADROOM);
    expect((qaReport.scale as {crosses_12500: boolean}).crosses_12500).toBe(false);
    expect(perf.status).toBe('HEALTHY');
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect((qaReport.qa_immutability as {delta_insertions: number}).delta_insertions).toBe(0);
  });
});
