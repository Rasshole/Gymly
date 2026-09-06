/**
 * Iceland production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleIcelandCoordinate,
  ICELAND_POSTAL_RE,
  isIcelandCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

const EXPECTED_TOTAL = 11921; // live after Bosnia merge
const EXPECTED_IS = 27;
const EXPECTED_WC = 20;
const EXPECTED_KATLA = 7;
const PRE_MERGE_SHA =
  'caf838b1ce733fd20fb724306429bcc48ddee49d684a8efbe70c0cd9b1e46944';
const POST_MERGE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d'; // frozen Iceland merge report
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const FORBIDDEN_LIVE_IDS = new Set([
  'is_f1532c5942',
  'is_4679839ae8',
  'is_e3bcd63150',
  'is_7752534bf6',
  'is_2c4d4ba569',
  'is_aa2da9071f',
  'is_bf7a13f651',
]);

const REQUIRED = {
  vatnsmyri: 'is_b39588e5e0',
  kringlan: 'is_7511719617',
  gamlaKringlan: 'is_48dceefaa5',
  wcTjarnarvellir: 'is_271c199e79',
  katlaTjarnarvellir: 'is_3c1b16259b',
  katlaHoltagardar: 'is_bece47bcec',
  katlaLambhagi: 'is_df6449ee85',
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe('Iceland merge safety', () => {
  const iceland = ALL_GYM_CENTERS.filter(c => c.country === 'Iceland');
  const reportPath = path.join(__dirname, '../data/iceland/ICELAND_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/iceland/ICELAND_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/iceland/iceland_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/iceland/ICELAND_PHASE1_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(__dirname, '../data/iceland/ICELAND_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/iceland/ICELAND_MERGE_DUPLICATE_ANALYSIS.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; iceland: number};
    before: {total: number; iceland: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    brand_breakdown?: Record<string, number>;
    staging_reconciliation?: Record<string, unknown>;
    rebrand_validation?: Record<string, unknown>;
    excluded_leakage?: {result?: string; forbidden_ids_in_production?: string[]};
    territorial_safety?: {result?: string};
    check_in?: {CHECK_IN_RADIUS_METERS: number; changed: boolean};
    global_scale?: {crossed_12500: boolean; new_production: number};
    verdict?: string;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    brand: string;
    name: string;
  }>;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    final_catalog: number;
    iceland: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    duplicate_ids?: string[];
    unexplained_hard_duplicates?: number;
    post_merge_proximity?: {identical?: unknown[]; lt25?: unknown[]};
  };

  test('total catalog = 11831; Iceland = 27; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(iceland.length).toBe(EXPECTED_IS);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('is_')).length).toBe(EXPECTED_IS);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11665);
    expect(report.before.iceland).toBe(0);
    expect(report.inserted).toBe(27);
    expect(report.after.total).toBe(11692); // frozen Iceland merge after
    expect(report.after.iceland).toBe(EXPECTED_IS);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('brand breakdown World Class 20 + Katla Fitness 7', () => {
    expect(iceland.filter(c => c.brand === 'World Class').length).toBe(EXPECTED_WC);
    expect(iceland.filter(c => c.brand === 'Katla Fitness').length).toBe(EXPECTED_KATLA);
    expect(report.brand_breakdown?.['World Class']).toBe(EXPECTED_WC);
    expect(report.brand_breakdown?.['Katla Fitness']).toBe(EXPECTED_KATLA);
    const brands = new Set(iceland.map(c => c.brand));
    expect(brands.size).toBe(2);
  });

  test('ID-set equality: Phase1 READY == approved == production IS == staging MERGED', () => {
    const prodIds = new Set(iceland.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(27);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('27 == 27 == 27 == 27');
  });

  test('READY hard DQ gates on production Iceland rows', () => {
    for (const c of iceland) {
      expect(c.id.startsWith(GYM_ID_PREFIX.iceland)).toBe(true);
      expect(c.name.trim()).toBeTruthy();
      expect(c.address.trim()).toBeTruthy();
      expect(c.city.trim()).toBeTruthy();
      expect(ICELAND_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleIcelandCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(c.is_coming_soon).toBeFalsy();
      expect(c.country).toBe('Iceland');
    }
  });

  test('rebrand / legacy validation — successor only, no predecessor duplicates', () => {
    expect(iceland.some(c => c.id === REQUIRED.vatnsmyri)).toBe(true);
    expect(iceland.some(c => c.id === 'is_f1532c5942')).toBe(false);
    expect(iceland.some(c => c.id === 'is_4679839ae8')).toBe(false);
    expect(iceland.some(c => c.id === REQUIRED.katlaLambhagi)).toBe(true);
    expect(iceland.some(c => c.id === REQUIRED.kringlan)).toBe(true);
    expect(iceland.some(c => c.id === REQUIRED.gamlaKringlan)).toBe(true);
    expect(iceland.some(c => c.id === REQUIRED.wcTjarnarvellir)).toBe(true);
    expect(iceland.some(c => c.id === REQUIRED.katlaTjarnarvellir)).toBe(true);
    const holtag = iceland.find(c => c.id === REQUIRED.katlaHoltagardar);
    expect(holtag).toBeTruthy();
    expect(/holtagar/i.test(holtag!.address)).toBe(true);
  });

  test('excluded/closed operators absent from production', () => {
    const prodIds = new Set(iceland.map(c => c.id));
    for (const id of FORBIDDEN_LIVE_IDS) {
      expect(prodIds.has(id)).toBe(false);
    }
    const closedExcluded = staging.filter(r =>
      ['CLOSED', 'EXCLUDED'].includes(r.import_category),
    );
    expect(closedExcluded.every(r => !prodIds.has(r.id))).toBe(true);
    expect(report.excluded_leakage?.result).toBe('PASS');
  });

  test('territorial CLEAN; duplicates clean', () => {
    expect(report.territorial_safety?.result).toBe('CLEAN');
    expect(dup.duplicate_ids || []).toEqual([]);
    expect(dup.unexplained_hard_duplicates || 0).toBe(0);
    expect((dup.post_merge_proximity?.identical || []).length).toBe(0);
  });

  test('staging MERGED 27 / CLOSED 2 / EXCLUDED 29 / total 58', () => {
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(27);
    expect(cats.CLOSED).toBe(2);
    expect(cats.EXCLUDED).toBe(29);
    expect(cats.NEEDS_COORDINATES || 0).toBe(0);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
    expect(cats.COMING_SOON || 0).toBe(0);
    expect(staging.length).toBe(58);
  });

  test('idempotency PASS; check-in unchanged; under 12500', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(11692); // frozen Iceland idempotency artifact
    expect(idem.iceland).toBe(EXPECTED_IS);
    expect(idem.result).toBe('PASS');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.changed).toBe(false);
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.new_production).toBe(11692);
  });

  test('37-country regression including IS 27 / LI 7 totaling 11831', () => {
    const counts: Record<string, number> = {};
    ALL_GYM_CENTERS.forEach(c => {
      counts[c.country] = (counts[c.country] || 0) + 1;
    });
    expect(counts['Denmark']).toBe(354);
    expect(counts['Sweden']).toBe(639);
    expect(counts['Norway']).toBe(535);
    expect(counts['Finland']).toBe(429);
    expect(counts['Germany']).toBe(1424);
    expect(counts['United Kingdom']).toBe(1474);
    expect(counts['Netherlands']).toBe(600);
    expect(counts['France']).toBe(1712);
    expect(counts['Spain']).toBe(976);
    expect(counts['Italy']).toBe(588);
    expect(counts['Belgium']).toBe(363);
    expect(counts['Poland']).toBe(621);
    expect(counts['Austria']).toBe(335);
    expect(counts['Switzerland']).toBe(475);
    expect(counts['Portugal']).toBe(247);
    expect(counts['Greece']).toBe(106);
    expect(counts['Ireland']).toBe(65);
    expect(counts['Czechia']).toBe(70);
    expect(counts['Hungary']).toBe(50);
    expect(counts['Romania']).toBe(154);
    expect(counts['Slovakia']).toBe(37);
    expect(counts['Bulgaria']).toBe(82);
    expect(counts['Croatia']).toBe(80);
    expect(counts['Slovenia']).toBe(32);
    expect(counts['Lithuania']).toBe(61);
    expect(counts['Latvia']).toBe(33);
    expect(counts['Estonia']).toBe(68);
    expect(counts['Luxembourg']).toBe(20);
    expect(counts['Malta']).toBe(18);
    expect(counts['Cyprus']).toBe(17);
    expect(counts['Iceland']).toBe(27);
    expect(counts['Liechtenstein']).toBe(7);
    expect(counts['Andorra']).toBe(12);
    expect(counts['Monaco']).toBe(4);
    expect(counts['San Marino']).toBe(6);
    expect(counts['Moldova']).toBe(28);
    expect(counts['North Macedonia']).toBe(25);
    expect(counts['Montenegro']).toBe(26);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(EXPECTED_TOTAL);
  });

  test('country helpers and check-in radius smoke', () => {
    expect(isIcelandCountry('Iceland')).toBe(true);
    expect(gymCountryTranslationKey('Iceland')).toBe('countries.iceland');
    expect(en.countries.iceland).toBe('Iceland');
    expect(resolveGymOrStub('is_nonexistent_test').region).toBe('Iceland');
    const sample = iceland[0]!;
    const lat201 = sample.lat! + 201 / 111320;
    expect(
      haversineMeters(lat201, sample.lng!, sample.lat!, sample.lng!),
    ).toBeGreaterThan(CHECK_IN_RADIUS_METERS);
  });
});
