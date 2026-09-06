/**
 * Russia production merge — post-merge catalog integrity (+465 greenfield).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleRussiaCoordinate,
  RUSSIA_POSTAL_RE,
  isRussiaCountry,
  isDisputedUkraineTerritory,
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

const EXPECTED_TOTAL = 12850;
const EXPECTED_RUSSIA = 465;
const EXPECTED_AZ = 46;
const EXPECTED_AM = 36;
const EXPECTED_GE = 25;
const EXPECTED_TR = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const EXPECTED_BYTES_BEFORE = 3858778;
const PRE_MERGE_SHA =
  '1f711c075668cd1dacd8e14a8a2189d8cff48c133b3b9546f00bb2767ac82ca1';

const CLASS_A_COUNTS: Record<string, number> = {
  'World Class': 35,
  'X-Fit': 31,
  'Alex Fitness': 11,
  DDxFitness: 25,
  'Spirit Fitness': 2,
};

const EXPECTED_CITY_COUNTS: Record<string, number> = {
  Moscow: 361,
  'Saint Petersburg': 23,
};

const PRIOR_COUNTS: Record<string, number> = {
  Azerbaijan: 46,
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

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Russia',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Russia production merge (+465 greenfield)', () => {
  const dataDir = path.join(__dirname, '../data/russia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string; address: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_MERGE_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    russian_transliteration_duplicate_conflicts: number;
  };
  const brandInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_MERGE_OPERATOR_INVENTORY.json'), 'utf8'),
  ) as {production: Record<string, number>; total: number; non_class_a: number};
  const geoInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_MERGE_GEOGRAPHY_INVENTORY.json'), 'utf8'),
  ) as {production_cities: Record<string, number>};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'RUSSIA_MERGE_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'RUSSIA_MERGE_SHA_AFTER.txt'), 'utf8')
    .trim();
  const phase2Report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;

  const russia = ALL_GYM_CENTERS.filter(c => c.id.startsWith('ru_'));

  test('post total = 12850 / Russia = 465 / SHA changed from pre-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(russia.length).toBe(EXPECTED_RUSSIA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('az_')).length).toBe(EXPECTED_AZ);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('am_')).length).toBe(EXPECTED_AM);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(EXPECTED_GE);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('tr_')).length).toBe(EXPECTED_TR);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('by_')).length).toBe(EXPECTED_BY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ua_')).length).toBe(EXPECTED_UA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(EXPECTED_MT);
    expect(shaBefore).toBe(PRE_MERGE_SHA);
    expect(sha).toBe(shaAfter);
    expect(sha).not.toBe(PRE_MERGE_SHA);
    expect(report.production_bytes_before).toBe(EXPECTED_BYTES_BEFORE);
    expect(bytes).toBeGreaterThan(EXPECTED_BYTES_BEFORE);
  });

  test('approved = 465 and matches production Russia IDs exactly', () => {
    expect(approved.length).toBe(465);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(russia.map(r => r.id));
    expect(approvedIds.size).toBe(465);
    expect(prodIds.size).toBe(465);
    for (const id of approvedIds) {
      expect(prodIds.has(id)).toBe(true);
    }
  });

  test('Phase 2 provenance — 1656 recovered, NR/NC = 0, estate gaps = 0', () => {
    expect(phase2Report.phase1_rows_recovered).toBe(1656);
    expect(phase2Report.phase1_nr_resolved).toBe(1386);
    expect(phase2Report.needs_review).toBe(0);
    expect(phase2Report.needs_coordinates).toBe(0);
    expect(phase2Report.final_approved_russia).toBe(465);
    expect(phase2Report.class_a_estate_gaps).toBe(0);
    expect(phase2Report.missed_class_a_estate_gaps).toBe(0);
    expect(phase2Report.material_d_gaps_count).toBe(0);
    expect(phase2Report.verdict).toBe('READY FOR RUSSIA PRODUCTION MERGE');
  });

  test('Class A brand inventory exact — 5 chains, 104 total', () => {
    const byBrand = russia.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    const classATotal = Object.values(CLASS_A_COUNTS).reduce((a, b) => a + b, 0);
    expect(classATotal).toBe(104);
    expect(brandInv.total).toBe(465);
    expect(brandInv.non_class_a).toBe(361);
  });

  test('merge delta exact — 465 insertions, 0 updates, 0 removals', () => {
    const delta = report.delta as {
      insertions: number;
      updates: number;
      removals: number;
      total_before: number;
      total_after: number;
    };
    expect(delta.insertions).toBe(465);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
    expect(delta.total_before).toBe(12385);
    expect(delta.total_after).toBe(12850);
  });

  test('all 465 rows production-grade — ru_ IDs, postcodes, coords, no leakage', () => {
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_EXCLUDED.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    const nrIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'RUSSIA_PHASE2_NEEDS_REVIEW.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    for (const r of russia) {
      expect(r.id).toMatch(/^ru_[a-f0-9]{10}$/);
      expect(r.country).toBe('Russia');
      expect(RUSSIA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleRussiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(isDisputedUkraineTerritory(r.lat!, r.lng!)).toBe(false);
      expect(r.is_active).not.toBe(false);
      expect(exIds.has(r.id)).toBe(false);
      expect(nrIds.has(r.id)).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('ru_')).toBe(false);
    }
  });

  test('city inventory — Moscow 361, Saint Petersburg 23', () => {
    for (const [city, n] of Object.entries(EXPECTED_CITY_COUNTS)) {
      expect(geoInv.production_cities[city]).toBe(n);
    }
    expect(Object.values(geoInv.production_cities).reduce((a, b) => a + b, 0)).toBe(465);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('country resolution / search / check-in / idempotency / scale', () => {
    expect(isRussiaCountry('Russia')).toBe(true);
    expect(gymCountryTranslationKey('Russia')).toBe('countries.russia');
    expect(en.countries.russia).toBeTruthy();
    expect(GYM_ID_PREFIX.russia).toBe('ru_');

    expect(searchGyms('Russia').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Россия').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Moscow').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Москва').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('Saint Petersburg').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('World Class').some(h => h.gym.country === 'Russia')).toBe(true);
    expect(searchGyms('X-Fit').some(h => h.gym.country === 'Russia')).toBe(true);

    const moscow = russia.find(r => r.city === 'Moscow');
    expect(moscow).toBeTruthy();
    const gym = toGym(moscow!);
    const resolved = resolveGymOrStub(moscow!.id);
    expect(resolved?.country).toBe('Russia');
    expect(normalizeGymSearchValue(resolved?.name ?? '')).not.toBe(moscow!.id);

    const near = findNearestGym(55.7558, 37.6173, [gym]);
    expect(near?.country).toBe('Russia');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(idem.idempotent).toBe(true);
    expect(idem.second_run.insertions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.russian_transliteration_duplicate_conflicts).toBe(0);
    expect(report.verdict).toBe('RUSSIA MERGE COMPLETE — GLOBAL STRESS QA REQUIRED');
    expect(report.projected_catalog_total).toBe(12850);
    expect(report.remaining_headroom).toBe(-350);
    expect(report.crosses_12500).toBe(true);
    expect(report.global_stress_qa_required).toBe(true);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.country_expansion_locked).toBe(true);
  });
});
