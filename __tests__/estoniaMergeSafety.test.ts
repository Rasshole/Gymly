/**
 * Estonia production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleEstoniaCoordinate,
  ESTONIA_POSTAL_RE,
  isEstoniaCountry,
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
  /\b(latvia|latvija|riga|lithuania|lietuva|vilnius|finland|helsinki|kaliningrad|belarus|poland|polska)\b/i;

const EXPECTED_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_ESTONIA = 68;
const ESTONIA_MERGE_AFTER_TOTAL = 11610; // frozen in ESTONIA_MERGE_REPORT
const PRE_MERGE_SHA =
  '287c1c54ef1023fee08d23c9a65063ffc238edbd35c59b22cea09c146833d8ea';
const POST_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  MyFitness: 19,
  '24-7 Fitness': 31,
  'Gym!': 15,
  'Golden Club': 3,
};

const EXCLUDED_BRAND_RE =
  /^(people fitness|lemon gym|reval-?sport|sparta|fitlife|hc gym|audentes|ring sport|status club|terra sport|aktiiv|corsagym|idakeskus|gym\+|impuls|basic-?fit|mcfit|anytime( fitness)?|fitinn|clever fit|john reed|gold'?s gym|fitness first|world class|bodifit|shape house)$/i;

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Estonia',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Estonia merge safety', () => {
  const estonia = ALL_GYM_CENTERS.filter(c => c.country === 'Estonia');
  const reportPath = path.join(__dirname, '../data/estonia/ESTONIA_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/estonia/ESTONIA_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/estonia/estonia_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/estonia/ESTONIA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(__dirname, '../data/estonia/ESTONIA_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(
    __dirname,
    '../data/estonia/ESTONIA_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; estonia: number};
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
    myfitness?: Record<string, boolean | number>;
    fitness_247?: Record<string, boolean | number>;
    gym_bang?: Record<string, boolean | number>;
    golden_club?: Record<string, boolean | number>;
    lemon_gym?: Record<string, boolean | number>;
    rebrand?: Record<string, boolean | number>;
    exclusions?: Record<string, boolean | number>;
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
    estonia: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    included: Array<{id: string}>;
  };

  test('total catalog = 11692; Estonia = 68; post-merge SHA', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(estonia.length).toBe(EXPECTED_ESTONIA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ee_')).length).toBe(EXPECTED_ESTONIA);
    expect(report.after.total).toBe(ESTONIA_MERGE_AFTER_TOTAL);
    expect(report.after.estonia).toBe(EXPECTED_ESTONIA);
    expect(report.inserted).toBe(EXPECTED_ESTONIA);
    expect(phase2Ready.length).toBe(EXPECTED_ESTONIA);
    expect(approved.length).toBe(EXPECTED_ESTONIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_ESTONIA,
    );
    expect(dup.included.length).toBe(EXPECTED_ESTONIA);
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.verdict).toBe('ESTONIA MERGE COMPLETE — WAITING FOR QA');
  });

  test('exact ID reconciliation across ready/approved/merged/production', () => {
    const prodIds = new Set(estonia.map(c => c.id));
    const readyIds = new Set(phase2Ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('68 == 68 == 68 == 68');
    expect(report.staging_reconciliation?.missing_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.unexpected_production_ids).toEqual([]);
  });

  test('approved metadata matches production rows', () => {
    const byId = new Map(estonia.map(c => [c.id, c]));
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
      expect(p!.country).toBe('Estonia');
      expect(p!.is_active).toBe(true);
      expect(p!.is_coming_soon).not.toBe(true);
    }
  });

  test('previous country counts unchanged; EE added', () => {
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
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(EXPECTED_TOTAL);
  });

  test('all Estonia IDs are unique ee_* with valid NNNNN and EE coords', () => {
    const ids = new Set<string>();
    for (const c of estonia) {
      expect(c.id).toMatch(/^ee_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Estonia');
      expect(isEstoniaCountry(c.country)).toBe(true);
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(ESTONIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
      expect(isPlausibleEstoniaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
      expect(EXCLUDED_BRAND_RE.test(String(c.brand || '').trim())).toBe(false);
      expect(String(c.id).startsWith('lv_')).toBe(false);
      expect(String(c.id).startsWith('lt_')).toBe(false);
    }
    expect(ids.size).toBe(estonia.length);
  });

  test('exact brand counts 19 / 31 / 15 / 3', () => {
    const byBrand: Record<string, number> = {};
    for (const c of estonia) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('MyFitness = 19 including Volta + Narva Fama; EE/LV separation', () => {
    expect(estonia.filter(c => c.brand === 'MyFitness').length).toBe(19);
    expect(estonia.some(c => /volta/i.test(c.name))).toBe(true);
    expect(estonia.some(c => /narva fama/i.test(c.name))).toBe(true);
    expect(report.myfitness?.live).toBe(19);
    expect(report.myfitness?.volta_present).toBe(true);
    expect(report.myfitness?.narva_fama_present).toBe(true);
    expect(report.rebrand?.no_lv_id_reuse).toBe(true);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia' && c.brand === 'MyFitness').length).toBe(
      15,
    );
  });

  test('24-7 Fitness = 31 recovered open clubs; CS absent', () => {
    expect(estonia.filter(c => c.brand === '24-7 Fitness').length).toBe(31);
    for (const needle of [
      'Tabasalu',
      'Keila Keskus',
      'Sepa',
      'Viljandi Kaalu',
      'Rakvere',
      'Võru',
      'Jõgeva',
    ]) {
      expect(
        estonia.filter(c => c.brand === '24-7 Fitness' && c.name.includes(needle)).length,
      ).toBe(1);
    }
    expect(
      estonia.filter(
        c => c.brand === '24-7 Fitness' && /\bnarva\b/i.test(c.name) && !/fama/i.test(c.name),
      ).length,
    ).toBe(1);
    expect(report.fitness_247?.live).toBe(31);
    expect(report.fitness_247?.recovered_present).toBe(true);
    expect(report.fitness_247?.coming_soon_absent).toBe(true);
  });

  test('Gym! = 15; not Gym+; CS Viimsi/Rakvere absent', () => {
    expect(estonia.filter(c => c.brand === 'Gym!').length).toBe(15);
    expect(estonia.some(c => c.brand === 'Gym+')).toBe(false);
    expect(report.gym_bang?.live).toBe(15);
    expect(report.gym_bang?.gym_plus_absent).toBe(true);
    expect(report.gym_bang?.coming_soon_absent).toBe(true);
    expect(report.rebrand?.gym_bang_distinct_from_gym_plus).toBe(true);
  });

  test('Golden Club = 3 including Tondi; Lemon Gym = 0', () => {
    expect(estonia.filter(c => c.brand === 'Golden Club').length).toBe(3);
    expect(estonia.some(c => /tondi/i.test(c.name))).toBe(true);
    expect(estonia.filter(c => c.brand === 'Lemon Gym').length).toBe(0);
    expect(report.golden_club?.live).toBe(3);
    expect(report.golden_club?.tondi_present).toBe(true);
    expect(report.lemon_gym?.live).toBe(0);
  });

  test('COMING_SOON and EXCLUDED staging IDs absent from production', () => {
    const prodIds = new Set(estonia.map(c => c.id));
    const blocked = staging.filter(s =>
      ['EXCLUDED', 'COMING_SOON', 'NEEDS_REVIEW', 'NEEDS_COORDINATES', 'DUPLICATE'].includes(
        s.import_category,
      ),
    );
    for (const r of blocked) {
      expect(prodIds.has(r.id)).toBe(false);
    }
    expect(staging.filter(s => s.import_category === 'COMING_SOON').length).toBe(11);
    expect(staging.filter(s => s.import_category === 'EXCLUDED').length).toBe(20);
    expect(staging.filter(s => s.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(s => s.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(staging.filter(s => s.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(report.exclusions?.coming_soon_ids_absent).toBe(true);
    expect(report.exclusions?.excluded_ids_absent).toBe(true);
    expect(report.exclusions?.coming_soon_count).toBe(11);
  });

  test('duplicate / proximity: Viru↔Postimaja ≤200m A_legitimate only', () => {
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(1);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.post_merge?.different_brand_colocations).toBe(0);
  });

  test('border safety: zero foreign contamination', () => {
    expect(report.border_safety?.foreign_coords).toBe(0);
    expect(report.border_safety?.latvia_text).toBe(0);
    expect(report.border_safety?.lithuania_text).toBe(0);
    expect(report.border_safety?.finland_text).toBe(0);
    expect(report.border_safety?.russia_text).toBe(0);
    expect(report.border_safety?.lv_prefix_reuse).toBe(0);
    expect(report.border_safety?.lt_prefix_reuse).toBe(0);
    for (const c of estonia) {
      expect(isPlausibleEstoniaCoordinate(c.lat!, c.lng!)).toBe(true);
    }
  });

  test('check-in / auto-checkout remain 200 m; importer idempotent', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(idem.pass).toBe(true);
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(ESTONIA_MERGE_AFTER_TOTAL);
    expect(idem.estonia).toBe(EXPECTED_ESTONIA);
  });

  test('search / country infrastructure works for Estonia', () => {
    expect(gymCountryTranslationKey('Estonia')).toBe('countries.estonia');
    expect(resolveGymOrStub('ee_nonexistent_merge_probe').region).toBe('Estonia');
    const eeGyms = estonia.map(toGym);
    const queries = [
      'Estonia',
      'MyFitness',
      '24-7',
      'Gym!',
      'Golden Club',
      'Tallinn',
      'Tartu',
      'Narva',
      'Pärnu',
      'Parnu',
      'Viljandi',
      'Jõhvi',
      'Johvi',
      'Rakvere',
      'Võru',
      'Voru',
    ];
    for (const q of queries) {
      const hits = searchGyms(q, {gyms: eeGyms, limit: 40});
      const eeHits = hits.filter(h => h.gym.id.startsWith('ee_'));
      expect(eeHits.length).toBeGreaterThan(0);
    }
    const bangHits = searchGyms('Gym!', {gyms: eeGyms, limit: 40});
    expect(bangHits.every(h => h.gym.brand === 'Gym!' || h.gym.id.startsWith('ee_'))).toBe(true);
    expect(bangHits.some(h => h.gym.brand === 'Gym+')).toBe(false);
    expect(normalizeGymSearchValue('Pärnu')).toBe('parnu');
    expect(normalizeGymSearchValue('Jõhvi')).toBe('johvi');
    expect(normalizeGymSearchValue('Võru')).toBe('voru');
    const entry = buildGymSearchEntry(toGym(estonia[0]));
    expect(entry.haystack).toMatch(/estonia|eesti/i);
  });

  test('nearest + map viewport smoke on Tallinn', () => {
    const eeGyms = estonia.map(toGym);
    const nearest = findNearestGym(59.437, 24.7536, eeGyms);
    expect(nearest?.country).toBe('Estonia');
    expect(nearest?.id.startsWith('ee_')).toBe(true);

    const mapCenters: MapCenter[] = estonia.map(c => {
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
      };
    });
    const visible = filterMapCentersInRegion(mapCenters, {
      latitude: 59.437,
      longitude: 24.7536,
      latitudeDelta: 0.2,
      longitudeDelta: 0.3,
    });
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every(c => c.id.startsWith('ee_'))).toBe(true);
  });

  test('global scale under 12,500; performance snapshot healthy', () => {
    expect(report.global_scale?.crossed_12500).toBe(false);
    expect(report.global_scale?.global_stress_qa_required_now).toBe(false);
    expect(report.performance?.architecture).toBe('KEEP CLIENT-SIDE');
    expect(Number(report.performance?.catalog)).toBe(ESTONIA_MERGE_AFTER_TOTAL);
    const gyms = getActiveGyms();
    expect(gyms.length).toBeGreaterThanOrEqual(EXPECTED_TOTAL - 50);
    getGymSearchIndex();
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
  });
});
