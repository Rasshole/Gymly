/**
 * Luxembourg production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLuxembourgCoordinate,
  LUXEMBOURG_POSTAL_RE,
  isLuxembourgCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FOREIGN =
  /\b(belgium|belgi[eë]|france|deutschland|germany|trier|thionville|athus|perl)\b/i;

const EXPECTED_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_LU = 20;
const LU_MERGE_AFTER_TOTAL = 11630; // frozen in LUXEMBOURG_MERGE_REPORT
const PRE_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const POST_MERGE_SHA =
  '45999725147f8ab12d85eccf19b8d755709d4c3234456665c2ab7eec0c133e78'; // LU merge-time SHA
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Basic-Fit': 10,
  JIMS: 6,
  'CK Fitness': 4,
};

const BASIC_FIT_FOETZ = 'lu_dc1931d263';
const JIMS_FOETZ = 'lu_7bf8591421';
const BF_JUNCK = 'lu_a61ce060d4';
const JIMS_GARE = 'lu_987be28ebf';

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Luxembourg',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Luxembourg merge safety', () => {
  const luxembourg = ALL_GYM_CENTERS.filter(c => c.country === 'Luxembourg');
  const reportPath = path.join(__dirname, '../data/luxembourg/LUXEMBOURG_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/luxembourg/luxembourg_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; luxembourg: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    staging_reconciliation?: Record<string, unknown>;
    post_merge?: Record<string, number>;
    foetz?: Record<string, unknown>;
    junck?: Record<string, unknown>;
    painworld?: Record<string, unknown>;
    border_safety?: {result?: string; foreign_coords?: number};
    check_in?: {CHECK_IN_RADIUS_METERS: number; AUTO_CHECKOUT_DISTANCE_METERS: number};
    brand_breakdown?: Record<string, number>;
    global_scale?: {crossed_12500: boolean; global_stress_qa_required_now: boolean};
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
    luxembourg: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    post_merge_proximity?: {diffBrand?: Array<{classification?: string}>};
    known_legitimate?: {foetz_live_only_basic_fit?: boolean};
  };

  test('total catalog = 11692; Luxembourg = 20; post-merge SHA', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(luxembourg.length).toBe(EXPECTED_LU);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('lu_')).length).toBe(EXPECTED_LU);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.inserted).toBe(20);
    expect(report.after.total).toBe(LU_MERGE_AFTER_TOTAL);
    expect(report.after.luxembourg).toBe(EXPECTED_LU);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('ID-set equality: Phase2 READY == approved == production LU == staging MERGED', () => {
    const prodIds = new Set(luxembourg.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(20);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
  });

  test('brand breakdown exact; no unexpected brands', () => {
    const byBrand: Record<string, number> = {};
    for (const c of luxembourg) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('Foetz CASE A: Basic-Fit merged; JIMS Foetz withheld', () => {
    expect(luxembourg.some(c => c.id === BASIC_FIT_FOETZ)).toBe(true);
    expect(luxembourg.some(c => c.id === JIMS_FOETZ)).toBe(false);
    expect(staging.find(r => r.id === JIMS_FOETZ)?.import_category).toBe('COMING_SOON');
    expect(report.foetz?.basic_fit_merged).toBe(true);
    expect(report.foetz?.jims_foetz_merged).toBe(false);
    expect(dup.known_legitimate?.foetz_live_only_basic_fit).toBe(true);
  });

  test('Junck pair both present; Painworld absent; JIMS Gasperich once', () => {
    expect(luxembourg.some(c => c.id === BF_JUNCK)).toBe(true);
    expect(luxembourg.some(c => c.id === JIMS_GARE)).toBe(true);
    expect(report.junck?.both_present).toBe(true);
    expect(report.junck?.classification).toBe('A_legitimate_adjacent');
    expect(
      luxembourg.filter(c => /painworld/i.test(c.brand || '') || /painworld/i.test(c.name)).length,
    ).toBe(0);
    expect(
      luxembourg.filter(c => c.brand === 'JIMS' && /gasperich/i.test(c.name)).length,
    ).toBe(1);
    expect(report.painworld?.painworld_live).toBe(0);
    expect(report.painworld?.jims_gasperich).toBe(1);
  });

  test('READY hard gates on live Luxembourg rows', () => {
    const ids = new Set<string>();
    for (const c of luxembourg) {
      expect(c.id).toMatch(/^lu_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Luxembourg');
      expect(isLuxembourgCountry(c.country)).toBe(true);
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(LUXEMBOURG_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleLuxembourgCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FOREIGN.test(`${c.name} ${c.address} ${c.city} ${c.brand}`)).toBe(false);
    }
    expect(ids.size).toBe(20);
    expect(report.border_safety?.result).toBe('CLEAN');
    expect(report.border_safety?.foreign_coords).toBe(0);
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
  });

  test('country resolution, orphan stub, check-in radii unchanged', () => {
    expect(GYM_ID_PREFIX.luxembourg).toBe('lu_');
    expect(gymCountryTranslationKey('Luxembourg')).toBe('countries.luxembourg');
    expect(resolveGymOrStub('lu_nonexistent_test').region).toBe('Luxembourg');
    expect(resolveGymOrStub(BASIC_FIT_FOETZ).id).toBe(BASIC_FIT_FOETZ);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.changed).toBe(false);
  });

  test('search finds Luxembourg brands/cities; nearest resolves', () => {
    const luGyms = luxembourg.map(toGym);
    getGymSearchIndex(luGyms);
    expect(
      searchGyms('Basic-Fit', {gyms: luGyms, limit: 30}).some(h => h.gym.country === 'Luxembourg'),
    ).toBe(true);
    expect(
      searchGyms('JIMS', {gyms: luGyms, limit: 20}).some(h => h.gym.country === 'Luxembourg'),
    ).toBe(true);
    expect(
      searchGyms('CK Fitness', {gyms: luGyms, limit: 20}).some(h => h.gym.country === 'Luxembourg'),
    ).toBe(true);
    expect(
      searchGyms('Foetz', {gyms: luGyms, limit: 10}).some(h => /foetz/i.test(h.gym.city)),
    ).toBe(true);
    expect(
      searchGyms('Mersch', {gyms: luGyms, limit: 10}).some(h => /mersch/i.test(h.gym.city)),
    ).toBe(true);
    const nearest = findNearestGym(49.6116, 6.1319, luGyms);
    expect(nearest?.country).toBe('Luxembourg');
  });

  test('idempotency PASS; under 12500; no Global Stress QA', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(LU_MERGE_AFTER_TOTAL);
    expect(idem.luxembourg).toBe(EXPECTED_LU);
    expect(idem.result).toBe('PASS');
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.global_stress_qa_required_now).toBe(false);
  });

  test('staging summary MERGED 20 / CS 1 / EXCLUDED 18', () => {
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(20);
    expect(cats.COMING_SOON).toBe(1);
    expect(cats.EXCLUDED).toBe(18);
    expect(cats.NEEDS_COORDINATES || 0).toBe(0);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
  });

  test('30-country regression including LU 20 / CY 17 totaling 11692', () => {
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
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11692);
  });
});
