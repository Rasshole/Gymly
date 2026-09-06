/**
 * Liechtenstein production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLiechtensteinCoordinate,
  LIECHTENSTEIN_POSTAL_RE,
  isLiechtensteinCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

const EXPECTED_TOTAL = 11921; // live after Moldova merge
const EXPECTED_LI = 7;
const PRE_MERGE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';
const POST_MERGE_SHA =
  'b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d'; // frozen Liechtenstein merge report
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const REQUIRED = {
  updateVaduz: 'li_9fdb1d933f',
  liefitVaduz: 'li_9514fe2df2',
  purfitness: 'li_35eed72b39',
  lorezPower: 'li_688dc73ac2',
  flexigym: 'li_f02192ce76',
  inMotion: 'li_740e149c77',
  kokon: 'li_9b66d0aa5e',
};

const FORBIDDEN_LIVE_IDS = new Set([
  'li_7f2d2a5ed7', // GEOWAY
  'li_3ff9b2a62c', // Lorez Gesundheitscenter
  'li_53796ae7be', // Salutaris
  'li_1d8662661d', // fitnesshaus by blugym
]);

describe('Liechtenstein merge safety', () => {
  const liechtenstein = ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein');
  const reportPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_MERGE_REPORT.json',
  );
  const approvedPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/liechtenstein/liechtenstein_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/liechtenstein/LIECHTENSTEIN_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; liechtenstein: number};
    before: {total: number; liechtenstein: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    eligibility_breakdown?: Record<string, number>;
    staging_reconciliation?: Record<string, unknown>;
    excluded_leakage?: {result?: string; forbidden_ids_in_production?: string[]};
    territorial_safety?: {result?: string; foreign_outliers?: string[]};
    check_in?: {CHECK_IN_RADIUS_METERS: number; changed: boolean};
    global_scale?: {crossed_12500: boolean; new_production: number};
    unexplained_hard_duplicates?: number;
    verdict?: string;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
    eligibility_path?: string;
    brand: string;
    name: string;
  }>;
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
    liechtenstein: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    duplicate_ids?: string[];
    unexplained_hard_duplicates?: number;
  };

  test('total catalog = 11831; Liechtenstein = 7; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(liechtenstein.length).toBe(EXPECTED_LI);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('li_')).length).toBe(EXPECTED_LI);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11692);
    expect(report.before.liechtenstein).toBe(0);
    expect(report.inserted).toBe(7);
    expect(report.after.total).toBe(11699); // frozen LI merge after
    expect(report.after.liechtenstein).toBe(EXPECTED_LI);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('eligibility: CHAIN_CLASS_A 0 + SMALL_MARKET_INDEPENDENT 7', () => {
    expect(report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(0);
    expect(report.eligibility_breakdown?.SMALL_MARKET_INDEPENDENT).toBe(7);
    expect(report.eligibility_breakdown?.TOTAL).toBe(7);
    expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('ID-set equality: Phase2 READY == approved == production LI == staging MERGED', () => {
    const prodIds = new Set(liechtenstein.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(7);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('7 == 7 == 7 == 7');
  });

  test('all 7 required identities live; GEOWAY/Gesundheitscenter/legacy absent', () => {
    const byId = Object.fromEntries(liechtenstein.map(c => [c.id, c]));
    for (const id of Object.values(REQUIRED)) {
      expect(byId[id]).toBeTruthy();
      expect(isPlausibleLiechtensteinCoordinate(byId[id].lat!, byId[id].lng!)).toBe(true);
      expect(LIECHTENSTEIN_POSTAL_RE.test(String(byId[id].postal_code))).toBe(true);
      expect(MOJIBAKE_RE.test(`${byId[id].name} ${byId[id].address}`)).toBe(false);
    }
    expect(liechtenstein.filter(c => c.brand === 'update Fitness').length).toBe(1);
    expect(liechtenstein.filter(c => c.brand === 'LieFit').length).toBe(1);
    expect(liechtenstein.filter(c => /GEOWAY/i.test(`${c.brand} ${c.name}`)).length).toBe(0);
    expect(liechtenstein.filter(c => c.brand === 'purfitness').length).toBe(1);
    expect(
      liechtenstein.filter(c => /blugym|fitnesshaus/i.test(`${c.brand} ${c.name}`)).length,
    ).toBe(0);
    expect(liechtenstein.filter(c => c.id === REQUIRED.lorezPower).length).toBe(1);
    expect(
      liechtenstein.filter(c => /Gesundheitscenter|Salutaris/i.test(`${c.brand} ${c.name}`))
        .length,
    ).toBe(0);
    expect(liechtenstein.filter(c => c.brand === 'flexigym').length).toBe(1);
    expect(liechtenstein.filter(c => c.brand === 'In Motion').length).toBe(1);
    expect(liechtenstein.filter(c => /KOKON/i.test(c.brand)).length).toBe(1);
  });

  test('CLOSED/EXCLUDED leakage = 0; staging MERGED 7 / EXCLUDED 43 / CLOSED 2', () => {
    for (const id of FORBIDDEN_LIVE_IDS) {
      expect(ALL_GYM_CENTERS.some(c => c.id === id)).toBe(false);
    }
    expect(report.excluded_leakage?.result).toBe('CLEAN');
    expect(report.excluded_leakage?.forbidden_ids_in_production).toEqual([]);
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(7);
    expect(cats.EXCLUDED).toBe(43);
    expect(cats.CLOSED).toBe(2);
    expect(staging.length).toBe(52);
  });

  test('cross-border safety CLEAN; hard duplicates 0', () => {
    expect(report.territorial_safety?.result).toBe('CLEAN');
    expect(report.territorial_safety?.foreign_outliers).toEqual([]);
    for (const c of liechtenstein) {
      expect(isPlausibleLiechtensteinCoordinate(c.lat!, c.lng!)).toBe(true);
    }
    expect(dup.duplicate_ids || []).toEqual([]);
    expect(dup.unexplained_hard_duplicates).toBe(0);
    expect(report.unexplained_hard_duplicates).toBe(0);
  });

  test('37-country regression including LI 7 / AD 12 totaling 11831', () => {
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

  test('check-in / auto-checkout unchanged; country resolution; orphan stub', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.changed).toBe(false);
    expect(GYM_ID_PREFIX.liechtenstein).toBe('li_');
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(gymCountryTranslationKey('Liechtenstein')).toBe('countries.liechtenstein');
    expect(resolveGymOrStub('li_nonexistent_test').region).toBe('Liechtenstein');
    expect(resolveGymOrStub(REQUIRED.updateVaduz).region).toBe('Liechtenstein');
  });

  test('idempotency PASS; global scale under 12500', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(11699); // frozen LI idempotency artifact
    expect(idem.liechtenstein).toBe(7);
    expect(idem.result).toBe('PASS');
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.new_production).toBe(11699); // frozen LI merge report
  });
});
