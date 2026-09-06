/**
 * Turkey production merge — post-merge catalog integrity (+198 greenfield).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleTurkeyCoordinate,
  TURKEY_POSTAL_RE,
  isTurkeyCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|\uFFFD|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

const EXPECTED_TOTAL = 12278;
const EXPECTED_TURKEY = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const EXPECTED_BYTES_BEFORE = 3761727;
const PRE_MERGE_SHA =
  '601e7848e80478002da147bf34287b701e2fd95ff2a21e493e0d70aed002b740';
const POST_MERGE_SHA =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';

const CLASS_A_COUNTS: Record<string, number> = {
  MACFit: 34,
  'B-Fit': 3,
  GymFit: 20,
  'Sports International': 5,
  'Mars Athletic Club': 2,
};

const FORBIDDEN_IDS = [
  'tr_826349ad23',
  'tr_fe66cda12c',
  'tr_716f911874',
  'tr_dd6d274fc0',
];

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

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Turkey',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Turkey production merge (+198 greenfield)', () => {
  const dataDir = path.join(__dirname, '../data/turkey');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string; address: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'TURKEY_MERGE_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'TURKEY_MERGE_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'TURKEY_MERGE_SHA_AFTER.txt'), 'utf8')
    .trim();

  const turkey = ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_'));

  test('post total = 12278 / Turkey = 198 / SHA changed from pre-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(turkey.length).toBe(EXPECTED_TURKEY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(EXPECTED_TURKEY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(EXPECTED_BY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(EXPECTED_UA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(EXPECTED_MT);
    expect(shaBefore).toBe(PRE_MERGE_SHA);
    expect(sha).toBe(shaAfter);
    expect(sha).toBe(POST_MERGE_SHA);
    expect(sha).not.toBe(PRE_MERGE_SHA);
    expect(report.production_bytes_before).toBe(EXPECTED_BYTES_BEFORE);
    expect(bytes).toBeGreaterThan(EXPECTED_BYTES_BEFORE);
  });

  test('approved = 198 and matches production Turkey IDs exactly', () => {
    expect(approved.length).toBe(198);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(turkey.map(r => r.id));
    expect(approvedIds.size).toBe(198);
    expect(prodIds.size).toBe(198);
    for (const id of approvedIds) {
      expect(prodIds.has(id)).toBe(true);
    }
  });

  test('Class A brand inventory exact', () => {
    const byBrand = turkey.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(byBrand.LifeClub ?? 0).toBe(0);
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(198);
  });

  test('forbidden identities absent — Kemer/Manavgat NR, GymFit CS', () => {
    for (const id of FORBIDDEN_IDS) {
      expect(turkey.some(c => c.id === id)).toBe(false);
    }
  });

  test('all 198 rows production-grade — tr_ IDs, postcodes, coords, no leakage', () => {
    const csIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_COMING_SOON.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'TURKEY_PHASE2_EXCLUDED.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    for (const r of turkey) {
      expect(r.id).toMatch(/^tr_[a-f0-9]{10}$/);
      expect(r.country).toBe('Turkey');
      expect(TURKEY_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleTurkeyCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(r.is_active).not.toBe(false);
      expect(csIds.has(r.id)).toBe(false);
      expect(exIds.has(r.id)).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('tr_')).toBe(false);
    }
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('country resolution / search / check-in / idempotency / scale', () => {
    expect(isTurkeyCountry('Turkey')).toBe(true);
    expect(isTurkeyCountry('Türkiye')).toBe(true);
    expect(gymCountryTranslationKey('Turkey')).toBe('countries.turkey');
    expect(en.countries.turkey).toBeTruthy();
    expect(GYM_ID_PREFIX.turkey).toBe('tr_');

    const istanbul = searchGyms('Istanbul');
    expect(istanbul.some(h => h.gym.country === 'Turkey')).toBe(true);
    expect(searchGyms('MACFit').some(h => h.gym.country === 'Turkey')).toBe(true);

    const probe = turkey[0];
    const gym = toGym(probe);
    const resolved = resolveGymOrStub(probe.id);
    expect(resolved?.country).toBe('Turkey');
    expect(normalizeGymSearchValue(resolved?.name ?? '')).not.toBe(probe.id);

    const near = findNearestGym(41.01, 28.97, [gym]);
    expect(near?.country).toBe('Turkey');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(idem.idempotent).toBe(true);
    expect(idem.second_run.insertions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(report.verdict).toBe('TURKEY MERGE COMPLETE — WAITING FOR QA');
    expect(report.projected_catalog_total).toBe(12278);
    expect(report.remaining_headroom).toBe(222);
    expect(report.crosses_12500).toBe(false);
  });
});
