/**
 * Andorra production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAndorraCoordinate,
  ANDORRA_POSTAL_RE,
  isAndorraCountry,
  isLiechtensteinCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;

const EXPECTED_TOTAL = 11921;
const EXPECTED_AD = 12;
const PRE_MERGE_SHA =
  'b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc';
const POST_MERGE_SHA =
  'bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d'; // frozen Andorra merge report
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const REQUIRED = {
  anyospark: 'ad_8989e7b07f',
  urbanAlv: 'ad_488e241114',
  palauDeGel: 'ad_1fb5491cda',
  duplex: 'ad_6fc179f949',
  next: 'ad_2594f0bd4f',
  princiesport: 'ad_be0d30a1f0',
  serradells: 'ad_2759cd904a',
  escaldes: 'ad_cfb6dcda5e',
  ceoOrdino: 'ad_918cf36646',
  encamp: 'ad_8e838a1d13',
  pasDeLaCasa: 'ad_886040e59f',
  lauesport: 'ad_ae9200b719',
};

const FORBIDDEN_LIVE_IDS = new Set([
  'ad_9447826d36', // Urban Gym Arinsal EXCLUDED_SEASONAL
]);

const EXPECTED_BRANDS: Record<string, number> = {
  AnyósPark: 1,
  'Urban Gym': 1,
  'Palau de Gel': 1,
  'Duplex Sport Club': 1,
  'NEXT Sports Club': 1,
  Princiesport: 1,
  Serradells: 1,
  'Centre Esportiu Escaldes-Engordany': 1,
  'CEO Ordino': 1,
  'Complex Esportiu Encamp': 1,
  'Centre Esportiu Pas de la Casa': 1,
  LAUesport: 1,
};

describe('Andorra merge safety', () => {
  const andorra = ALL_GYM_CENTERS.filter(c => c.country === 'Andorra');
  const reportPath = path.join(__dirname, '../data/andorra/ANDORRA_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/andorra/ANDORRA_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/andorra/andorra_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(__dirname, '../data/andorra/ANDORRA_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; andorra: number; liechtenstein?: number};
    before: {total: number; andorra: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    eligibility_breakdown?: Record<string, number>;
    brand_breakdown?: Record<string, number>;
    staging_reconciliation?: Record<string, unknown>;
    excluded_leakage?: {result?: string; forbidden_ids_in_production?: string[]};
    territorial_safety?: {
      result?: string;
      spain?: number;
      france?: number;
      foreign_outliers?: string[];
      pas_de_la_casa_in_andorra?: boolean;
    };
    rebrand_validation?: {result?: string; canillo_identity?: string};
    parish_coverage?: Record<string, string>;
    check_in?: {CHECK_IN_RADIUS_METERS: number; changed: boolean};
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
    parish?: string;
    lat: number;
    lng: number;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    brand: string;
    name: string;
    phase2_classification?: string;
  }>;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    final_catalog: number;
    andorra: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    duplicate_ids?: string[];
    unexplained_hard_duplicates?: number;
  };

  test('total catalog = 11831; Andorra = 12; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(andorra.length).toBe(EXPECTED_AD);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ad_')).length).toBe(EXPECTED_AD);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11699);
    expect(report.before.andorra).toBe(0);
    expect(report.inserted).toBe(12);
    expect(report.after.total).toBe(11711); // frozen Andorra merge after
    expect(report.after.andorra).toBe(EXPECTED_AD);
    expect(report.after.liechtenstein).toBe(7);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('eligibility: CHAIN_CLASS_A 0 + SMALL_MARKET_INDEPENDENT 12', () => {
    expect(report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(0);
    expect(report.eligibility_breakdown?.SMALL_MARKET_INDEPENDENT).toBe(12);
    expect(report.eligibility_breakdown?.TOTAL).toBe(12);
    expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('ID-set equality: Phase2 READY == approved == production AD == staging MERGED', () => {
    const prodIds = new Set(andorra.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(12);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('12 == 12 == 12 == 12');
  });

  test('exact approved inventory live; metadata equality; brands 1 each', () => {
    const byId = Object.fromEntries(andorra.map(c => [c.id, c]));
    for (const id of Object.values(REQUIRED)) {
      expect(byId[id]).toBeTruthy();
      expect(isPlausibleAndorraCoordinate(byId[id].lat!, byId[id].lng!)).toBe(true);
      expect(ANDORRA_POSTAL_RE.test(String(byId[id].postal_code))).toBe(true);
      expect(MOJIBAKE_RE.test(`${byId[id].name} ${byId[id].address}`)).toBe(false);
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
      expect(String(a.parish || '').length).toBeGreaterThan(0);
    }
    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(andorra.filter(c => c.brand === brand).length).toBe(n);
      expect(report.brand_breakdown?.[brand]).toBe(n);
    }
    expect(new Set(andorra.map(c => c.brand)).size).toBe(12);
  });

  test('Canillo = Palau de Gel; Arinsal/Caldea excluded; Urban/AnyósPark Class A = 0', () => {
    const canillo = andorra.find(c => c.id === REQUIRED.palauDeGel)!;
    expect(canillo.brand).toBe('Palau de Gel');
    expect(canillo.name).toMatch(/Palau de Gel/i);
    expect(andorra.some(c => /Urban Gym/i.test(c.brand) && /Canillo/i.test(c.name))).toBe(
      false,
    );
    expect(andorra.filter(c => c.brand === 'Urban Gym').length).toBe(1);
    expect(andorra.filter(c => c.brand === 'AnyósPark').length).toBe(1);
    for (const id of FORBIDDEN_LIVE_IDS) {
      expect(ALL_GYM_CENTERS.some(c => c.id === id)).toBe(false);
    }
    expect(andorra.some(c => /Arinsal|Caldea|Casa Wellness|CrossFit/i.test(`${c.brand} ${c.name}`))).toBe(
      false,
    );
    const arinsal = staging.find(r => r.id === 'ad_9447826d36')!;
    expect(arinsal.import_category).toBe('EXCLUDED');
    expect(arinsal.phase2_classification).toBe('EXCLUDED_SEASONAL');
    expect(report.rebrand_validation?.result).toBe('PASS');
    expect(report.rebrand_validation?.canillo_identity).toBe('Palau de Gel');
    expect(report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(0);
  });

  test('staging MERGED 12 / EXCLUDED 42; leakage CLEAN', () => {
    expect(report.excluded_leakage?.result).toBe('CLEAN');
    expect(report.excluded_leakage?.forbidden_ids_in_production).toEqual([]);
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(12);
    expect(cats.EXCLUDED).toBe(42);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
    expect(staging.length).toBe(54);
  });

  test('cross-border CLEAN; Pas de la Casa in Andorra; hard dups 0', () => {
    expect(report.territorial_safety?.result).toBe('CLEAN');
    expect(report.territorial_safety?.spain).toBe(0);
    expect(report.territorial_safety?.france).toBe(0);
    expect(report.territorial_safety?.foreign_outliers).toEqual([]);
    expect(report.territorial_safety?.pas_de_la_casa_in_andorra).toBe(true);
    for (const c of andorra) {
      expect(isPlausibleAndorraCoordinate(c.lat!, c.lng!)).toBe(true);
    }
    const pas = andorra.find(c => c.id === REQUIRED.pasDeLaCasa)!;
    expect(pas.postal_code).toBe('AD200');
    expect(pas.city).toMatch(/Pas de la Casa/i);
    expect(dup.duplicate_ids || []).toEqual([]);
    expect(dup.unexplained_hard_duplicates).toBe(0);
    expect(report.unexplained_hard_duplicates).toBe(0);
  });

  test('all 7 parishes represented; 37-country regression totaling 11831', () => {
    for (const p of [
      'Andorra la Vella',
      'Canillo',
      'Encamp',
      'Escaldes-Engordany',
      'La Massana',
      'Ordino',
      'Sant Julià de Lòria',
    ]) {
      expect(report.parish_coverage?.[p]).toBe('READY_present');
    }
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
    expect(GYM_ID_PREFIX.andorra).toBe('ad_');
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(gymCountryTranslationKey('Andorra')).toBe('countries.andorra');
    expect(resolveGymOrStub('ad_nonexistent_test').region).toBe('Andorra');
    expect(resolveGymOrStub(REQUIRED.anyospark).region).toBe('Andorra');
  });

  test('idempotency PASS; global scale under 12500; KEEP CLIENT-SIDE', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(11711);
    expect(idem.andorra).toBe(12);
    expect(idem.result).toBe('PASS');
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.new_production).toBe(11711);
    expect(report.performance?.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.performance?.catalog).toBe(11711); // frozen Andorra merge report
  });
});
