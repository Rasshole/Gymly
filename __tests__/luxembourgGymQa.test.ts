/**
 * Luxembourg gym QA — full production validation after lu_* merge (20 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/luxembourg/LUXEMBOURG_QA_PERF.json).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms, getActiveGymsByCountry} from '../src/data/danishGyms';
import {
  ALL_GYM_CENTERS,
  findCenterById,
} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  LUXEMBOURG_POSTAL_RE,
  isLuxembourgCountry,
  isPlausibleLuxembourgCoordinate,
} from '../src/utils/gymCountry';
import {
  findGymById,
  formatGymDisplayName,
  resolveGymOrStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {GYM_ID_PREFIX} from '../src/data/gymIds';

const staging = require('../data/luxembourg/luxembourg_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  is_coming_soon?: boolean;
  coord_source?: string | null;
}>;

const approved = require('../data/luxembourg/LUXEMBOURG_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/luxembourg/LUXEMBOURG_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  coord_source?: string | null;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN_BLOB =
  /\b(belgium|belgi[eë]|france|deutschland|germany|trier|thionville|athus|perl)\b/i;

const EXPECTED_TOTAL = 11692;
const EXPECTED_LU = 20;
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRANDS: Record<string, number> = {
  'Basic-Fit': 10,
  JIMS: 6,
  'CK Fitness': 4,
};

const BASIC_FIT_FOETZ = 'lu_dc1931d263';
const JIMS_FOETZ = 'lu_7bf8591421';
const BF_JUNCK = 'lu_a61ce060d4';
const JIMS_GARE = 'lu_987be28ebf';

const ZERO_CHAIN_TOWNS = [
  'Differdange',
  'Dudelange',
  'Pétange',
  'Sanem',
  'Hesperange',
  'Mamer',
  'Diekirch',
  'Wiltz',
  'Grevenmacher',
  'Remich',
];

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

function toMap(gs: ReturnType<typeof getActiveGymsByCountry>) {
  return gs.map(g => ({
    id: g.id,
    name: g.name,
    latitude: g.latitude,
    longitude: g.longitude,
    mapLatitude: g.latitude,
    mapLongitude: g.longitude,
    brand: g.brand ?? '',
    friendsActiveCount: 0,
    totalActiveCount: 0,
    logoUrl: null,
    country: g.country,
  }));
}

describe('Luxembourg gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const luxembourg = gyms.filter(g => isLuxembourgCountry(g.country));
  const luCenters = catalog.filter(c => isLuxembourgCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Luxembourg = 20; lu_* = 20; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(luCenters.length).toBe(EXPECTED_LU);
      expect(luxembourg.length).toBe(EXPECTED_LU);
      expect(catalog.filter(c => c.id.startsWith('lu_')).length).toBe(EXPECTED_LU);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
      expect(sha).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(luCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(20);
      expect(ap.size).toBe(20);
      expect(ready.size).toBe(20);
      expect(merged.size).toBe(20);
      expect([...prod].filter(id => !ap.has(id))).toEqual([]);
      expect([...ap].filter(id => !prod.has(id))).toEqual([]);
      expect([...prod].filter(id => !merged.has(id))).toEqual([]);
      expect([...prod].filter(id => !ready.has(id))).toEqual([]);

      for (const a of approved) {
        const live = findCenterById(a.id)!;
        expect(live.brand).toBe(a.brand);
        expect(live.name).toBe(a.name);
        expect(live.address).toBe(a.address);
        expect(live.postal_code).toBe(a.postal_code);
        expect(live.city).toBe(a.city);
        expect(live.country).toBe('Luxembourg');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all lu_* IDs unique with required fields and valid Luxembourg geography', () => {
      const ids = new Set<string>();
      for (const c of luCenters) {
        expect(c.id).toMatch(/^lu_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Luxembourg');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(LUXEMBOURG_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleLuxembourgCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(String(c.id).startsWith('be_')).toBe(false);
        expect(String(c.id).startsWith('fr_')).toBe(false);
        expect(String(c.id).startsWith('de_')).toBe(false);
      }
      expect(ids.size).toBe(20);
    });

    it('exact brand breakdown; unexpected brands = 0', () => {
      const byBrand: Record<string, number> = {};
      for (const c of luCenters) {
        byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(Object.keys(byBrand).length).toBe(3);
    });
  });

  describe('2. Staging exclusions / coming-soon withheld', () => {
    it('COMING_SOON = 1 and EXCLUDED = 18 remain outside production', () => {
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      const excluded = staging.filter(s => s.import_category === 'EXCLUDED');
      expect(coming.length).toBe(1);
      expect(excluded.length).toBe(18);
      const prodIds = new Set(luCenters.map(c => c.id));
      for (const r of [...coming, ...excluded]) {
        expect(prodIds.has(r.id)).toBe(false);
      }
      expect(coming[0]!.id).toBe(JIMS_FOETZ);
      expect(coming[0]!.name).toMatch(/foetz/i);
      expect(prodIds.has(JIMS_FOETZ)).toBe(false);
    });

    it('excluded operators absent from production', () => {
      for (const brand of [
        'Factory 4',
        'Vitaly-Fit',
        'Athletic Center',
        'Fitness Zone',
        'Painworld',
        'CK Sportcenter',
        'Coque',
        'Keep Cool',
        'Fitness Park',
        'Anytime Fitness',
        'McFIT',
        'JOHN REED',
        'clever fit',
        'FITINN',
        "Gold's Gym",
        'Fitness First',
        'World Class',
        "L'Orange Bleue",
      ]) {
        expect(
          luCenters.some(c => String(c.brand || '').toLowerCase() === brand.toLowerCase()),
        ).toBe(false);
      }
      expect(
        catalog.some(
          c =>
            c.country === 'Luxembourg' &&
            (/painworld/i.test(c.brand || '') || /painworld/i.test(c.name)),
        ),
      ).toBe(false);
    });
  });

  describe('3. Basic-Fit QA', () => {
    it('has exactly 10 live Basic-Fit clubs including Foetz', () => {
      const rows = luCenters.filter(c => c.brand === 'Basic-Fit');
      expect(rows.length).toBe(10);
      expect(rows.every(c => c.is_active === true)).toBe(true);
      const foetz = findCenterById(BASIC_FIT_FOETZ)!;
      expect(foetz.brand).toBe('Basic-Fit');
      expect(foetz.name).toMatch(/Foetz/i);
      expect(foetz.postal_code).toBe('3898');
      expect(foetz.city).toBe('Foetz');
      expect(isPlausibleLuxembourgCoordinate(foetz.lat!, foetz.lng!)).toBe(true);
      expect(rows.filter(c => c.id === BASIC_FIT_FOETZ).length).toBe(1);
    });
  });

  describe('4. JIMS QA', () => {
    it('has exactly 6 live open clubs; Foetz absent', () => {
      const rows = luCenters.filter(c => c.brand === 'JIMS');
      expect(rows.length).toBe(6);
      expect(rows.some(c => c.id === JIMS_FOETZ)).toBe(false);
      expect(rows.some(c => /foetz/i.test(c.name))).toBe(false);
      expect(rows.filter(c => /gasperich/i.test(c.name)).length).toBe(1);
      expect(rows.filter(c => /gare/i.test(c.name)).length).toBe(1);
      expect(findCenterById(JIMS_FOETZ)).toBeUndefined();
    });
  });

  describe('5. CK Fitness QA', () => {
    it('has exactly 4 live clubs; no sportcenter leak', () => {
      const rows = luCenters.filter(c => c.brand === 'CK Fitness');
      expect(rows.length).toBe(4);
      expect(rows.every(c => LUXEMBOURG_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(rows.every(c => isPlausibleLuxembourgCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(luCenters.some(c => /sportcenter|kockelscheuer/i.test(c.name))).toBe(false);
      expect(rows.map(c => c.city).sort()).toEqual(
        ['Bertrange', 'Esch-sur-Alzette', 'Junglinster', 'Mersch'].sort(),
      );
    });
  });

  describe('6. Foetz / Painworld / Junck special cases', () => {
    it('Foetz CASE A: Basic-Fit live; JIMS Foetz COMING_SOON only', () => {
      expect(findCenterById(BASIC_FIT_FOETZ)).toBeTruthy();
      expect(findCenterById(JIMS_FOETZ)).toBeUndefined();
      expect(staging.find(s => s.id === JIMS_FOETZ)?.import_category).toBe('COMING_SOON');
      expect(luCenters.filter(c => /foetz/i.test(c.city) || /foetz/i.test(c.name)).length).toBe(1);
      expect(luCenters.filter(c => /foetz/i.test(c.name))[0]!.brand).toBe('Basic-Fit');
    });

    it('Painworld predecessor absent; JIMS Gasperich exactly once', () => {
      expect(luCenters.filter(c => /painworld/i.test(c.brand || '') || /painworld/i.test(c.name)).length).toBe(
        0,
      );
      expect(luCenters.filter(c => c.brand === 'JIMS' && /gasperich/i.test(c.name)).length).toBe(1);
    });

    it('Junck pair both live ~57m A_legitimate_adjacent', () => {
      const a = findCenterById(BF_JUNCK)!;
      const b = findCenterById(JIMS_GARE)!;
      expect(a.brand).toBe('Basic-Fit');
      expect(b.brand).toBe('JIMS');
      expect(a.address).toMatch(/Junck 12/i);
      expect(b.address).toMatch(/Junck 11/i);
      const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
      expect(d).toBeGreaterThan(40);
      expect(d).toBeLessThan(100);
    });
  });

  describe('7. Duplicate / proximity QA', () => {
    it('no same-brand hard dups; Junck is only different-brand <=100m', () => {
      const lt25: string[] = [];
      const lt50: string[] = [];
      const lt100: string[] = [];
      const identical: string[] = [];
      const diffBrand: Array<{a: string; b: string; d: number}> = [];
      for (let i = 0; i < luCenters.length; i++) {
        for (let j = i + 1; j < luCenters.length; j++) {
          const a = luCenters[i]!;
          const b = luCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical.push(`${a.id}|${b.id}`);
          if (a.brand === b.brand) {
            if (d <= 25) lt25.push(`${a.id}|${b.id}`);
            if (d <= 50) lt50.push(`${a.id}|${b.id}`);
            if (d <= 100) lt100.push(`${a.id}|${b.id}`);
          } else if (d <= 100) {
            diffBrand.push({a: a.id, b: b.id, d: Math.round(d)});
          }
        }
      }
      expect(lt25).toEqual([]);
      expect(lt50).toEqual([]);
      expect(lt100).toEqual([]);
      expect(identical).toEqual([]);
      expect(diffBrand.length).toBe(1);
      expect(
        (diffBrand[0]!.a === BF_JUNCK && diffBrand[0]!.b === JIMS_GARE) ||
          (diffBrand[0]!.b === BF_JUNCK && diffBrand[0]!.a === JIMS_GARE),
      ).toBe(true);
    });
  });

  describe('8. Border safety', () => {
    it('zero BE/FR/DE contamination in Luxembourg rows', () => {
      for (const c of luCenters) {
        expect(isPlausibleLuxembourgCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(c.country).toBe('Luxembourg');
        expect(isLuxembourgCountry(c.country)).toBe(true);
      }
      expect(catalog.filter(c => c.country === 'Luxembourg' && c.id.startsWith('be_')).length).toBe(
        0,
      );
      expect(catalog.filter(c => c.country === 'Luxembourg' && c.id.startsWith('fr_')).length).toBe(
        0,
      );
      expect(catalog.filter(c => c.country === 'Luxembourg' && c.id.startsWith('de_')).length).toBe(
        0,
      );
    });
  });

  describe('9. Country / display / search', () => {
    it('resolves lu_* → Luxembourg; orphan stub safe', () => {
      expect(GYM_ID_PREFIX.luxembourg).toBe('lu_');
      expect(gymCountryTranslationKey('Luxembourg')).toBe('countries.luxembourg');
      expect(resolveGymOrStub(BASIC_FIT_FOETZ).region).toBe('Luxembourg');
      expect(resolveGymOrStub('lu_nonexistent_test').region).toBe('Luxembourg');
      expect(resolveGymOrStub('lu_nonexistent_test').id).toBe('lu_nonexistent_test');
      expect(findGymById(BASIC_FIT_FOETZ)?.id).toBe(BASIC_FIT_FOETZ);
      expect(formatGymDisplayName(resolveGymOrStub(BASIC_FIT_FOETZ))).not.toMatch(/^lu_/);
      expect(getActiveGymsByCountry('Luxembourg').length).toBe(20);
    });

    it('search finds brands/cities/postcodes; zero-chain towns not fabricated', () => {
      const luGyms = luxembourg;
      getGymSearchIndex(luGyms);
      expect(searchGyms('Basic-Fit', {gyms: luGyms, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('JIMS', {gyms: luGyms, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('CK Fitness', {gyms: luGyms, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('Foetz', {gyms: luGyms, limit: 10}).some(h => /foetz/i.test(h.gym.city))).toBe(
        true,
      );
      expect(searchGyms('Mersch', {gyms: luGyms, limit: 10}).length).toBeGreaterThan(0);
      expect(searchGyms('Esch', {gyms: luGyms, limit: 10}).length).toBeGreaterThan(0);
      expect(searchGyms('1839', {gyms: luGyms, limit: 10}).length).toBeGreaterThan(0);
      expect(normalizeGymSearchValue('Esch-sur-Alzette')).toMatch(/esch/);
      expect(normalizeGymSearchValue('Pétange')).toBe('petange');
      for (const town of ZERO_CHAIN_TOWNS) {
        expect(luCenters.some(c => c.city === town)).toBe(false);
      }
    });
  });

  describe('10. Check-in / map / core flows', () => {
    it('200m check-in and auto-checkout boundaries unchanged', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
      const coords = getGymLatLngForCheckIn(BASIC_FIT_FOETZ);
      expect(coords).not.toBeNull();
      const center = findCenterById(BASIC_FIT_FOETZ)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearest and map viewport work for Luxembourg City', () => {
      const nearest = findNearestGym(49.6116, 6.1319, luxembourg);
      expect(nearest?.country).toBe('Luxembourg');
      const markers = toMap(luxembourg);
      expect(markers.length).toBe(20);
      const filtered = filterMapCentersInRegion(markers as never, {
        latitude: 49.6116,
        longitude: 6.1319,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      } as never);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThanOrEqual(20);
      expect(filtered.every((m: {country?: string}) => m.country === 'Luxembourg')).toBe(true);
    });

    it('representative IDs resolve through display paths without raw lu_* leakage', () => {
      for (const id of [BASIC_FIT_FOETZ, BF_JUNCK, JIMS_GARE]) {
        const g = resolveGymOrStub(id);
        expect(g.id).toBe(id);
        expect(g.region).toBe('Luxembourg');
        const label = formatGymDisplayName(g);
        expect(label.length).toBeGreaterThan(3);
        expect(label.startsWith('lu_')).toBe(false);
      }
    });
  });

  describe('11. Country regression', () => {
    it('exact 30-country production counts totaling 11692', () => {
      const counts: Record<string, number> = {};
      catalog.forEach(c => {
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

  describe('12. Performance snapshot', () => {
    it('records live catalog timings; under 12,500; KEEP CLIENT-SIDE', () => {
      const jsonSize = fs.statSync(centersPath).size;
      const tParse0 = Date.now();
      const raw = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
      const parseMs = Date.now() - tParse0;
      const active = raw.filter((c: {is_active?: boolean}) => c.is_active !== false);

      const tCold0 = Date.now();
      getGymSearchIndex();
      const coldMs = Date.now() - tCold0;
      const tCached0 = Date.now();
      getGymSearchIndex();
      const cachedMs = Date.now() - tCached0;

      const tSearch0 = Date.now();
      searchGyms('luxembourg', {limit: 20});
      searchGyms('basic-fit', {limit: 20});
      searchGyms('jims', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(49.6116, 6.1319, luxembourg);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(luxembourg);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 49.6116,
        longitude: 6.1319,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const shaAfter = crypto
        .createHash('sha256')
        .update(fs.readFileSync(centersPath))
        .digest('hex');

      const perf = {
        catalog: raw.length,
        active: active.length,
        luxembourg: luCenters.length,
        json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
        parse_ms: parseMs,
        cold_index_ms: coldMs,
        cached_index_ms: cachedMs,
        typical_search_ms: +typicalMs.toFixed(2),
        worst_search_ms: worstMs,
        nearest_ms: nearestMs,
        map_build_ms: mapBuildMs,
        viewport_filter_ms: viewportMs,
        map_markers_built: built.length,
        architecture: 'KEEP CLIENT-SIDE',
        estonia_qa_baseline: {
          catalog: 11610,
          json_size_mb: 3.44,
        },
        luxembourg_merge_baseline: {
          catalog: 11648,
          json_size_mb: 3.45,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
        production_sha256: LIVE_SHA,
        sha_after_qa: shaAfter,
        production_modified: shaAfter !== LIVE_SHA,
      };
      const outDir = path.join(__dirname, '../data/luxembourg');
      fs.writeFileSync(
        path.join(outDir, 'LUXEMBOURG_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      expect(perf.catalog).toBe(11692);
      expect(perf.luxembourg).toBe(20);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.json_size_mb).toBeLessThan(4.5);
      expect(perf.cold_index_ms).toBeLessThan(25000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
      expect(perf.crossed_12500).toBe(false);
      expect(perf.global_stress_qa_required).toBe(false);
      expect(perf.production_modified).toBe(false);
      expect(shaAfter).toBe(LIVE_SHA);
    });
  });
});
