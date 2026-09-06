/**
 * Malta production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMaltaCoordinate,
  MALTA_POSTAL_RE,
  isMaltaCountry,
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
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN =
  /\b(sicily|sicilia|italy|italia|tunisia|libya)\b/i;

const EXPECTED_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_MT = 18;
const MT_MERGE_AFTER_TOTAL = 11648; // frozen in MALTA_MERGE_REPORT
const PRE_MERGE_SHA =
  '45999725147f8ab12d85eccf19b8d755709d4c3234456665c2ab7eec0c133e78';
const POST_MERGE_SHA =
  'e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4'; // MT merge-time SHA
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Best Gyms Malta': 10,
  '24/7 Fitness Club': 4,
  'Challenger Fitness': 4,
};

const BIRGU_ID = 'mt_75a13770ff';
const KIRKOP_ID = 'mt_b8747c67db';
const MARSA_ID = 'mt_af9179a385';
const BIRZEBBUGA_ID = 'mt_963f710969';
const COTTONERA_ID = 'mt_26579c8193';

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Malta',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Malta merge safety', () => {
  const malta = ALL_GYM_CENTERS.filter(c => c.country === 'Malta');
  const reportPath = path.join(__dirname, '../data/malta/MALTA_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/malta/MALTA_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/malta/malta_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/malta/MALTA_PHASE2_READY_TO_IMPORT.json');
  const idemPath = path.join(__dirname, '../data/malta/MALTA_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/malta/MALTA_MERGE_DUPLICATE_ANALYSIS.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    withheld?: number;
    after: {total: number; malta: number};
    before: {total: number; malta: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    staging_reconciliation?: Record<string, unknown>;
    post_merge?: Record<string, number>;
    best_gyms?: Record<string, unknown>;
    fitness247?: Record<string, unknown>;
    challenger?: Record<string, unknown>;
    birgu?: Record<string, unknown>;
    rebrand_legacy?: Record<string, unknown>;
    coming_soon_exclusion?: Record<string, unknown>;
    border_safety?: {result?: string; foreign_coords?: number; italy_sicily?: number};
    check_in?: {
      CHECK_IN_RADIUS_METERS: number;
      AUTO_CHECKOUT_DISTANCE_METERS: number;
      changed: boolean;
    };
    brand_breakdown?: Record<string, number>;
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
    malta: number;
    result: string;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    unexplained_hard_duplicates?: number;
    duplicate_ids?: string[];
    post_merge_proximity?: {
      lt25?: unknown[];
      lt50?: unknown[];
      lt100?: unknown[];
      lt200?: unknown[];
      identical?: unknown[];
      diffBrand?: unknown[];
    };
  };

  test('total catalog = 11692; Malta = 18; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(malta.length).toBe(EXPECTED_MT);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(EXPECTED_MT);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11630);
    expect(report.before.malta).toBe(0);
    expect(report.inserted).toBe(18);
    expect(report.after.total).toBe(MT_MERGE_AFTER_TOTAL);
    expect(report.after.malta).toBe(EXPECTED_MT);
    expect(report.verdict).toMatch(/MERGE COMPLETE/i);
  });

  test('ID-set equality: Phase2 READY == approved == production MT == staging MERGED', () => {
    const prodIds = new Set(malta.map(c => c.id));
    const readyIds = new Set(ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').map(r => r.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(18);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('18 == 18 == 18 == 18');
  });

  test('brand breakdown exact 10 / 4 / 4; no unexpected brands', () => {
    const byBrand: Record<string, number> = {};
    for (const c of malta) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('Best Gyms Malta: Kirkop/Marsa/Birżebbuġa present; Birgu/Elite/Café absent', () => {
    expect(malta.some(c => c.id === KIRKOP_ID)).toBe(true);
    expect(malta.some(c => c.id === MARSA_ID)).toBe(true);
    expect(malta.filter(c => c.id === BIRZEBBUGA_ID).length).toBe(1);
    expect(malta.some(c => c.id === BIRGU_ID)).toBe(false);
    expect(
      malta.filter(c => /fitness café|fitness cafe/i.test(c.name) || /fitness café|fitness cafe/i.test(c.brand || '')).length,
    ).toBe(0);
    expect(
      malta.filter(
        c =>
          /^(elite gym|elite fitness)$/i.test(c.brand || '') ||
          /^(elite gym|elite fitness)\b/i.test(c.name),
      ).length,
    ).toBe(0);
    expect(report.best_gyms?.kirkop).toBe(true);
    expect(report.best_gyms?.marsa).toBe(true);
    expect(report.best_gyms?.birzebbuga).toBe(true);
    expect(report.best_gyms?.birgu_withheld).toBe(true);
    expect(report.best_gyms?.elite_predecessor_live).toBe(0);
  });

  test('24/7 current estate present; historical Santa Luċija / St Paul absent', () => {
    expect(report.fitness247?.count).toBe(4);
    expect(report.fitness247?.result).toBe('PASS');
    const club247 = malta.filter(c => c.brand === '24/7 Fitness Club');
    expect(club247.length).toBe(4);
    expect(club247.some(c => /mellieħa|mellieha/i.test(c.name) || /mellieħa|mellieha/i.test(c.city))).toBe(true);
    expect(club247.some(c => /san ġwann|san gwann/i.test(c.name) || /san ġwann|san gwann/i.test(c.city))).toBe(true);
    expect(club247.some(c => /qali|attard/i.test(c.name) || /qali|attard/i.test(c.city))).toBe(true);
    expect(club247.some(c => /żebbuġ|zebbug/i.test(c.name) || /żebbuġ|zebbug/i.test(c.city))).toBe(true);
    expect(
      malta.some(c => /santa luċija|santa lucia/i.test(c.name) || /santa luċija|santa lucia/i.test(c.city)),
    ).toBe(false);
    expect(
      malta.filter(
        c =>
          c.brand === '24/7 Fitness Club' &&
          (/st\.?\s*paul|san pawl|st paul/i.test(c.name) || /st\.?\s*paul|san pawl|st paul/i.test(c.city)),
      ).length,
    ).toBe(0);
  });

  test('Challenger: Cottonera once; Paceville absent', () => {
    expect(malta.filter(c => c.id === COTTONERA_ID).length).toBe(1);
    expect(malta.filter(c => c.brand === 'Challenger Fitness').length).toBe(4);
    expect(malta.some(c => /paceville/i.test(c.name) || /paceville/i.test(c.city))).toBe(false);
    expect(report.challenger?.cottonera).toBe(true);
    expect(report.challenger?.paceville_live).toBe(0);
  });

  test('Birgu COMING_SOON withheld from production', () => {
    expect(staging.find(r => r.id === BIRGU_ID)?.import_category).toBe('COMING_SOON');
    expect(malta.some(c => c.id === BIRGU_ID)).toBe(false);
    expect(report.birgu?.staging_id).toBe(BIRGU_ID);
    expect(report.birgu?.production_presence).toBe(0);
    expect(report.birgu?.result).toBe('PASS');
  });

  test('READY hard gates on live Malta rows', () => {
    const ids = new Set<string>();
    for (const c of malta) {
      expect(c.id).toMatch(/^mt_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Malta');
      expect(isMaltaCountry(c.country)).toBe(true);
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(c.name.trim()).toBeTruthy();
      expect(c.brand!.trim()).toBeTruthy();
      expect(c.address.trim()).toBeTruthy();
      expect(c.city.trim()).toBeTruthy();
      expect(MALTA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleMaltaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FOREIGN.test(`${c.name} ${c.address} ${c.city} ${c.brand}`)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    expect(ids.size).toBe(18);
    expect(report.border_safety?.result).toBe('CLEAN');
    expect(report.border_safety?.foreign_coords).toBe(0);
    expect(report.border_safety?.italy_sicily).toBe(0);
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(dup.unexplained_hard_duplicates).toBe(0);
  });

  test('approved metadata matches production rows (no drift)', () => {
    const byId = new Map(malta.map(c => [c.id, c]));
    for (const a of approved) {
      const p = byId.get(a.id);
      expect(p).toBeTruthy();
      expect(p!.name).toBe(a.name);
      expect(p!.brand).toBe(a.brand);
      expect(p!.address).toBe(a.address);
      expect(p!.city).toBe(a.city);
      expect(p!.postal_code).toBe(a.postal_code);
      expect(p!.lat).toBe(a.lat);
      expect(p!.lng).toBe(a.lng);
    }
  });

  test('country resolution, orphan stub, check-in radii unchanged', () => {
    expect(GYM_ID_PREFIX.malta).toBe('mt_');
    expect(gymCountryTranslationKey('Malta')).toBe('countries.malta');
    expect(resolveGymOrStub('mt_nonexistent_test').region).toBe('Malta');
    expect(resolveGymOrStub(KIRKOP_ID).id).toBe(KIRKOP_ID);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.changed).toBe(false);
  });

  test('search finds Malta brands/cities; nearest resolves', () => {
    const mtGyms = malta.map(toGym);
    getGymSearchIndex(mtGyms);
    expect(
      searchGyms('Best Gyms', {gyms: mtGyms, limit: 30}).some(h => h.gym.country === 'Malta'),
    ).toBe(true);
    expect(
      searchGyms('Challenger', {gyms: mtGyms, limit: 20}).some(h => h.gym.country === 'Malta'),
    ).toBe(true);
    expect(
      searchGyms('Sliema', {gyms: mtGyms, limit: 10}).some(h => /sliema/i.test(h.gym.city) || /sliema/i.test(h.gym.name)),
    ).toBe(true);
    const nearest = findNearestGym(35.8989, 14.5146, mtGyms);
    expect(nearest?.country).toBe('Malta');
  });

  test('idempotency PASS; under 12500; no Global Stress QA', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(MT_MERGE_AFTER_TOTAL);
    expect(idem.malta).toBe(EXPECTED_MT);
    expect(idem.result).toBe('PASS');
    expect(report.global_scale?.previous_production).toBe(11630);
    expect(report.global_scale?.new_production).toBe(11648);
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.global_stress_qa_required_now).toBe(false);
    expect(report.performance?.catalog).toBe(MT_MERGE_AFTER_TOTAL);
  });

  test('staging summary MERGED 18 / CS 1 / CLOSED 3 / EXCLUDED 31', () => {
    const cats: Record<string, number> = {};
    for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
    expect(cats.MERGED_INTO_CATALOG).toBe(18);
    expect(cats.COMING_SOON).toBe(1);
    expect(cats.CLOSED).toBe(3);
    expect(cats.EXCLUDED).toBe(31);
    expect(cats.NEEDS_COORDINATES || 0).toBe(0);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
    expect(staging.length).toBe(53);
    expect(report.rebrand_legacy?.fitness_cafe_live).toBe(0);
    expect(report.rebrand_legacy?.elite_live).toBe(0);
    expect(report.rebrand_legacy?.paceville_live).toBe(0);
    expect(report.coming_soon_exclusion?.birgu_withheld).toBe(true);
  });

  test('30-country regression including MT 18 / CY 17 totaling 11692', () => {
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
