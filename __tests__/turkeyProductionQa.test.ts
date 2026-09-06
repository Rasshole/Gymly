/**
 * Turkey Production QA — final read-only validation gate.
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
  isPlausibleTurkeyCoordinate,
  TURKEY_POSTAL_RE,
  isTurkeyCountry,
} from '../src/utils/gymCountry';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const LIVE_SHA =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';
const EXPECTED_TOTAL = 12278;
const EXPECTED_TURKEY = 198;
const EXPECTED_BYTES = 3824712;
const HEADROOM = 222;

const FORBIDDEN_IDS = [
  'tr_826349ad23',
  'tr_fe66cda12c',
  'tr_716f911874',
  'tr_dd6d274fc0',
];

const CLASS_A_COUNTS: Record<string, number> = {
  MACFit: 34,
  'B-Fit': 3,
  GymFit: 20,
  'Sports International': 5,
  'Mars Athletic Club': 2,
};

const PRIOR_COUNTS: Record<string, number> = {
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
    String(a.country || 'Turkey').trim() === String(b.country || 'Turkey').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Turkey Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/turkey');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_QA_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSION: number;
      STALE_HISTORICAL_BASELINE: number;
    };
  };
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
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
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Array<{id: string}>;
  const excluded = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_EXCLUDED.json'), 'utf8'),
  ) as Array<{id: string}>;
  const provinceCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_PROVINCE_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; provinces: Record<string, string>};
  const chainAudit = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {summary: {class_a_estate_gaps: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_QA_DUPLICATES.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; turkish_diacritic_duplicate_conflicts: number};
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_QA_PERFORMANCE.json'), 'utf8'),
  ) as {status: string};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.readFileSync(centersPath).length;

  const turkey = ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_'));

  test('frozen post-merge baseline — 12278 / Turkey 198 / SHA+bytes exact', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(turkey.length).toBe(EXPECTED_TURKEY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(46);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(105);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(24);
    expect(sha).toBe(LIVE_SHA);
    expect(bytes).toBe(EXPECTED_BYTES);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
  });

  test('inventory reconciliation A = B = C = 198', () => {
    expect(phase2Approved.length).toBe(198);
    expect(approved.length).toBe(198);
    expect(turkey.length).toBe(198);
    const a = new Set(phase2Approved.map(r => r.id));
    const b = new Set(approved.map(r => r.id));
    const c = new Set(turkey.map(r => r.id));
    for (const id of a) {
      expect(b.has(id)).toBe(true);
      expect(c.has(id)).toBe(true);
    }
  });

  test('authorized material drift = 0', () => {
    for (const row of approved) {
      const live = turkey.find(r => r.id === row.id);
      expect(live).toBeDefined();
      expect(identityMatch(row, live!)).toBe(true);
    }
  });

  test('Class A brand inventory + estate gaps = 0', () => {
    const byBrand = turkey.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(byBrand.LifeClub ?? 0).toBe(0);
    expect(chainAudit.summary.class_a_estate_gaps).toBe(0);
  });

  test('safety gates — forbidden NR/CS absent, CS/EX not in production', () => {
    for (const id of FORBIDDEN_IDS) {
      expect(turkey.some(r => r.id === id)).toBe(false);
    }
    expect(comingSoon.length).toBe(2);
    expect(excluded.length).toBe(19);
    const csIds = new Set(comingSoon.map(r => r.id));
    const exIds = new Set(excluded.map(r => r.id));
    expect(turkey.some(r => csIds.has(r.id))).toBe(false);
    expect(turkey.some(r => exIds.has(r.id))).toBe(false);
    expect(turkey.some(r => r.brand === 'LifeClub')).toBe(false);
  });

  test('material D gaps = 0 and 81 provinces', () => {
    expect(provinceCov.material_d_gaps_count).toBe(0);
    expect(Object.keys(provinceCov.provinces).length).toBe(81);
    expect(['Diyarbakır', 'Gaziantep', 'Kayseri', 'Mersin'].every(
      p => provinceCov.provinces[p] !== 'D',
    )).toBe(true);
  });

  test('production data quality — IDs, postcodes, coords, no duplicates', () => {
    for (const r of turkey) {
      expect(r.id.startsWith(GYM_ID_PREFIX.turkey)).toBe(true);
      expect(r.country).toBe('Turkey');
      expect(TURKEY_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleTurkeyCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('tr_')).toBe(false);
    }
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.turkish_diacritic_duplicate_conflicts).toBe(0);
    expect(new Set(turkey.map(r => r.id)).size).toBe(198);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('infrastructure / search / check-in / scale / QA immutability', () => {
    expect(isTurkeyCountry('Turkey')).toBe(true);
    expect(gymCountryTranslationKey('Turkey')).toBe('countries.turkey');
    expect(en.countries.turkey).toBeTruthy();
    expect(resolveGymOrStub(turkey[0].id).country).toBe('Turkey');

    const hits = searchGyms('MACFit');
    expect(hits.some(h => h.gym.country === 'Turkey')).toBe(true);
    expect(normalizeGymSearchValue(turkey[0].name)).not.toBe(turkey[0].id);

    const gym: DanishGym = {
      id: turkey[0].id,
      name: turkey[0].name,
      city: turkey[0].city,
      address: turkey[0].address,
      postalCode: turkey[0].postal_code,
      country: 'Turkey',
      region: 'Turkey',
      latitude: turkey[0].lat!,
      longitude: turkey[0].lng!,
      brand: turkey[0].brand,
      _center: turkey[0] as never,
    };
    expect(findNearestGym(41.01, 28.97, [gym])?.country).toBe('Turkey');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(qaReport.verdict).toBe('TURKEY STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    expect((qaReport.scale as {headroom: number}).headroom).toBe(HEADROOM);
    expect((qaReport.scale as {crosses_12500: boolean}).crosses_12500).toBe(false);
    expect(perf.status).toBe('HEALTHY');
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSION).toBe(0);
    expect((qaReport.qa_immutability as {delta_insertions: number}).delta_insertions).toBe(0);
  });
});
