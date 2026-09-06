/**
 * Georgia production merge — post-merge catalog integrity (+25 greenfield).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleGeorgiaCoordinate,
  GEORGIA_POSTAL_RE,
  isGeorgiaCountry,
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

const EXPECTED_TOTAL = 12303;
const EXPECTED_GEORGIA = 25;
const EXPECTED_TR = 198;
const EXPECTED_BY = 46;
const EXPECTED_UA = 105;
const EXPECTED_MT = 24;
const EXPECTED_BYTES_BEFORE = 3824712;
const PRE_MERGE_SHA =
  '03dc090d0e86a532c19602490cc3a5e3877033389923fd898abe1a3c288dbb9a';

const CLASS_A_COUNTS: Record<string, number> = {
  'Oktopus Fitness': 8,
  Champion: 3,
};

const OTHER_APPROVED_COUNTS: Record<string, number> = {
  'Fitness House': 2,
  'Snap Fitness': 1,
  'World Class Georgia': 1,
  Colosseum: 1,
  'Life Sport Club': 1,
  'Arena Sports Complex': 1,
  'BLUE FITNES': 1,
  'Fit Line': 1,
  'ასპრია': 1,
  'იმოძრავე': 1,
  'მამბერი ფიტნესი': 1,
  'რეფორმა': 1,
  'სპარტა': 1,
};

const PRIOR_COUNTS: Record<string, number> = {
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
    region: 'Georgia',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Georgia production merge (+25 greenfield)', () => {
  const dataDir = path.join(__dirname, '../data/georgia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const bytes = fs.statSync(centersPath).size;

  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PRODUCTION_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_APPROVED_FOR_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string; brand: string; city: string; name: string; address: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {idempotent: boolean; second_run: {insertions: number}};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_MERGE_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    hard_duplicate_conflicts: number;
    georgian_transliteration_duplicate_conflicts: number;
  };
  const brandInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_MERGE_BRAND_INVENTORY.json'), 'utf8'),
  ) as {production: Record<string, number>; total: number};
  const geoInv = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_MERGE_GEOGRAPHY_INVENTORY.json'), 'utf8'),
  ) as {production_cities: Record<string, number>};
  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'GEORGIA_MERGE_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'GEORGIA_MERGE_SHA_AFTER.txt'), 'utf8')
    .trim();
  const phase2Report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;

  const georgia = ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_'));

  test('post total = 12303 / Georgia = 25 / SHA changed from pre-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(georgia.length).toBe(EXPECTED_GEORGIA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ge_')).length).toBe(EXPECTED_GEORGIA);
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

  test('approved = 25 and matches production Georgia IDs exactly', () => {
    expect(approved.length).toBe(25);
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(georgia.map(r => r.id));
    expect(approvedIds.size).toBe(25);
    expect(prodIds.size).toBe(25);
    for (const id of approvedIds) {
      expect(prodIds.has(id)).toBe(true);
    }
  });

  test('Phase 2 provenance — 556 recovered, NR/NC = 0, estate gaps = 0', () => {
    expect(phase2Report.phase1_rows_recovered).toBe(556);
    expect(phase2Report.needs_review).toBe(0);
    expect(phase2Report.needs_coordinates).toBe(0);
    expect(phase2Report.final_approved_georgia).toBe(25);
    expect(phase2Report.class_a_estate_gaps).toBe(0);
    expect(phase2Report.snap_fitness_estate_gaps).toBe(0);
    expect(phase2Report.material_d_gaps_count).toBe(0);
    expect(phase2Report.verdict).toBe('READY FOR GEORGIA PRODUCTION MERGE');
  });

  test('Class A brand inventory exact — Oktopus 8, Champion 3, Snap 1 NOT Class A', () => {
    const byBrand = georgia.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    for (const [brand, n] of Object.entries(CLASS_A_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    for (const [brand, n] of Object.entries(OTHER_APPROVED_COUNTS)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(byBrand['Snap Fitness']).toBe(1);
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(25);
    expect(brandInv.total).toBe(25);
  });

  test('merge delta exact — 25 insertions, 0 updates, 0 removals', () => {
    const delta = report.delta as {
      insertions: number;
      updates: number;
      removals: number;
      total_before: number;
      total_after: number;
    };
    expect(delta.insertions).toBe(25);
    expect(delta.updates).toBe(0);
    expect(delta.removals).toBe(0);
    expect(delta.total_before).toBe(12278);
    expect(delta.total_after).toBe(12303);
  });

  test('all 25 rows production-grade — ge_ IDs, postcodes, coords, no leakage', () => {
    const exIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_EXCLUDED.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    const nrIds = new Set(
      (
        JSON.parse(
          fs.readFileSync(path.join(dataDir, 'GEORGIA_PHASE2_NEEDS_REVIEW.json'), 'utf8'),
        ) as Array<{id: string}>
      ).map(r => r.id),
    );
    for (const r of georgia) {
      expect(r.id).toMatch(/^ge_[a-f0-9]{10}$/);
      expect(r.country).toBe('Georgia');
      expect(GEORGIA_POSTAL_RE.test(r.postal_code)).toBe(true);
      expect(isPlausibleGeorgiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(r.is_active).not.toBe(false);
      expect(exIds.has(r.id)).toBe(false);
      expect(nrIds.has(r.id)).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.name).startsWith('ge_')).toBe(false);
    }
  });

  test('city inventory — Tbilisi 23, Batumi 2', () => {
    expect(geoInv.production_cities.Tbilisi).toBe(23);
    expect(geoInv.production_cities.Batumi).toBe(2);
    expect(Object.values(geoInv.production_cities).reduce((a, b) => a + b, 0)).toBe(25);
  });

  test('prior-country counts unchanged', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
  });

  test('country resolution / search / check-in / idempotency / scale', () => {
    expect(isGeorgiaCountry('Georgia')).toBe(true);
    expect(gymCountryTranslationKey('Georgia')).toBe('countries.georgia');
    expect(en.countries.georgia).toBeTruthy();
    expect(GYM_ID_PREFIX.georgia).toBe('ge_');

    const tbilisi = searchGyms('Tbilisi');
    expect(tbilisi.some(h => h.gym.country === 'Georgia')).toBe(true);
    expect(searchGyms('Oktopus Fitness').some(h => h.gym.country === 'Georgia')).toBe(true);
    expect(searchGyms('საქართველო').some(h => h.gym.country === 'Georgia')).toBe(true);

    const probe = georgia[0];
    const gym = toGym(probe);
    const resolved = resolveGymOrStub(probe.id);
    expect(resolved?.country).toBe('Georgia');
    expect(normalizeGymSearchValue(resolved?.name ?? '')).not.toBe(probe.id);

    const near = findNearestGym(41.715, 44.827, [gym]);
    expect(near?.country).toBe('Georgia');

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(idem.idempotent).toBe(true);
    expect(idem.second_run.insertions).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.georgian_transliteration_duplicate_conflicts).toBe(0);
    expect(report.verdict).toBe('GEORGIA MERGE COMPLETE — WAITING FOR QA');
    expect(report.projected_catalog_total).toBe(12303);
    expect(report.remaining_headroom).toBe(197);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
  });
});
