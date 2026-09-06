/**
 * Lithuania production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLithuaniaCoordinate,
  LITHUANIA_POSTAL_RE,
  isLithuaniaCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {buildGymSearchEntry, getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {findNearestGym} from '../src/utils/nearestGym';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import {getActiveGyms, type DanishGym} from '../src/data/danishGyms';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import type {MapCenter} from '../src/data/mapCentersData';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN =
  /\b(latvia|latvija|riga|poland|polska|belarus|kaliningrad|estonia|eesti|tallinn)\b/i;

const EXPECTED_TOTAL = 11509; // Lithuania merge-time catalog (report artifact)
const CURRENT_CATALOG_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_LITHUANIA = 61;
const PRE_MERGE_SHA =
  'a1e097699ab64dfbda37826dccbaa4ebe219c2f0dc47cfd2f96b4c38f47b5a37';
const POST_MERGE_SHA =
  '3ab2fb07f7f8748872f7345a57bc5f31c27bf7bc5709b16420cce33b73a85142'; // LT merge report artifact
const CURRENT_CATALOG_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc'; // live after Estonia merge

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Gym+': 38,
  'Lemon Gym': 18,
  Impuls: 5,
};

const EXCLUDED_BRAND_RE =
  /^(fitclub|fitus|fitness factory|sports house|skygym|vs fitness|people fitness|myfitness|anytime|mcfit|gold'?s gym|world class|fitness first|john reed|clever fit|basic-?fit|fitinn|form factory|gym!)$/i;

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Lithuania',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Lithuania merge safety', () => {
  const lithuania = ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania');
  const reportPath = path.join(__dirname, '../data/lithuania/LITHUANIA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/lithuania/LITHUANIA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/lithuania/lithuania_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/lithuania/LITHUANIA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/lithuania/LITHUANIA_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/lithuania/LITHUANIA_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; lithuania: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    staging_reconciliation?: {
      metadata_drift: string;
      MERGED_INTO_CATALOG: number;
      NEEDS_COORDINATES: number;
      NEEDS_REVIEW: number;
      COMING_SOON: number;
      EXCLUDED: number;
      DUPLICATE_LEGACY: number;
      reconciliation: string;
      missing_production_ids: string[];
      unexpected_production_ids: string[];
    };
    post_merge?: {
      same_brand_lte_25m: number;
      same_brand_lte_50m: number;
      same_brand_lte_100m: number;
      same_brand_lte_200m: number;
      identical_coordinate_clusters: number;
      different_brand_colocations: number;
      duplicate_ids: number;
    };
    gym_plus?: Record<string, boolean | number | string>;
    lemon_gym?: Record<string, boolean | number>;
    impuls?: {live: number};
    rebrand?: Record<string, boolean | number>;
    exclusions?: Record<string, boolean>;
    border_safety?: Record<string, number>;
    check_in?: {CHECK_IN_RADIUS_METERS: number; AUTO_CHECKOUT_DISTANCE_METERS: number};
    brand_breakdown?: Record<string, number>;
    performance?: Record<string, number | string>;
    global_scale?: {crossed_12500: boolean; global_stress_qa_required_now: boolean};
    verdict?: string;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
    brand: string;
    name: string;
    address: string;
    postal_code: string;
    city: string;
    lat: number;
    lng: number;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    name?: string;
    brand?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    lat?: number;
    lng?: number;
  }>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{
    id: string;
    name: string;
    brand: string;
    address: string;
    postal_code: string;
    city: string;
    lat: number;
    lng: number;
  }>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
    final_catalog: number;
    lithuania: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    included: Array<{id: string}>;
    counts?: Record<string, number>;
  };

  test('total catalog = 11692 live; Lithuania = 61; post-merge SHA', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_CATALOG_TOTAL);
    expect(lithuania.length).toBe(EXPECTED_LITHUANIA);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.lithuania).toBe(EXPECTED_LITHUANIA);
    expect(report.inserted).toBe(EXPECTED_LITHUANIA);
    expect(phase2Ready.length).toBe(EXPECTED_LITHUANIA);
    expect(approved.length).toBe(EXPECTED_LITHUANIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_LITHUANIA,
    );
    expect(dup.included.length).toBe(EXPECTED_LITHUANIA);
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(CURRENT_CATALOG_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.verdict).toBe('LITHUANIA MERGE COMPLETE — WAITING FOR QA');
  });

  test('exact ID reconciliation across ready/approved/merged/production', () => {
    const prodIds = new Set(lithuania.map(c => c.id));
    const readyIds = new Set(phase2Ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('61 == 61 == 61');
    expect(report.staging_reconciliation?.missing_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.unexpected_production_ids).toEqual([]);
  });

  test('approved metadata matches production rows', () => {
    const byId = new Map(lithuania.map(c => [c.id, c]));
    for (const a of approved) {
      const p = byId.get(a.id);
      expect(p).toBeTruthy();
      expect(p!.name).toBe(a.name);
      expect(p!.brand).toBe(a.brand);
      expect(p!.address).toBe(a.address);
      expect(p!.postal_code).toBe(a.postal_code);
      expect(p!.city).toBe(a.city);
      expect(p!.lat).toBe(a.lat);
      expect(p!.lng).toBe(a.lng);
      expect(p!.country).toBe('Lithuania');
      expect(p!.is_active).toBe(true);
      expect(p!.is_coming_soon).not.toBe(true);
    }
  });

  test('previous country counts unchanged; LT added', () => {
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
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(CURRENT_CATALOG_TOTAL);
  });

  test('all Lithuania IDs are unique lt_* with valid LT-NNNNN and LT coords', () => {
    const ids = new Set<string>();
    for (const c of lithuania) {
      expect(c.id).toMatch(/^lt_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Lithuania');
      expect(isLithuaniaCountry(c.country)).toBe(true);
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(LITHUANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
      expect(isPlausibleLithuaniaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
      expect(EXCLUDED_BRAND_RE.test(String(c.brand || '').trim())).toBe(false);
    }
    expect(ids.size).toBe(lithuania.length);
  });

  test('exact brand counts', () => {
    const byBrand: Record<string, number> = {};
    for (const c of lithuania) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('Gym+ specials: Pociūno + single Gardino; Viršuliškių absent', () => {
    expect(lithuania.filter(c => c.brand === 'Gym+').length).toBe(38);
    const pociuno = lithuania.find(c => c.id === 'lt_6ddca417a2');
    expect(pociuno).toBeTruthy();
    expect(pociuno!.postal_code).toBe('06264');
    expect(/pociūno|pociuno/i.test(`${pociuno!.name} ${pociuno!.address}`)).toBe(true);
    expect(
      lithuania.filter(c => /pociūno|pociuno/i.test(`${c.name} ${c.address}`)).length,
    ).toBe(1);

    const gardino = lithuania.filter(c => /gardino/i.test(`${c.name} ${c.address}`));
    expect(gardino.length).toBe(1);
    expect(gardino[0]!.id).toBe('lt_5b1f24ce40');

    expect(
      lithuania.some(c => /viršuliškių|virsuliskiu/i.test(`${c.name} ${c.address}`)),
    ).toBe(false);
    expect(report.gym_plus?.pociuno_present).toBe(true);
    expect(report.gym_plus?.gardino_count).toBe(1);
    expect(report.gym_plus?.virsuliskiu_absent).toBe(true);
  });

  test('Lemon Gym = 18 open; Riešė and Jonava pipeline absent', () => {
    expect(lithuania.filter(c => c.brand === 'Lemon Gym').length).toBe(18);
    expect(lithuania.some(c => /riešė|riese/i.test(`${c.name} ${c.address}`))).toBe(false);
    expect(
      lithuania.some(c => c.brand === 'Lemon Gym' && /jonava/i.test(`${c.name} ${c.city}`)),
    ).toBe(false);
    expect(report.lemon_gym?.riese_absent).toBe(true);
    expect(report.lemon_gym?.jonava_absent).toBe(true);
  });

  test('Impuls = 5', () => {
    expect(lithuania.filter(c => c.brand === 'Impuls').length).toBe(5);
    expect(report.impuls?.live).toBe(5);
  });

  test('rebrand / predecessor safety', () => {
    expect(lithuania.some(c => /^VS Fitness$/i.test(c.brand))).toBe(false);
    expect(lithuania.some(c => /^People Fitness$/i.test(c.brand))).toBe(false);
    expect(lithuania.some(c => /^MyFitness$/i.test(c.brand))).toBe(false);
    expect(report.rebrand?.vs_fitness_live).toBe(0);
    expect(report.rebrand?.people_fitness_live).toBe(0);
    expect(report.rebrand?.myfitness_live).toBe(0);
    expect(report.rebrand?.lemon_impuls_distinct).toBe(true);
  });

  test('coming-soon and excluded staging IDs absent from production', () => {
    const prodIds = new Set(lithuania.map(c => c.id));
    const blocked = staging.filter(s =>
      ['EXCLUDED', 'COMING_SOON', 'NEEDS_REVIEW', 'NEEDS_COORDINATES', 'DUPLICATE'].includes(
        s.import_category,
      ),
    );
    for (const r of blocked) {
      expect(prodIds.has(r.id)).toBe(false);
    }
    expect(staging.filter(s => s.import_category === 'COMING_SOON').length).toBe(3);
    expect(staging.filter(s => s.import_category === 'EXCLUDED').length).toBe(6);
    expect(staging.filter(s => s.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(s => s.import_category === 'DUPLICATE').length).toBe(0);
    expect(report.exclusions?.coming_soon_ids_absent).toBe(true);
    expect(report.exclusions?.excluded_ids_absent).toBe(true);
  });

  test('duplicate / proximity: zero unexplained suspicious pairs', () => {
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    // Mall co-tenancy may exist; classify via report — currently 0
    expect(report.post_merge?.different_brand_colocations).toBe(0);
  });

  test('border safety: zero foreign contamination', () => {
    expect(report.border_safety?.foreign_coords).toBe(0);
    expect(report.border_safety?.latvia_text).toBe(0);
    expect(report.border_safety?.poland_text).toBe(0);
    expect(report.border_safety?.belarus_text).toBe(0);
    expect(report.border_safety?.kaliningrad_text).toBe(0);
    expect(report.border_safety?.estonia_text).toBe(0);
    for (const c of lithuania) {
      expect(isPlausibleLithuaniaCoordinate(c.lat!, c.lng!)).toBe(true);
    }
  });

  test('check-in / auto-checkout remain 200 m; importer idempotent', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(idem.pass).toBe(true);
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL); // LT merge-time artifact
    expect(idem.lithuania).toBe(EXPECTED_LITHUANIA);
  });

  test('search / country infrastructure still works for Lithuania', () => {
    expect(gymCountryTranslationKey('Lithuania')).toBe('countries.lithuania');
    expect(resolveGymOrStub('lt_nonexistent_merge_probe').region).toBe('Lithuania');
    const ltGyms = lithuania.map(toGym);
    const queries = [
      'Lithuania',
      'Gym+',
      'Lemon Gym',
      'Impuls',
      'Vilnius',
      'Kaunas',
      'Klaipėda',
      'Šiauliai',
      'Panevėžys',
      'Gardino',
      '06264',
    ];
    for (const q of queries) {
      const hits = searchGyms(q, {gyms: ltGyms, limit: 40});
      const ltHits = hits.filter(h => h.gym.id.startsWith('lt_'));
      expect(ltHits.length).toBeGreaterThan(0);
    }
    expect(normalizeGymSearchValue('Klaipėda')).toBe('klaipeda');
    expect(normalizeGymSearchValue('Šiauliai')).toBe('siauliai');
    const entry = buildGymSearchEntry(toGym(lithuania[0]));
    expect(entry.haystack).toMatch(/lithuania|lietuva/i);
  });

  test('nearest + map viewport smoke on Vilnius', () => {
    const ltGyms = lithuania.map(toGym);
    const nearest = findNearestGym(54.6872, 25.2797, ltGyms);
    expect(nearest?.country).toBe('Lithuania');
    expect(nearest?.id.startsWith('lt_')).toBe(true);

    const mapCenters: MapCenter[] = lithuania.map(c => {
      const map = getMarkerMapCoordinate(c.id, c.lat!, c.lng!);
      return {
        id: c.id,
        name: c.name,
        latitude: c.lat!,
        longitude: c.lng!,
        mapLatitude: map.latitude,
        mapLongitude: map.longitude,
        logoUrl: null,
        friendsActiveCount: 0,
        totalActiveCount: 0,
        address: c.address,
        city: c.city,
        brand: c.brand,
        hasExplicitGeocode: true,
      };
    });
    const visible = filterMapCentersInRegion(mapCenters, {
      latitude: 54.6872,
      longitude: 25.2797,
      latitudeDelta: 0.35,
      longitudeDelta: 0.35,
    });
    expect(visible.length).toBeGreaterThan(0);
  });

  test('performance snapshot on 11542 catalog is healthy; under 12,500', () => {
    const t0 = Date.now();
    const gyms = getActiveGyms();
    const activeMs = Date.now() - t0;
    const t1 = Date.now();
    const index = getGymSearchIndex(gyms);
    const coldMs = Date.now() - t1;
    const t2 = Date.now();
    getGymSearchIndex(gyms);
    const cachedMs = Date.now() - t2;
    const t3 = Date.now();
    searchGyms('Vilnius', {gyms, limit: 20});
    const typicalMs = Date.now() - t3;
    const t4 = Date.now();
    searchGyms('zzzz-nonexistent-query-xyz', {gyms, limit: 20});
    const worstMs = Date.now() - t4;
    const nearest = findNearestGym(54.6872, 25.2797, lithuania.map(toGym));
    expect(nearest).toBeTruthy();
    expect(gyms.length).toBeGreaterThanOrEqual(CURRENT_CATALOG_TOTAL - 50);
    expect(index.length).toBeGreaterThan(0);
    expect(activeMs).toBeLessThan(5000);
    expect(coldMs).toBeLessThan(25000);
    expect(cachedMs).toBeLessThan(100);
    expect(typicalMs).toBeLessThan(2000);
    expect(worstMs).toBeLessThan(2000);
    expect(report.performance?.catalog).toBe(EXPECTED_TOTAL);
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.global_stress_qa_required_now).toBe(false);
    const jsonSize = fs.statSync(centersPath).size / 1024 / 1024;
    expect(jsonSize).toBeLessThan(4.5);
  });
});
