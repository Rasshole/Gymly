/**
 * Croatia production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleCroatiaCoordinate,
  CROATIA_POSTAL_RE,
  isCroatiaCountry,
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
  /\b(slovenia|ljubljana|hungary|budapest|serbia|beograd|bosnia|sarajevo|montenegro|podgorica)\b/i;

const EXPECTED_TOTAL = 11416; // Croatia merge-time catalog (report artifact)
const CURRENT_CATALOG_TOTAL = 11921; // live catalog after Balkan expansions
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const EXPECTED_CROATIA = 80;
const POST_MERGE_SHA =
  '19f288efaebbcb3e133ecfbc5ec52e1b36925d750649dd7f922f3c6f47b864c9';

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  Gyms4you: 48,
  'THE Fitness': 21,
  'Gibi Gib': 4,
  'Fitness Centar Joker': 4,
  Multihealth: 3,
};

const COMING_SOON_NAME_RE =
  /split\s*visoka|trstenik|split\s*3|juri[sš]i[cć]eva|spinut|heinzelova\s*x\s*vukovarska|samobor\s*stop\s*shop|donje\s*svetice/i;

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Croatia',
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

describe('Croatia merge safety', () => {
  const croatia = ALL_GYM_CENTERS.filter(c => c.country === 'Croatia');
  const reportPath = path.join(__dirname, '../data/croatia/CROATIA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/croatia/CROATIA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/croatia/croatia_centers_staging.json',
  );
  const keepPath = path.join(
    __dirname,
    '../data/croatia/CROATIA_PHASE2_KEEP_EXISTING.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/croatia/CROATIA_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/croatia/CROATIA_MERGE_DUPLICATE_ANALYSIS.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; croatia: number};
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
    exclusions?: Record<string, boolean | number>;
    rebrand_access?: Record<string, boolean | string>;
    border_safety?: Record<string, number>;
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
  const keepExisting = JSON.parse(fs.readFileSync(keepPath, 'utf8')) as Array<{
    id: string;
    name: string;
    brand: string;
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

  test('total catalog = 11921 live; Croatia = 80; merge report + live SHA', () => {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_CATALOG_TOTAL);
    expect(croatia.length).toBe(EXPECTED_CROATIA);
    expect(sha).toBe(LIVE_SHA);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.croatia).toBe(EXPECTED_CROATIA);
    expect(report.inserted).toBe(EXPECTED_CROATIA);
    expect(keepExisting.length).toBe(EXPECTED_CROATIA);
    expect(approved.length).toBe(EXPECTED_CROATIA);
    expect(staging.filter(s => s.import_category === 'KEEP_EXISTING').length).toBe(
      EXPECTED_CROATIA,
    );
    expect(dup.included.length).toBe(EXPECTED_CROATIA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
  });

  test('exact ID reconciliation across keep/approved/merged/production', () => {
    const prodIds = new Set(croatia.map(c => c.id));
    const keepIds = new Set(keepExisting.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const mergedIds = new Set(
      staging.filter(s => s.import_category === 'KEEP_EXISTING').map(s => s.id),
    );
    expect(prodIds).toEqual(keepIds);
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(mergedIds);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
    expect(report.staging_reconciliation?.reconciliation).toBe('80 == 80 == 80');
  });

  test('previous country counts unchanged; HR added', () => {
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
    expect(counts['Serbia']).toBe(63);
    expect(counts['Kosovo']).toBe(18);
    expect(counts['Albania']).toBe(9);
    expect(counts['Bosnia and Herzegovina']).toBe(31);
    expect(counts['North Macedonia']).toBe(25);
    expect(counts['Montenegro']).toBe(26);
    expect(counts['Moldova']).toBe(28);
    expect(counts['San Marino']).toBe(6);
    expect(counts['Monaco']).toBe(4);
    expect(counts['Andorra']).toBe(12);
    expect(counts['Liechtenstein']).toBe(7);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(CURRENT_CATALOG_TOTAL);
  });

  test('all Croatia IDs are unique hr_* with valid NNNNN and HR coords', () => {
    const ids = new Set<string>();
    for (const c of croatia) {
      expect(c.id).toMatch(/^hr_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Croatia');
      expect(isCroatiaCountry(c.country)).toBe(true);
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(CROATIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(String(c.address || '').trim().length).toBeGreaterThan(5);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
      expect(isPlausibleCroatiaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
      expect(COMING_SOON_NAME_RE.test(c.name)).toBe(false);
    }
    expect(ids.size).toBe(croatia.length);
  });

  test('exact brand counts', () => {
    const byBrand: Record<string, number> = {};
    for (const c of croatia) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRAND_BREAKDOWN);
    expect(report.brand_breakdown).toEqual(EXPECTED_BRAND_BREAKDOWN);
  });

  test('rebrand / access: THE Fitness successors; no OrlandoFit/Play/World Class', () => {
    expect(croatia.some(c => /orlandofit/i.test(c.brand))).toBe(false);
    expect(croatia.some(c => /^Play Fitness$/i.test(c.brand))).toBe(false);
    expect(croatia.some(c => /world\s*class/i.test(`${c.brand} ${c.name}`))).toBe(false);
    expect(croatia.some(c => /kaptol/i.test(c.name) && c.brand === 'THE Fitness')).toBe(true);
    expect(croatia.some(c => /green gold/i.test(c.name) && c.brand === 'THE Fitness')).toBe(true);
    expect(croatia.some(c => /branimir/i.test(c.name) && c.brand === 'THE Fitness')).toBe(true);
    expect(
      croatia.some(c => /črnomerec|crnomerec/i.test(c.name) && c.brand === 'THE Fitness'),
    ).toBe(true);
    expect(croatia.some(c => /hotel novi/i.test(c.name))).toBe(true);
    expect(croatia.some(c => /zonar/i.test(c.name))).toBe(true);
    expect(croatia.some(c => /jelkovec/i.test(c.name))).toBe(true);
    expect(report.exclusions?.orlandofit_live).toBe(0);
    expect(report.exclusions?.play_fitness_live).toBe(0);
    expect(report.exclusions?.world_class_hotel_live).toBe(0);
    expect(report.exclusions?.coming_soon_names_absent).toBe(true);
  });

  test('staging exclusions remain outside production', () => {
    const excluded = staging.filter(s =>
      ['EXCLUDED', 'COMING_SOON', 'NEEDS_REVIEW', 'NEEDS_COORDINATES'].includes(
        s.import_category,
      ),
    );
    const prodIds = new Set(croatia.map(c => c.id));
    for (const r of excluded) {
      expect(prodIds.has(r.id)).toBe(false);
    }
    expect(staging.filter(s => s.import_category === 'COMING_SOON').length).toBe(8);
    expect(staging.filter(s => s.import_category === 'EXCLUDED').length).toBe(37);
    expect(staging.filter(s => s.import_category === 'NEEDS_REVIEW').length).toBe(0);
  });

  test('duplicate / proximity: known A_legitimate pairs only', () => {
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(1);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.post_merge?.different_brand_colocations).toBe(1);

    const zav = croatia.find(c => /zavrtnica/i.test(c.name))!;
    const bra = croatia.find(c => /branimir/i.test(c.name))!;
    expect(zav).toBeTruthy();
    expect(bra).toBeTruthy();
    const dSame = haversineM(zav.lat!, zav.lng!, bra.lat!, bra.lng!);
    expect(dSame).toBeGreaterThan(100);
    expect(dSame).toBeLessThanOrEqual(200);

    const dubec = croatia.find(c => /dubec/i.test(c.name) && c.brand === 'Gyms4you')!;
    const dubrava = croatia.find(c => /dubrava/i.test(c.name) && c.brand === 'THE Fitness')!;
    expect(dubec).toBeTruthy();
    expect(dubrava).toBeTruthy();
    expect(haversineM(dubec.lat!, dubec.lng!, dubrava.lat!, dubrava.lng!)).toBeLessThanOrEqual(
      100,
    );
  });

  test('border safety: zero foreign contamination', () => {
    expect(report.border_safety?.foreign_coords).toBe(0);
    expect(report.border_safety?.slovenia).toBe(0);
    expect(report.border_safety?.hungary).toBe(0);
    expect(report.border_safety?.serbia).toBe(0);
    expect(report.border_safety?.bosnia).toBe(0);
    expect(report.border_safety?.montenegro).toBe(0);
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

  test('search smoke: Croatia cities and brands return hr_*', () => {
    const gyms = getActiveGyms();
    const queries = [
      'Croatia',
      'Zagreb',
      'Split',
      'Rijeka',
      'Osijek',
      'Varaždin',
      'Dubrovnik',
      'Gyms4you',
      'THE Fitness',
      'Gibi Gib',
      'Fitness Centar Joker',
      'Multihealth',
    ];
    for (const q of queries) {
      const hits = searchGyms(q, {gyms, limit: 40});
      const hrHits = hits.filter(h => h.gym.id.startsWith('hr_'));
      expect(hrHits.length).toBeGreaterThan(0);
    }
    expect(normalizeGymSearchValue('Varaždin')).toBe('varazdin');
    expect(normalizeGymSearchValue('Šibenik')).toBe('sibenik');
    const entry = buildGymSearchEntry(toGym(croatia[0]));
    expect(entry.haystack).toMatch(/croatia|hrvatska/i);
  });

  test('nearest + map viewport smoke on Zagreb', () => {
    const hrGyms = croatia.map(toGym);
    const nearest = findNearestGym(45.815, 15.982, hrGyms);
    expect(nearest?.country).toBe('Croatia');
    expect(nearest?.id.startsWith('hr_')).toBe(true);

    const mapCenters: MapCenter[] = croatia.map(c => {
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
      latitude: 45.815,
      longitude: 15.982,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    });
    expect(visible.length).toBeGreaterThan(0);
  });

  test('performance snapshot on 11416 catalog is healthy', () => {
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
    searchGyms('Zagreb', {gyms, limit: 20});
    const typicalMs = Date.now() - t3;
    const t4 = Date.now();
    searchGyms('zzzz-nonexistent-query-xyz', {gyms, limit: 20});
    const worstMs = Date.now() - t4;
    const nearest = findNearestGym(45.815, 15.982, croatia.map(toGym));
    expect(nearest).toBeTruthy();
    expect(gyms.length).toBeGreaterThanOrEqual(EXPECTED_TOTAL - 50);
    expect(index.length).toBeGreaterThan(0);
    expect(activeMs).toBeLessThan(5000);
    expect(coldMs).toBeLessThan(25000);
    expect(cachedMs).toBeLessThan(100);
    expect(typicalMs).toBeLessThan(2000);
    expect(worstMs).toBeLessThan(2000);
    expect(report.performance?.catalog).toBe(EXPECTED_TOTAL);
  });
});
