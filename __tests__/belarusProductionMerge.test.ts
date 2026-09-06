/**
 * Belarus production merge — post-merge catalog integrity (+46 greenfield).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBelarusCoordinate,
  BELARUS_POSTAL_RE,
  isBelarusCountry,
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

const EXPECTED_TOTAL = 12080;
const EXPECTED_BELARUS = 46;
const EXPECTED_UKRAINE = 105;
const EXPECTED_MALTA = 24;
const EXPECTED_BYTES_BEFORE = 3746747;
const PRE_MERGE_SHA =
  'bec3945dd35bb8bf9cc57046110736a5fa267a673445cf4a26dba6ed92d64e05';

const EXPECTED_BRANDS: Record<string, number> = {
  Adrenalin: 29,
  Lifestyle: 3,
  'Fox Club': 5,
  Olympic: 4,
  'World Class': 1,
  'Gym Express 24h': 1,
  Grafit: 1,
  Delta: 1,
  FitWorld: 1,
};

const PRIOR_COUNTS: Record<string, number> = {
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
    region: 'Belarus',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Belarus production merge (+46 greenfield)', () => {
  const dataDir = path.join(__dirname, '../data/belarus');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string; address: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'BELARUS_MERGE_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'BELARUS_MERGE_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'BELARUS_MERGE_SHA_AFTER.txt'), 'utf8')
    .trim();

  const belarus = ALL_GYM_CENTERS.filter(
    c => c.country === 'Belarus' || c.id.startsWith('by_'),
  );

  test('post total = 12080 / Belarus = 46 / SHA changed from pre-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(belarus.length).toBe(EXPECTED_BELARUS);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(EXPECTED_BELARUS);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Ukraine').length).toBe(EXPECTED_UKRAINE);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(EXPECTED_MALTA);
    expect(shaBefore).toBe(PRE_MERGE_SHA);
    expect(sha).toBe(shaAfter);
    expect(sha).not.toBe(PRE_MERGE_SHA);
    expect(report.production_bytes_before).toBe(EXPECTED_BYTES_BEFORE);
    expect(bytes).toBeGreaterThan(EXPECTED_BYTES_BEFORE);
  });

  test('approved = 46 and matches production Belarus IDs exactly', () => {
    expect(approved.length).toBe(46);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(belarus.map(r => r.id));
    expect(approvedIds.size).toBe(46);
    expect(prodIds.size).toBe(46);
    for (const id of approvedIds) {
      expect(prodIds.has(id)).toBe(true);
    }
  });

  test('Class A + independent brand inventory exact', () => {
    const byBrand = belarus.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(46);
  });

  test('special metadata — Borovlyany, Fox Club Kupaly, Loshitsa excluded', () => {
    const borovlyany = belarus.find(c => c.id === 'by_3633cd3ae9');
    expect(borovlyany?.city).toBe('Borovlyany');
    expect(borovlyany?.city).not.toBe('Minsk');

    const kupaly = belarus.filter(c => c.address === 'пр-т Я. Купалы 22');
    expect(kupaly).toHaveLength(1);

    expect(belarus.some(c => c.id === 'by_aed96cf298')).toBe(false);
    expect(belarus.filter(c => c.city === 'Vitebsk')).toHaveLength(0);
  });

  test('all 46 rows production-grade — by_ IDs, postcodes, coords, no leakage', () => {
    const csIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_COMING_SOON.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'BELARUS_PHASE2_EXCLUDED.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    for (const r of belarus) {
      expect(r.id).toMatch(/^by_[a-f0-9]{10}$/);
      expect(r.country).toBe('Belarus');
      expect(BELARUS_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleBelarusCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(r.is_active).not.toBe(false);
      expect(csIds.has(r.id)).toBe(false);
      expect(exIds.has(r.id)).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('by_')).toBe(false);
    }
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('country resolution / search / check-in / idempotency', () => {
    expect(isBelarusCountry('Belarus')).toBe(true);
    expect(isBelarusCountry('Беларусь')).toBe(true);
    expect(gymCountryTranslationKey('Belarus')).toBe('countries.belarus');
    expect(en.countries.belarus).toBeTruthy();
    expect(GYM_ID_PREFIX.belarus).toBe('by_');

    const minsk = searchGyms('Minsk');
    expect(minsk.some(h => h.gym.country === 'Belarus')).toBe(true);
    expect(searchGyms('Adrenalin').some(h => h.gym.country === 'Belarus')).toBe(true);

    const probe = belarus[0];
    const gym = toGym(probe);
    const resolved = resolveGymOrStub(probe.id);
    expect(resolved?.country).toBe('Belarus');
    expect(normalizeGymSearchValue(resolved?.name ?? '')).not.toBe(probe.id);

    const near = findNearestGym(53.9006, 27.559, [gym]);
    expect(near?.country).toBe('Belarus');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(idem.idempotent).toBe(true);
    expect(idem.second_run.insertions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(report.verdict).toBe('BELARUS MERGE COMPLETE — WAITING FOR QA');
    expect(report.projected_catalog_after_merge).toBe(12080);
    expect(report.remaining_headroom).toBe(420);
    expect(report.crosses_12500).toBe(false);
  });
});
