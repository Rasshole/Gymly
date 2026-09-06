/**
 * Monaco production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMonacoCoordinate,
  MONACO_POSTAL_RE,
  isMonacoCountry,
  isAndorraCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

const EXPECTED_TOTAL = 11921;
const EXPECTED_MC = 4;
const PRE_MERGE_SHA =
  'bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f';
const POST_MERGE_SHA =
  '0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d'; // frozen Monaco merge report
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const REQUIRED = {
  fitFactory: 'mc_4d51f17fbd',
  eclub: 'mc_acfff20d6b',
  hercule: 'mc_cb57fc40d1',
  stadeLouisII: 'mc_2771a49489',
};

const EXPECTED_BRANDS: Record<string, number> = {
  'Fit Factory': 1,
  Eclub: 1,
  'Hercule Fitness Club': 1,
  'Stade Louis II': 1,
};

describe('Monaco merge safety', () => {
  const monaco = ALL_GYM_CENTERS.filter(c => c.country === 'Monaco');
  const reportPath = path.join(__dirname, '../data/monaco/MONACO_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/monaco/MONACO_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/monaco/monaco_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(__dirname, '../data/monaco/MONACO_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(
    __dirname,
    '../data/monaco/MONACO_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; monaco: number; andorra?: number};
    before: {total: number; monaco: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    eligibility_breakdown?: Record<string, number>;
    brand_breakdown?: Record<string, number>;
    staging_reconciliation?: Record<string, unknown>;
    excluded_leakage?: {result?: string; world_class_cap_dail_absent?: boolean};
    territorial_safety?: {
      result?: string;
      france?: number;
      foreign_outliers?: string[];
      monaco_premises?: number;
    };
    municipal_identity?: {classification?: string; result?: string};
    rebrand_validation?: {result?: string; unresolved_conflicts?: number};
    check_in?: {
      CHECK_IN_RADIUS_METERS: number;
      changed: boolean;
      allow_199m?: boolean;
      allow_200m?: boolean;
      block_201m?: boolean;
    };
    global_scale?: {crossed_12500: boolean; new_production: number};
    unexplained_hard_duplicates?: number;
    performance?: {architecture?: string; catalog?: number};
    verdict?: string;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
    eligibility_path?: string;
    brand: string;
    name: string;
    address: string;
    postal_code: string;
    city: string;
    district?: string;
    lat: number;
    lng: number;
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
    monaco: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    duplicate_ids?: string[];
    unexplained_hard_duplicates?: number;
  };

  test('total catalog = 11831; Monaco = 4; live SHA after Moldova merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(monaco.length).toBe(EXPECTED_MC);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mc_')).length).toBe(EXPECTED_MC);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11711);
    expect(report.before.monaco).toBe(0);
    expect(report.inserted).toBe(4);
    expect(report.after.total).toBe(11715); // Monaco merge report frozen
    expect(report.after.monaco).toBe(EXPECTED_MC);
    expect(report.after.andorra).toBe(12);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('eligibility: CHAIN_CLASS_A 0 + SMALL_MARKET_INDEPENDENT 4', () => {
    expect(report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(0);
    expect(report.eligibility_breakdown?.SMALL_MARKET_INDEPENDENT).toBe(4);
    expect(report.eligibility_breakdown?.TOTAL).toBe(4);
    expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('ID-set equality: Phase2 READY == approved == production MC == staging MERGED', () => {
    const prodIds = new Set(monaco.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(4);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('4 == 4 == 4 == 4');
  });

  test('exact approved inventory live; metadata equality; brands 1 each', () => {
    const byId = Object.fromEntries(monaco.map(c => [c.id, c]));
    for (const id of Object.values(REQUIRED)) {
      expect(byId[id]).toBeTruthy();
      expect(isPlausibleMonacoCoordinate(byId[id].lat!, byId[id].lng!)).toBe(true);
      expect(MONACO_POSTAL_RE.test(String(byId[id].postal_code))).toBe(true);
      expect(MOJIBAKE_RE.test(`${byId[id].name} ${byId[id].address}`)).toBe(false);
      expect(String(byId[id].address || '').trim().length).toBeGreaterThan(3);
    }
    for (const a of approved) {
      const live = byId[a.id];
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(live.lat).toBe(a.lat);
      expect(live.lng).toBe(a.lng);
      expect(String(a.district || a.city || '').length).toBeGreaterThan(0);
    }
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(monaco.filter(c => c.brand === brand).length).toBe(n);
      expect(report.brand_breakdown?.[brand]).toBe(n);
    }
    expect(new Set(monaco.map(c => c.brand)).size).toBe(4);
  });

  test('identity gates: Fit Factory/Eclub once; Hercule≠Stade; predecessors absent', () => {
    expect(monaco.filter(c => c.brand === 'Fit Factory').length).toBe(1);
    expect(monaco.filter(c => c.brand === 'Eclub').length).toBe(1);
    expect(monaco.filter(c => c.brand === 'Hercule Fitness Club').length).toBe(1);
    expect(monaco.filter(c => c.brand === 'Stade Louis II').length).toBe(1);
    const hercule = monaco.find(c => c.id === REQUIRED.hercule)!;
    const stade = monaco.find(c => c.id === REQUIRED.stadeLouisII)!;
    expect(hercule.city).toBe('La Condamine');
    expect(stade.city).toBe('Fontvieille');
    expect(hercule.address).not.toBe(stade.address);
    expect(hercule.lat).not.toBe(stade.lat);
    expect(report.municipal_identity?.classification).toBe('A_DISTINCT_PUBLIC_GYMS');
    expect(report.municipal_identity?.result).toBe('PASS');
    expect(
      monaco.some(c => /Larvotto Gym Center/i.test(`${c.brand} ${c.name}`)),
    ).toBe(false);
    expect(
      monaco.some(c => /^Monte-Carlo GYM$/i.test(c.brand) || /^Monte-Carlo GYM$/i.test(c.name)),
    ).toBe(false);
  });

  test('exclusions absent; World Class Cap-d\'Ail absent; leakage CLEAN', () => {
    expect(report.excluded_leakage?.result).toBe('CLEAN');
    expect(report.excluded_leakage?.world_class_cap_dail_absent).toBe(true);
    expect(
      ALL_GYM_CENTERS.some(c => /World Class/i.test(c.brand) && /Cap/i.test(c.name)),
    ).toBe(false);
    expect(
      monaco.some(c =>
        /Fairmont|Thermes Marins|39 Monte-Carlo|The Forge|MonaMove/i.test(
          `${c.brand} ${c.name}`,
        ),
      ),
    ).toBe(false);
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(4);
    expect(cats.EXCLUDED).toBe(35);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
    expect(cats.NEEDS_COORDINATES || 0).toBe(0);
    expect(staging.length).toBe(39);
  });

  test('cross-border CLEAN; French outliers 0; hard dups 0', () => {
    expect(report.territorial_safety?.result).toBe('CLEAN');
    expect(report.territorial_safety?.france).toBe(0);
    expect(report.territorial_safety?.foreign_outliers).toEqual([]);
    expect(report.territorial_safety?.monaco_premises).toBe(4);
    for (const c of monaco) {
      expect(isPlausibleMonacoCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(c.country).toBe('Monaco');
    }
    expect(dup.duplicate_ids || []).toEqual([]);
    expect(dup.unexplained_hard_duplicates).toBe(0);
    expect(report.unexplained_hard_duplicates).toBe(0);
    expect(report.rebrand_validation?.result).toBe('PASS');
    expect(report.rebrand_validation?.unresolved_conflicts).toBe(0);
  });

  test('37-country regression including MC 4 totaling 11831', () => {
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

  test('check-in / auto-checkout unchanged; country resolution', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.changed).toBe(false);
    expect(report.check_in?.allow_199m).toBe(true);
    expect(report.check_in?.allow_200m).toBe(true);
    expect(report.check_in?.block_201m).toBe(true);
    expect(GYM_ID_PREFIX.monaco).toBe('mc_');
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(gymCountryTranslationKey('Monaco')).toBe('countries.monaco');
    expect(resolveGymOrStub('mc_nonexistent_test').region).toBe('Monaco');
    expect(resolveGymOrStub(REQUIRED.fitFactory).region).toBe('Monaco');
  });

  test('idempotency PASS; global scale under 12500; KEEP CLIENT-SIDE', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(11715); // Monaco idempotency artifact frozen
    expect(idem.monaco).toBe(4);
    expect(idem.result).toBe('PASS');
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.new_production).toBe(11715);
    expect(report.performance?.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.performance?.catalog).toBe(11715);
  });
});
