/**
 * Bulgaria production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBulgariaCoordinate,
  BULGARIA_POSTAL_RE,
  isBulgariaCountry,
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
  /\b(romania|serbia|macedonia|skopje|greece|turkey|istanbul|strumica|atlantis)\b/i;

const EXPECTED_TOTAL = 11336; // catalog immediately after Bulgaria merge (historical report)
const LIVE_CATALOG_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_BULGARIA = 82;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Next Level Fitness': 29,
  'Pulse Fitness': 19,
  'Flais Fitness': 14,
  'Athletic Fitness': 9,
  'Titanium Fitness': 6,
  'Hammer Gym': 5,
};

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Bulgaria',
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

describe('Bulgaria merge safety', () => {
  const bulgaria = ALL_GYM_CENTERS.filter(c => c.country === 'Bulgaria');
  const reportPath = path.join(__dirname, '../data/bulgaria/BULGARIA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/bulgaria/bulgaria_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE3_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_MERGE_DUPLICATE_ANALYSIS.json',
  );

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; bulgaria: number};
    staging_reconciliation?: {
      metadata_drift: string;
      MERGED_INTO_CATALOG: number;
      NEEDS_COORDINATES: number;
      NEEDS_REVIEW: number;
      COMING_SOON: number;
      EXCLUDED: number;
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
    pulse_validation?: {
      open_current_merged: number;
      pulse_platinum_present: boolean;
      west_park_lyulin_distance_m: number;
      hotel_foreign_merged: number;
      coming_soon_merged: number;
    };
    exclusions?: Record<string, boolean>;
    check_in?: {CHECK_IN_RADIUS_METERS: number; AUTO_CHECKOUT_DISTANCE_METERS: number};
    brand_breakdown?: Record<string, number>;
    performance?: Record<string, number | string>;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    name?: string;
    brand?: string;
  }>;
  const phase3Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{
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
  };

  test('total catalog = 11692 live; Bulgaria = 82', () => {
    expect(ALL_GYM_CENTERS.length).toBe(LIVE_CATALOG_TOTAL);
    expect(bulgaria.length).toBe(EXPECTED_BULGARIA);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.bulgaria).toBe(EXPECTED_BULGARIA);
    expect(report.inserted).toBe(EXPECTED_BULGARIA);
    expect(phase3Ready.length).toBe(EXPECTED_BULGARIA);
    expect(approved.length).toBe(EXPECTED_BULGARIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_BULGARIA,
    );
    expect(dup.included.length).toBe(EXPECTED_BULGARIA);
  });

  test('exact ID reconciliation across ready/approved/merged/production', () => {
    const prodIds = new Set(bulgaria.map(c => c.id));
    const readyIds = new Set(phase3Ready.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
  });

  test('previous country counts unchanged; BG added', () => {
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
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(LIVE_CATALOG_TOTAL);
  });

  test('all Bulgaria IDs are unique bg_* with valid NNNN and BG coords', () => {
    const ids = new Set<string>();
    for (const c of bulgaria) {
      expect(c.id).toMatch(/^bg_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Bulgaria');
      expect(isBulgariaCountry(c.country)).toBe(true);
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(BULGARIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(String(c.address || '').trim().length).toBeGreaterThan(7);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
      expect(isPlausibleBulgariaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
    }
    expect(ids.size).toBe(bulgaria.length);
  });

  test('exact brand counts', () => {
    const byBrand: Record<string, number> = {};
    for (const c of bulgaria) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('Pulse identity, exclusions, and West Park / Lyulin separation', () => {
    expect(bulgaria.some(c => c.name === 'Pulse Platinum' && c.brand === 'Pulse Fitness')).toBe(
      true,
    );
    expect(bulgaria.some(c => /platinum\s*health\s*club/i.test(c.name))).toBe(false);
    expect(bulgaria.some(c => c.name === 'Hammer Gym Platinum')).toBe(true);
    expect(bulgaria.filter(c => c.brand === 'Pulse Fitness').length).toBe(19);
    expect(bulgaria.some(c => /atlantis|therme|royal\s*hotel/i.test(c.name))).toBe(false);
    expect(bulgaria.some(c => c.name === 'Pulse Ovcha Kupel' || c.name === 'Pulse Drujba')).toBe(
      false,
    );
    const wp = bulgaria.find(c => c.name === 'Pulse West Park')!;
    const ly = bulgaria.find(c => c.name === 'Pulse Lyulin')!;
    expect(wp).toBeTruthy();
    expect(ly).toBeTruthy();
    expect(haversineM(wp.lat!, wp.lng!, ly.lat!, ly.lng!)).toBeGreaterThan(200);
    expect(report.pulse_validation?.hotel_foreign_merged).toBe(0);
    expect(report.pulse_validation?.coming_soon_merged).toBe(0);
  });

  test('Titanium Mladost/Studentski corrections; Athletic NK absent', () => {
    const sg = bulgaria.find(c => /studentski/i.test(c.name))!;
    const m3 = bulgaria.find(c => /mladost\s*3/i.test(c.name))!;
    expect(sg.address).toMatch(/симеоновско|simeonovsko/i);
    expect(m3.address).toMatch(/386|блок|blok/i);
    expect(bulgaria.some(c => /nikolai\s*kopernik/i.test(c.name))).toBe(false);
  });

  test('staging exclusions remain outside production', () => {
    const excluded = staging.filter(s =>
      ['EXCLUDED', 'COMING_SOON', 'NEEDS_REVIEW', 'NEEDS_COORDINATES'].includes(
        s.import_category,
      ),
    );
    const prodIds = new Set(bulgaria.map(c => c.id));
    for (const r of excluded) {
      expect(prodIds.has(r.id)).toBe(false);
    }
    expect(staging.filter(s => s.import_category === 'NEEDS_REVIEW').length).toBe(1);
    expect(staging.filter(s => s.import_category === 'COMING_SOON').length).toBe(2);
    expect(staging.filter(s => s.import_category === 'EXCLUDED').length).toBe(20);
  });

  test('duplicate / proximity hard defects are zero', () => {
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    for (let i = 0; i < bulgaria.length; i++) {
      for (let j = i + 1; j < bulgaria.length; j++) {
        const a = bulgaria[i];
        const b = bulgaria[j];
        if (a.brand !== b.brand) continue;
        expect(haversineM(a.lat!, a.lng!, b.lat!, b.lng!)).toBeGreaterThanOrEqual(50);
      }
    }
  });

  test('check-in / auto-checkout remain 200 m; importer idempotent', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(idem.pass).toBe(true);
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL);
  });

  test('search smoke: Bulgaria cities and brands return bg_*', () => {
    const gyms = getActiveGyms();
    const queries = [
      'Bulgaria',
      'Sofia',
      'София',
      'Plovdiv',
      'Пловдив',
      'Varna',
      'Варна',
      'Burgas',
      'Бургас',
      'Next Level Fitness',
      'Pulse Fitness',
      'Flais Fitness',
      'Athletic Fitness',
      'Titanium Fitness',
      'Hammer Gym',
    ];
    for (const q of queries) {
      const hits = searchGyms(q, {gyms, limit: 40});
      const bgHits = hits.filter(h => h.gym.id.startsWith('bg_'));
      expect(bgHits.length).toBeGreaterThan(0);
    }
    expect(normalizeGymSearchValue('София')).toMatch(/sofia|софия/i);
    const entry = buildGymSearchEntry(toGym(bulgaria[0]));
    expect(entry.haystack).toMatch(/bulgaria|българия|bulgariya/i);
  });

  test('nearest + map viewport smoke on Sofia', () => {
    const bgGyms = bulgaria.map(toGym);
    const nearest = findNearestGym(42.6977, 23.3219, bgGyms);
    expect(nearest?.country).toBe('Bulgaria');
    expect(nearest?.id.startsWith('bg_')).toBe(true);

    const mapCenters: MapCenter[] = bulgaria.map(c => {
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
      latitude: 42.6977,
      longitude: 23.3219,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
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
    searchGyms('Sofia', {gyms, limit: 20});
    const typicalMs = Date.now() - t3;
    const t4 = Date.now();
    searchGyms('zzzz-nonexistent-query-xyz', {gyms, limit: 20});
    const worstMs = Date.now() - t4;
    expect(gyms.length).toBeGreaterThanOrEqual(LIVE_CATALOG_TOTAL - 50);
    expect(index.length).toBeGreaterThan(0);
    expect(activeMs).toBeLessThan(5000);
    expect(coldMs).toBeLessThan(25000);
    expect(cachedMs).toBeLessThan(100);
    expect(typicalMs).toBeLessThan(2000);
    expect(worstMs).toBeLessThan(2000);
    expect(report.performance?.catalog).toBe(EXPECTED_TOTAL);
  });
});
