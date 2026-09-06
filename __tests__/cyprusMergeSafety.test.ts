/**
 * Cyprus production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleCyprusCoordinate,
  CYPRUS_POSTAL_RE,
  isCyprusCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import type {DanishGym} from '../src/data/danishGyms';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FOREIGN_NORTH =
  /\b(kyrenia|girne|morphou|g[uü]zelyurt|northern cyprus|trnc|gazima[gğ]usa)\b/i;

const EXPECTED_TOTAL = 11921; // live after Moldova merge
const EXPECTED_CY = 17;
const CY_MERGE_AFTER_TOTAL = 11665; // frozen in Cyprus merge report
const PRE_MERGE_SHA =
  'e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4';
const POST_MERGE_SHA =
  'caf838b1ce733fd20fb724306429bcc48ddee49d684a8efbe70c0cd9b1e46944';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Cyprus',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

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

describe('Cyprus merge safety', () => {
  const cyprus = ALL_GYM_CENTERS.filter(c => c.country === 'Cyprus');
  const reportPath = path.join(__dirname, '../data/cyprus/CYPRUS_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/cyprus/CYPRUS_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/cyprus/cyprus_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/cyprus/CYPRUS_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(__dirname, '../data/cyprus/CYPRUS_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/cyprus/CYPRUS_MERGE_DUPLICATE_ANALYSIS.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    withheld?: number;
    after: {total: number; cyprus: number};
    before: {total: number; cyprus: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    staging_reconciliation?: Record<string, unknown>;
    eligibility_breakdown?: Record<string, number>;
    sanctum?: {total?: number};
    fitness_factory?: {count?: number};
    fitness_one?: {count?: number};
    curves?: {count?: number};
    alterlife?: {count?: number};
    territorial_safety?: {result?: string; northern_cyprus?: number; republic_controlled?: number};
    check_in?: {
      CHECK_IN_RADIUS_METERS: number;
      AUTO_CHECKOUT_DISTANCE_METERS: number;
      changed: boolean;
    };
    global_scale?: {
      previous_production: number;
      new_production: number;
      crossed_12500: boolean;
      global_stress_qa_required_now: boolean;
    };
    performance?: {catalog?: number; json_size_mb?: number};
    verdict?: string;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
    name: string;
    brand: string;
    address: string;
    city: string;
    postal_code: string;
    lat: number;
    lng: number;
    eligibility_path?: string;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    brand: string;
    name: string;
  }>;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{
    id: string;
    eligibility_path?: string;
  }>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    final_catalog: number;
    cyprus: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    unexplained_hard_duplicates?: number;
    duplicate_ids?: string[];
    post_merge_proximity?: {
      lt25?: unknown[];
      lt50?: unknown[];
      identical?: unknown[];
    };
  };

  test('total catalog = 11831; Cyprus = 17; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(cyprus.length).toBe(EXPECTED_CY);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('cy_')).length).toBe(EXPECTED_CY);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11648);
    expect(report.before.cyprus).toBe(0);
    expect(report.inserted).toBe(17);
    expect(report.withheld || 0).toBe(0);
    expect(report.after.total).toBe(CY_MERGE_AFTER_TOTAL);
    expect(report.after.cyprus).toBe(EXPECTED_CY);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('ID-set equality: Phase2 READY == approved == production CY == staging MERGED', () => {
    const prodIds = new Set(cyprus.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(17);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('17 == 17 == 17 == 17');
  });

  test('all 17 approved SMALL_MARKET_INDEPENDENT; zero Class A', () => {
    expect(report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(0);
    expect(report.eligibility_breakdown?.SMALL_MARKET_INDEPENDENT).toBe(17);
    expect(approved.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
    expect(ready.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('READY hard DQ gates on production Cyprus rows', () => {
    for (const c of cyprus) {
      expect(c.id.startsWith(GYM_ID_PREFIX.cyprus)).toBe(true);
      expect(c.name.trim()).toBeTruthy();
      expect(c.address.trim()).toBeTruthy();
      expect(c.city.trim()).toBeTruthy();
      expect(CYPRUS_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleCyprusCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FOREIGN_NORTH.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(c.is_coming_soon).toBeFalsy();
      expect(c.country).toBe('Cyprus');
    }
  });

  test('Sanctum / Fitness One / NEEDS_COORD / CLOSED / EXCLUDED absent', () => {
    expect(report.sanctum?.total).toBe(0);
    expect(cyprus.filter(c => /sanctum/i.test(c.name) || /sanctum/i.test(c.brand || '')).length).toBe(
      0,
    );
    expect(report.fitness_one?.count).toBe(0);
    expect(
      cyprus.filter(c => /fitness one/i.test(c.brand || '') || /fitness one/i.test(c.name)).length,
    ).toBe(0);
    expect(
      cyprus.filter(c =>
        /anaplasis|arise active|kondylis|barbarian|gymland/i.test(`${c.brand} ${c.name}`),
      ).length,
    ).toBe(0);
    const closedExcluded = staging.filter(r =>
      ['CLOSED', 'EXCLUDED', 'NEEDS_COORDINATES'].includes(r.import_category),
    );
    const prodIds = new Set(cyprus.map(c => c.id));
    expect(closedExcluded.every(r => !prodIds.has(r.id))).toBe(true);
  });

  test('Fitness Factory=1; Curves=2; ALTERLIFE=1 Cyprus only', () => {
    expect(report.fitness_factory?.count).toBe(1);
    expect(cyprus.filter(c => c.brand === 'Fitness Factory').length).toBe(1);
    expect(cyprus.some(c => /engomi|pindou/i.test(`${c.name} ${c.address} ${c.city}`))).toBe(true);
    expect(report.curves?.count).toBe(2);
    expect(cyprus.filter(c => c.brand === 'Curves').length).toBe(2);
    expect(report.alterlife?.count).toBe(1);
    expect(cyprus.filter(c => c.brand === 'ALTERLIFE').length).toBe(1);
    expect(
      ALL_GYM_CENTERS.filter(
        c => c.id.startsWith('gr_') && /alterlife/i.test(c.brand || '') && c.country === 'Cyprus',
      ).length,
    ).toBe(0);
  });

  test('territorial CLEAN; Northern = 0; duplicates clean', () => {
    expect(report.territorial_safety?.result).toBe('CLEAN');
    expect(report.territorial_safety?.northern_cyprus).toBe(0);
    expect(report.territorial_safety?.republic_controlled).toBe(17);
    expect(dup.duplicate_ids || []).toEqual([]);
    expect(dup.unexplained_hard_duplicates || 0).toBe(0);
    expect((dup.post_merge_proximity?.lt25 || []).length).toBe(0);
    expect((dup.post_merge_proximity?.identical || []).length).toBe(0);
  });

  test('staging MERGED 17 / NEEDS_COORD 5 / CLOSED 8 / EXCLUDED 37', () => {
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(17);
    expect(cats.NEEDS_COORDINATES).toBe(5);
    expect(cats.CLOSED).toBe(8);
    expect(cats.EXCLUDED).toBe(37);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
    expect(cats.COMING_SOON || 0).toBe(0);
    expect(staging.length).toBe(67);
  });

  test('idempotency PASS; check-in unchanged; under 12500', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(CY_MERGE_AFTER_TOTAL);
    expect(idem.cyprus).toBe(EXPECTED_CY);
    expect(idem.result).toBe('PASS');
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.changed).toBe(false);
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.global_stress_qa_required_now).toBe(false);
    expect(report.global_scale?.new_production).toBe(CY_MERGE_AFTER_TOTAL);
  });

  test('country helpers; search smoke; check-in radius; orphan stub', () => {
    expect(isCyprusCountry('Cyprus')).toBe(true);
    expect(gymCountryTranslationKey('Cyprus')).toBe('countries.cyprus');
    expect(en.countries.cyprus).toBe('Cyprus');
    const stub = resolveGymOrStub('cy_nonexistent_test');
    expect(stub.region).toBe('Cyprus');
    getGymSearchIndex();
    const cyGyms = cyprus.map(toGym);
    expect(
      searchGyms('ALTERLIFE', {gyms: cyGyms, limit: 10}).some(h => h.gym.id.startsWith('cy_')),
    ).toBe(true);
    expect(
      searchGyms('Curves', {gyms: cyGyms, limit: 20}).some(h => h.gym.id.startsWith('cy_')),
    ).toBe(true);
    expect(
      searchGyms('Fitness Factory', {gyms: cyGyms, limit: 10}).some(h =>
        h.gym.id.startsWith('cy_'),
      ),
    ).toBe(true);
    expect(
      searchGyms('Paralimni', {gyms: cyGyms, limit: 10}).some(h => h.gym.id.startsWith('cy_')),
    ).toBe(true);
    const sample = cyprus[0]!;
    const gym = toGym(sample);
    const lat199 = gym.latitude + 199 / 111320;
    const lat200 = gym.latitude + 200 / 111320;
    const lat201 = gym.latitude + 201 / 111320;
    expect(haversineMeters(lat199, gym.longitude, gym.latitude, gym.longitude)).toBeLessThanOrEqual(
      CHECK_IN_RADIUS_METERS,
    );
    expect(haversineMeters(lat200, gym.longitude, gym.latitude, gym.longitude)).toBeLessThanOrEqual(
      CHECK_IN_RADIUS_METERS,
    );
    expect(haversineMeters(lat201, gym.longitude, gym.latitude, gym.longitude)).toBeGreaterThan(
      CHECK_IN_RADIUS_METERS,
    );
    findNearestGym(35.15, 33.35, cyGyms);
  });

  test('37-country regression including CY 17 / LI 7 totaling 11831', () => {
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
});
