/**
 * Ukraine production merge — post-merge catalog integrity (+105 greenfield).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleUkraineCoordinate,
  UKRAINE_POSTAL_RE,
  isUkraineCountry,
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
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_TOTAL = 12034;
const EXPECTED_UKRAINE = 105;
const EXPECTED_BYTES_BEFORE = 3708345;
const PRE_MERGE_SHA =
  '286729e8a8228863be19cf9f88108f4ebf91d2f9974c04145900622e444fed83';

const EXPECTED_BRANDS: Record<string, number> = {
  'Sport Life': 42,
  'Apollo Next': 24,
  Smartass: 10,
  'Total Fitness': 18,
  Grafit: 4,
  'Atlas Fitness': 1,
  'Grand Prix': 1,
  Olymp: 1,
  'Fitness Formula': 1,
  ProFitness: 1,
  FitCurves: 1,
  SportZal: 1,
};

const APOLLO_CITY: Record<string, string> = {
  '024': 'Lviv',
  '027': 'Boryspil',
  '033': 'Vinnytsia',
  '034': 'Lviv',
  '035': 'Bila Tserkva',
  '036': 'Odesa',
  '037': 'Odesa',
  '039': 'Ivano-Frankivsk',
  '041': 'Zhytomyr',
};

const PRIOR_COUNTS: Record<string, number> = {
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

function apolloNum(name: string): string | null {
  const m = name.match(/APOLLO NEXT (\d{3})/i);
  return m ? m[1] : null;
}

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Ukraine',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Ukraine production merge (+105 greenfield)', () => {
  const dataDir = path.join(__dirname, '../data/ukraine');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'UKRAINE_MERGE_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'UKRAINE_MERGE_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'UKRAINE_MERGE_SHA_AFTER.txt'), 'utf8')
    .trim();

  const ukraine = ALL_GYM_CENTERS.filter(
    c => c.country === 'Ukraine' || c.id.startsWith('ua_'),
  );

  test('post total = 12034 / Ukraine = 105 / SHA changed from pre-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(ukraine.length).toBe(EXPECTED_UKRAINE);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(EXPECTED_UKRAINE);
    expect(shaBefore).toBe(PRE_MERGE_SHA);
    expect(sha).toBe(shaAfter);
    expect(sha).not.toBe(PRE_MERGE_SHA);
    expect(report.production_bytes_before).toBe(EXPECTED_BYTES_BEFORE);
    expect(bytes).toBeGreaterThan(EXPECTED_BYTES_BEFORE);
  });

  test('approved = 105 and matches production Ukraine IDs exactly', () => {
    expect(approved.length).toBe(105);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(ukraine.map(r => r.id));
    expect(approvedIds.size).toBe(105);
    expect(prodIds.size).toBe(105);
    for (const id of approvedIds) {
      expect(prodIds.has(id)).toBe(true);
    }
  });

  test('Class A + independent brand inventory exact', () => {
    const byBrand = ukraine.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(byBrand['Energy Fitness'] ?? 0).toBe(0);
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(105);
  });

  test('Apollo city metadata corrections preserved', () => {
    const apollo = ukraine.filter(c => c.brand === 'Apollo Next');
    expect(apollo.length).toBe(24);
    for (const row of apollo) {
      const num = apolloNum(row.name);
      if (num && APOLLO_CITY[num]) {
        expect(row.city).toBe(APOLLO_CITY[num]);
      }
    }
  });

  test('all 105 rows production-grade — ua_ IDs, postcodes, coords, no leakage', () => {
    const csIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE2_COMING_SOON.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'UKRAINE_PHASE2_EXCLUDED.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    for (const r of ukraine) {
      expect(r.id).toMatch(/^ua_[a-f0-9]{10}$/);
      expect(r.country).toBe('Ukraine');
      expect(UKRAINE_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleUkraineCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(r.is_active).not.toBe(false);
      expect(csIds.has(r.id)).toBe(false);
      expect(exIds.has(r.id)).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('ua_')).toBe(false);
    }
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('country resolution / search / check-in / idempotency', () => {
    expect(isUkraineCountry('Ukraine')).toBe(true);
    expect(isUkraineCountry('Україна')).toBe(true);
    expect(gymCountryTranslationKey('Ukraine')).toBe('countries.ukraine');
    expect(en.countries.ukraine).toBeTruthy();
    expect(GYM_ID_PREFIX.ukraine).toBe('ua_');

    const kyiv = searchGyms('Kyiv');
    expect(kyiv.some(h => h.gym.country === 'Ukraine')).toBe(true);
    expect(searchGyms('Sport Life').some(h => h.gym.country === 'Ukraine')).toBe(true);

    const probe = ukraine[0];
    const gym = toGym(probe);
    const resolved = resolveGymOrStub(probe.id);
    expect(resolved?.country).toBe('Ukraine');
    expect(normalizeGymSearchValue(resolved?.name ?? '')).not.toBe(probe.id);

    const near = findNearestGym(50.4501, 30.5234, [gym]);
    expect(near?.country).toBe('Ukraine');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(idem.idempotent).toBe(true);
    expect(idem.second_run.insertions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(report.verdict).toBe('UKRAINE MERGE COMPLETE — WAITING FOR QA');
    expect(report.projected_catalog_after_merge).toBe(12034);
    expect(report.remaining_headroom).toBe(466);
    expect(report.crosses_12500).toBe(false);
  });
});
