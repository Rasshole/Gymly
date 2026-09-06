/**
 * Slovenia production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSloveniaCoordinate,
  SLOVENIA_POSTAL_RE,
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
import type {MapCenter} from '../src/data/mapCentersData';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN =
  /\b(croatia|hrvatska|zagreb|austria|österreich|wien|vienna|hungary|budapest|italy|italia|trieste)\b/i;

const EXPECTED_TOTAL = 11448; // Slovenia merge-time catalog (report artifact)
const CURRENT_CATALOG_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_SLOVENIA = 32;
const POST_MERGE_SHA =
  'a1e097699ab64dfbda37826dccbaa4ebe219c2f0dc47cfd2f96b4c38f47b5a37'; // SI merge report artifact
const CURRENT_CATALOG_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc'; // live after Estonia merge

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Shape House': 18,
  BODIFIT: 8,
  FITINN: 6,
};

const EXCLUDED_BRAND_RE =
  /^(clever fit|4p fitness|fit13|alfa gym|šus eurofitness|sus eurofitness|gib gym|herkul|multisport|fitgang|anytime|mcfit|gold'?s gym|world class|fitness first|john reed|millennium|konex|cube fitness|mega center|sparta)/i;

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Slovenia',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe('Slovenia merge safety', () => {
  const slovenia = ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia');
  const reportPath = path.join(__dirname, '../data/slovenia/SLOVENIA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/slovenia/SLOVENIA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/slovenia/slovenia_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/slovenia/SLOVENIA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/slovenia/SLOVENIA_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/slovenia/SLOVENIA_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; slovenia: number};
    pre_merge_sha256?: string;
    post_merge_sha256?: string;
    staging_reconciliation?: {
      metadata_drift: string;
      MERGED_INTO_CATALOG: number;
      NEEDS_COORDINATES: number;
      NEEDS_REVIEW: number;
      COMING_SOON: number;
      EXCLUDED: number;
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
    shape_house?: Record<string, boolean | number>;
    bodifit?: {live: number};
    fitinn?: {live: number};
    exclusions?: Record<string, boolean>;
    border_safety?: Record<string, number>;
    check_in?: {CHECK_IN_RADIUS_METERS: number; AUTO_CHECKOUT_DISTANCE_METERS: number};
    brand_breakdown?: Record<string, number>;
    performance?: Record<string, number | string>;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
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
  }>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
    final_catalog: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    included: Array<{id: string}>;
    counts?: Record<string, number>;
  };

  test('total catalog = 11692 live; Slovenia = 32; post-merge SHA', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_CATALOG_TOTAL);
    expect(slovenia.length).toBe(EXPECTED_SLOVENIA);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.slovenia).toBe(EXPECTED_SLOVENIA);
    expect(report.inserted).toBe(EXPECTED_SLOVENIA);
    expect(phase2Ready.length).toBe(EXPECTED_SLOVENIA);
    expect(approved.length).toBe(EXPECTED_SLOVENIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_SLOVENIA,
    );
    expect(dup.included.length).toBe(EXPECTED_SLOVENIA);
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(CURRENT_CATALOG_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
  });

  test('exact ID reconciliation across ready/approved/merged/production', () => {
    const prodIds = new Set(slovenia.map(c => c.id));
    const readyIds = new Set(phase2Ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('32 == 32 == 32');
  });

  test('previous country counts unchanged; SI added', () => {
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

  test('all Slovenia IDs are unique si_* with valid NNNN and SI coords', () => {
    const ids = new Set<string>();
    for (const c of slovenia) {
      expect(c.id).toMatch(/^si_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Slovenia');
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(SLOVENIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
      expect(isPlausibleSloveniaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
    }
    expect(ids.size).toBe(slovenia.length);
  });

  test('exact brand counts', () => {
    const byBrand: Record<string, number> = {};
    for (const c of slovenia) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('Shape House rebrand: current identity; no clever fit live', () => {
    expect(slovenia.filter(c => c.brand === 'Shape House').length).toBe(18);
    expect(slovenia.some(c => /^clever fit$/i.test(c.brand))).toBe(false);
    expect(report.shape_house?.clever_fit_live).toBe(0);
    expect(report.exclusions?.clever_fit_absent).toBe(true);

    const tiskarna = slovenia.find(c => /tiskarna/i.test(c.name));
    expect(tiskarna).toBeTruthy();
    expect(tiskarna!.address).toMatch(/Dunajska cesta 123/i);
    expect(tiskarna!.brand).toBe('Shape House');

    const loberia = slovenia.find(c => /loberia/i.test(c.name));
    expect(loberia).toBeTruthy();
    expect(loberia!.address).toMatch(/522/);
    expect(loberia!.address).not.toMatch(/520(?!\d)/);

    const koper = slovenia.filter(c => c.city === 'Koper');
    expect(koper.length).toBe(2);
    expect(koper.some(c => /istrska/i.test(c.address))).toBe(true);
    expect(koper.some(c => /ankaranska/i.test(c.address))).toBe(true);
    expect(koper[0].id).not.toBe(koper[1].id);

    const nm1 = slovenia.find(c => c.name === 'Shape House Novo mesto');
    const nm2 = slovenia.find(c => /novo mesto 2/i.test(c.name));
    expect(nm1).toBeTruthy();
    expect(nm2).toBeTruthy();
    expect(nm1!.id).not.toBe(nm2!.id);
  });

  test('BODIFIT = 8; FITINN = 6; Maribox current identity', () => {
    expect(slovenia.filter(c => c.brand === 'BODIFIT').length).toBe(8);
    expect(slovenia.filter(c => c.brand === 'FITINN').length).toBe(6);
    expect(report.bodifit?.live).toBe(8);
    expect(report.fitinn?.live).toBe(6);
    const maribox = slovenia.find(c => /maribox/i.test(c.name));
    expect(maribox).toBeTruthy();
    expect(maribox!.brand).toBe('FITINN');
    expect(/kolosej/i.test(maribox!.name)).toBe(false);
  });

  test('excluded operators absent from production', () => {
    for (const c of slovenia) {
      expect(EXCLUDED_BRAND_RE.test(c.brand)).toBe(false);
    }
    const excluded = staging.filter(s =>
      ['EXCLUDED', 'COMING_SOON', 'NEEDS_REVIEW', 'NEEDS_COORDINATES'].includes(
        s.import_category,
      ),
    );
    const prodIds = new Set(slovenia.map(c => c.id));
    for (const r of excluded) {
      expect(prodIds.has(r.id)).toBe(false);
    }
    expect(staging.filter(s => s.import_category === 'EXCLUDED').length).toBe(3);
    expect(staging.filter(s => s.import_category === 'COMING_SOON').length).toBe(0);
    expect(report.exclusions?.excluded_brands_absent).toBe(true);
    expect(report.exclusions?.sus_absent).toBe(true);
  });

  test('duplicate / proximity: zero suspicious pairs', () => {
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.post_merge?.different_brand_colocations).toBe(0);

    const ids = new Set<string>();
    for (const c of slovenia) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  test('border safety: zero foreign contamination', () => {
    expect(report.border_safety?.foreign_coords).toBe(0);
    expect(report.border_safety?.italy_text).toBe(0);
    expect(report.border_safety?.austria_text).toBe(0);
    expect(report.border_safety?.hungary_text).toBe(0);
    expect(report.border_safety?.croatia_text).toBe(0);
    for (const c of slovenia) {
      expect(isPlausibleSloveniaCoordinate(c.lat!, c.lng!)).toBe(true);
    }
  });

  test('check-in / auto-checkout remain 200 m; importer idempotent', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(idem.pass).toBe(true);
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL); // SI merge-time artifact
  });

  test('search smoke: Slovenia cities and brands return si_*', () => {
    const siGyms = slovenia.map(toGym);
    const queries = [
      'Slovenia',
      'Shape House',
      'BODIFIT',
      'FITINN',
      'Ljubljana',
      'Maribor',
      'Celje',
      'Kranj',
      'Koper',
      'Novo mesto',
      'Murska Sobota',
      'Domžale',
      'Jesenice',
    ];
    for (const q of queries) {
      const hits = searchGyms(q, {gyms: siGyms, limit: 40});
      const siHits = hits.filter(h => h.gym.id.startsWith('si_'));
      expect(siHits.length).toBeGreaterThan(0);
    }
    expect(normalizeGymSearchValue('Domžale')).toBe('domzale');
    expect(normalizeGymSearchValue('Škofja')).toBe('skofja');
    const entry = buildGymSearchEntry(toGym(slovenia[0]));
    expect(entry.haystack).toMatch(/slovenia|slovenija/i);
  });

  test('nearest + map viewport smoke on Ljubljana', () => {
    const siGyms = slovenia.map(toGym);
    const nearest = findNearestGym(46.0569, 14.5058, siGyms);
    expect(nearest?.country).toBe('Slovenia');
    expect(nearest?.id.startsWith('si_')).toBe(true);

    const mapCenters: MapCenter[] = slovenia.map(c => {
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
      latitude: 46.0569,
      longitude: 14.5058,
      latitudeDelta: 0.35,
      longitudeDelta: 0.35,
    });
    expect(visible.length).toBeGreaterThan(0);
  });

  test('performance snapshot on 11542 catalog is healthy', () => {
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
    searchGyms('Ljubljana', {gyms, limit: 20});
    const typicalMs = Date.now() - t3;
    const t4 = Date.now();
    searchGyms('zzzz-nonexistent-query-xyz', {gyms, limit: 20});
    const worstMs = Date.now() - t4;
    const nearest = findNearestGym(46.0569, 14.5058, slovenia.map(toGym));
    expect(nearest).toBeTruthy();
    expect(gyms.length).toBeGreaterThanOrEqual(CURRENT_CATALOG_TOTAL - 50);
    expect(index.length).toBeGreaterThan(0);
    expect(activeMs).toBeLessThan(5000);
    expect(coldMs).toBeLessThan(25000);
    expect(cachedMs).toBeLessThan(100);
    expect(typicalMs).toBeLessThan(2000);
    expect(worstMs).toBeLessThan(2000);
    expect(report.performance?.catalog).toBe(EXPECTED_TOTAL); // SI merge-time artifact
    const jsonSize = fs.statSync(centersPath).size / 1024 / 1024;
    expect(jsonSize).toBeLessThan(4);
  });
});
