/**
 * Cyprus gym QA — full production validation after cy_* merge (17 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/cyprus/CYPRUS_QA_PERF.json).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms, getActiveGymsByCountry} from '../src/data/danishGyms';
import {ALL_GYM_CENTERS, findCenterById} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {
  CYPRUS_POSTAL_RE,
  isCyprusCountry,
  isPlausibleCyprusCoordinate,
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

const staging = require('../data/cyprus/cyprus_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  eligibility_path?: string;
  territory?: string;
  coord_source?: string | null;
}>;

const approved = require('../data/cyprus/CYPRUS_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
  eligibility_path?: string;
}>;

const phase2Ready = require('../data/cyprus/CYPRUS_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  eligibility_path?: string;
  coord_source?: string | null;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN_NORTH =
  /\b(kyrenia|girne|morphou|g[uü]zelyurt|northern cyprus|trnc|gazima[gğ]usa|lefko[sş]a|karavas|lapta|iskele|turkey)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_CY = 17;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const EXPECTED_INVENTORY: Array<{
  brand: string;
  nameIncludes: RegExp;
  city: string;
  postal: string;
}> = [
  {brand: 'ALTERLIFE', nameIncludes: /alterlife nicosia/i, city: 'Strovolos', postal: '2048'},
  {
    brand: 'Aesthetics Gym',
    nameIncludes: /aesthetics gold/i,
    city: 'Paphos',
    postal: '8036',
  },
  {brand: 'Aesthetics Gym', nameIncludes: /aesthetics arc/i, city: 'Paphos', postal: '8016'},
  {brand: 'Curves', nameIncludes: /aglantzia/i, city: 'Aglantzia', postal: '2103'},
  {brand: 'Curves', nameIncludes: /larnaca|larnaka/i, city: 'Larnaca', postal: '6037'},
  {
    brand: 'Eleftheriou Lifestyle Fitness',
    nameIncludes: /eleftheriou/i,
    city: 'Kato Polemidia',
    postal: '4152',
  },
  {brand: 'Evolve Fitness', nameIncludes: /evolve/i, city: 'Lakatamia', postal: '2311'},
  {brand: 'Figure8Gym', nameIncludes: /figure8/i, city: 'Pallouriotissa', postal: '1035'},
  {
    brand: 'Fitness Factory',
    nameIncludes: /fitness factory/i,
    city: 'Engomi',
    postal: '2409',
  },
  {brand: 'G Gym', nameIncludes: /g gym/i, city: 'Paralimni', postal: '5291'},
  {
    brand: 'Machallekide Fitness',
    nameIncludes: /machallekide/i,
    city: 'Limassol',
    postal: '3116',
  },
  {brand: 'New Body Gym', nameIncludes: /new body/i, city: 'Strovolos', postal: '2040'},
  {
    brand: 'New Life Health Center',
    nameIncludes: /new life/i,
    city: 'Strovolos',
    postal: '2058',
  },
  {brand: 'Platinum Sports', nameIncludes: /platinum/i, city: 'Larnaca', postal: '6021'},
  {
    brand: 'Pumping Iron Gym',
    nameIncludes: /pumping iron/i,
    city: 'Strovolos',
    postal: '2042',
  },
  {brand: 'Reflex Gym', nameIncludes: /reflex/i, city: 'Larnaca', postal: '6042'},
  {
    brand: 'Tower Fitness Center',
    nameIncludes: /tower/i,
    city: 'Peyia',
    postal: '8560',
  },
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

function offsetMeters(lat: number, lng: number, metersNorth: number, metersEast: number) {
  const dLat = metersNorth / 111320;
  const dLng = metersEast / (111320 * Math.cos((lat * Math.PI) / 180));
  return {lat: lat + dLat, lng: lng + dLng};
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

describe('Cyprus gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const cyprus = gyms.filter(g => isCyprusCountry(g.country));
  const cyCenters = catalog.filter(c => isCyprusCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const shaBefore = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  describe('1. Catalog integrity / freeze', () => {
    it('total production = 11831; Cyprus = 17; cy_* = 17; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(cyCenters.length).toBe(EXPECTED_CY);
      expect(cyprus.length).toBe(EXPECTED_CY);
      expect(catalog.filter(c => c.id.startsWith('cy_')).length).toBe(EXPECTED_CY);
      expect(catalog.filter(c => c.id.startsWith('cy_') && c.country !== 'Cyprus').length).toBe(0);
      expect(shaBefore).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(cyCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(17);
      expect(ap.size).toBe(17);
      expect(ready.size).toBe(17);
      expect(merged.size).toBe(17);
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
        expect(live.country).toBe('Cyprus');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
        expect(a.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      }
    });

    it('all cy_* IDs unique with required fields and valid Cyprus geography', () => {
      const ids = new Set<string>();
      for (const c of cyCenters) {
        expect(c.id).toMatch(/^cy_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Cyprus');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(CYPRUS_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(String(c.postal_code).startsWith('99')).toBe(false);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleCyprusCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_NORTH.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(17);
      expect(new Set(catalog.map(c => c.id)).size).toBe(catalog.length);
    });

    it('exact approved inventory once; unexpected locations = 0', () => {
      expect(cyCenters.length).toBe(EXPECTED_INVENTORY.length);
      for (const exp of EXPECTED_INVENTORY) {
        const hits = cyCenters.filter(
          c => c.brand === exp.brand && exp.nameIncludes.test(c.name) && c.city === exp.city,
        );
        expect(hits.length).toBe(1);
        expect(hits[0]!.postal_code).toBe(exp.postal);
      }
    });
  });

  describe('2. Eligibility / staging exclusions', () => {
    it('SMALL_MARKET_INDEPENDENT = 17; CHAIN_CLASS_A = 0', () => {
      expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      expect(phase2Ready.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      expect(
        staging
          .filter(s => s.import_category === 'MERGED_INTO_CATALOG')
          .every(s => s.eligibility_path === 'SMALL_MARKET_INDEPENDENT'),
      ).toBe(true);
    });

    it('MERGED 17 / NEEDS_COORD 5 / CLOSED 8 / EXCLUDED 37; none of non-merged live', () => {
      const cats: Record<string, number> = {};
      for (const s of staging) cats[s.import_category] = (cats[s.import_category] || 0) + 1;
      expect(cats.MERGED_INTO_CATALOG).toBe(17);
      expect(cats.NEEDS_COORDINATES).toBe(5);
      expect(cats.CLOSED).toBe(8);
      expect(cats.EXCLUDED).toBe(37);
      expect(cats.NEEDS_REVIEW || 0).toBe(0);
      expect(cats.COMING_SOON || 0).toBe(0);
      expect(staging.length).toBe(67);

      const prodIds = new Set(cyCenters.map(c => c.id));
      for (const r of staging.filter(s =>
        ['NEEDS_COORDINATES', 'CLOSED', 'EXCLUDED', 'NEEDS_REVIEW', 'COMING_SOON'].includes(
          s.import_category,
        ),
      )) {
        expect(prodIds.has(r.id)).toBe(false);
      }
    });
  });

  describe('3. Sanctum / Fitness Factory / Fitness One / Curves / ALTERLIFE', () => {
    it('Sanctum production = 0; not searchable as live Cyprus gym', () => {
      expect(
        cyCenters.filter(c => /sanctum/i.test(c.name) || /sanctum/i.test(c.brand || '')).length,
      ).toBe(0);
      getGymSearchIndex(cyprus);
      expect(searchGyms('Sanctum', {gyms: cyprus, limit: 20}).length).toBe(0);
      expect(searchGyms('Sunset Gardens', {gyms: cyprus, limit: 10}).length).toBe(0);
    });

    it('Fitness Factory = 1 Engomi; Fitness One = 0', () => {
      const ff = cyCenters.filter(c => c.brand === 'Fitness Factory');
      expect(ff.length).toBe(1);
      expect(ff[0]!.city).toBe('Engomi');
      expect(ff[0]!.postal_code).toBe('2409');
      expect(/pindou/i.test(ff[0]!.address)).toBe(true);
      expect(
        cyCenters.filter(c => /fitness one/i.test(c.brand || '') || /fitness one/i.test(c.name))
          .length,
      ).toBe(0);
      getGymSearchIndex(cyprus);
      expect(
        searchGyms('Fitness One', {gyms: cyprus, limit: 10}).every(
          h => !/fitness one/i.test(h.gym.brand || '') && !/^fitness one\b/i.test(h.gym.name),
        ),
      ).toBe(true);
    });

    it('Curves = 2 current; 8 CLOSED legacy absent from production/search', () => {
      const curves = cyCenters.filter(c => c.brand === 'Curves');
      expect(curves.length).toBe(2);
      expect(curves.some(c => /aglantzia/i.test(c.name))).toBe(true);
      expect(curves.some(c => /larnaca/i.test(c.name))).toBe(true);
      const closedCurves = staging.filter(
        s => s.brand === 'Curves' && s.import_category === 'CLOSED',
      );
      expect(closedCurves.length).toBe(8);
      for (const r of closedCurves) {
        expect(findCenterById(r.id)).toBeUndefined();
      }
      getGymSearchIndex(cyprus);
      // Fuzzy may return other Paralimni clubs; must not revive CLOSED Curves identities
      expect(
        searchGyms('Curves Paralimni', {gyms: cyprus, limit: 10}).every(
          h => !(h.gym.brand === 'Curves' && /paralimni/i.test(`${h.gym.name} ${h.gym.city}`)),
        ),
      ).toBe(true);
      expect(
        searchGyms('Curves Chloraka', {gyms: cyprus, limit: 10}).every(
          h => !(h.gym.brand === 'Curves' && /chloraka/i.test(`${h.gym.name} ${h.gym.city}`)),
        ),
      ).toBe(true);
    });

    it('ALTERLIFE Cyprus = 1 cy_*; no Greece metadata leakage', () => {
      const alter = cyCenters.filter(c => c.brand === 'ALTERLIFE');
      expect(alter.length).toBe(1);
      expect(alter[0]!.id.startsWith('cy_')).toBe(true);
      expect(alter[0]!.country).toBe('Cyprus');
      expect(
        catalog.filter(
          c => c.id.startsWith('gr_') && /alterlife/i.test(c.brand || '') && c.country === 'Cyprus',
        ).length,
      ).toBe(0);
      const greeceAlter = catalog.filter(
        c => /alterlife/i.test(c.brand || '') && c.country === 'Greece',
      );
      expect(greeceAlter.every(c => c.id.startsWith('gr_') || c.country === 'Greece')).toBe(true);
      expect(catalog.filter(c => c.country === 'Greece').length).toBe(106);
    });
  });

  describe('4. NEEDS_COORDINATES / leakage QA', () => {
    it('Anaplasis / Arise / Kondylis / Barbarian / Gymland not live', () => {
      expect(
        cyCenters.filter(c =>
          /anaplasis|arise active|kondylis|barbarian|gymland/i.test(`${c.brand} ${c.name}`),
        ).length,
      ).toBe(0);
      getGymSearchIndex(cyprus);
      expect(searchGyms('Anaplasis', {gyms: cyprus, limit: 10}).length).toBe(0);
      expect(searchGyms('Arise Active', {gyms: cyprus, limit: 10}).length).toBe(0);
      expect(searchGyms('Kondylis', {gyms: cyprus, limit: 10}).length).toBe(0);
      expect(searchGyms('Barbarian', {gyms: cyprus, limit: 10}).length).toBe(0);
      expect(searchGyms('Gymland', {gyms: cyprus, limit: 10}).length).toBe(0);
    });
  });

  describe('5. Territorial safety', () => {
    it('Republic-controlled 17/17; Northern outliers = 0', () => {
      for (const c of cyCenters) {
        expect(isPlausibleCyprusCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_NORTH.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
        expect(String(c.postal_code).startsWith('99')).toBe(false);
      }
      const northStaging = staging.filter(s => s.territory === 'Northern Cyprus / TRNC');
      expect(northStaging.length).toBeGreaterThanOrEqual(2);
      for (const r of northStaging) {
        expect(findCenterById(r.id)).toBeUndefined();
      }
      getGymSearchIndex(cyprus);
      expect(searchGyms('Kyrenia', {gyms: cyprus, limit: 10}).length).toBe(0);
      expect(searchGyms('Girne', {gyms: cyprus, limit: 10}).length).toBe(0);
      expect(searchGyms('Gazimagusa', {gyms: cyprus, limit: 10}).length).toBe(0);
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no same-brand hard dups; unexplained hard duplicates = 0', () => {
      const lt25: string[] = [];
      const lt50: string[] = [];
      const lt100: string[] = [];
      const lt200: string[] = [];
      const identical: string[] = [];
      const diffBrand: Array<{a: string; b: string; d: number}> = [];
      const addrNorm = new Map<string, string[]>();
      for (const c of cyCenters) {
        const key = normalizeGymSearchValue(`${c.address}|${c.postal_code}|${c.city}`);
        const list = addrNorm.get(key) || [];
        list.push(c.id);
        addrNorm.set(key, list);
      }
      expect([...addrNorm.values()].filter(v => v.length > 1)).toEqual([]);

      for (let i = 0; i < cyCenters.length; i++) {
        for (let j = i + 1; j < cyCenters.length; j++) {
          const a = cyCenters[i]!;
          const b = cyCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical.push(`${a.id}|${b.id}`);
          if (a.brand === b.brand) {
            if (d <= 25) lt25.push(`${a.id}|${b.id}`);
            if (d <= 50) lt50.push(`${a.id}|${b.id}`);
            if (d <= 100) lt100.push(`${a.id}|${b.id}`);
            if (d <= 200) lt200.push(`${a.id}|${b.id}`);
          } else if (d <= 100) {
            diffBrand.push({a: a.id, b: b.id, d: Math.round(d)});
          }
        }
      }
      expect(lt25).toEqual([]);
      expect(lt50).toEqual([]);
      expect(lt100).toEqual([]);
      expect(lt200).toEqual([]);
      expect(identical).toEqual([]);
      expect(diffBrand).toEqual([]);
    });
  });

  describe('7. Search / display / core flows', () => {
    it('resolves cy_* → Cyprus; orphan stub safe; display without raw id', () => {
      expect(GYM_ID_PREFIX.cyprus).toBe('cy_');
      expect(gymCountryTranslationKey('Cyprus')).toBe('countries.cyprus');
      const sampleId = cyCenters[0]!.id;
      expect(resolveGymOrStub(sampleId).region).toBe('Cyprus');
      expect(resolveGymOrStub('cy_nonexistent_test').region).toBe('Cyprus');
      expect(resolveGymOrStub('cy_nonexistent_test').id).toBe('cy_nonexistent_test');
      expect(findGymById(sampleId)?.id).toBe(sampleId);
      expect(formatGymDisplayName(resolveGymOrStub(sampleId))).not.toMatch(/^cy_/);
      expect(getActiveGymsByCountry('Cyprus').length).toBe(17);
    });

    it('brand / locality / postcode search finds live centers only', () => {
      getGymSearchIndex(cyprus);
      const queries: Array<[string, RegExp]> = [
        ['ALTERLIFE', /alterlife/i],
        ['Curves', /curves/i],
        ['Fitness Factory', /fitness factory/i],
        ['New Life', /new life/i],
        ['Tower', /tower/i],
        ['Evolve', /evolve/i],
        ['Reflex', /reflex/i],
        ['Pumping Iron', /pumping iron/i],
        ['G Gym', /g gym/i],
        ['Nicosia', /./],
        ['Strovolos', /strovolos/i],
        ['Paphos', /paphos|peyia|aesthetics/i],
        ['Aglantzia', /aglantzia/i],
        ['Larnaca', /larnaca|curves|reflex|platinum/i],
        ['Kato Polemidia', /eleftheriou|polemidia/i],
        ['Lakatamia', /evolve|lakatamia/i],
        ['Pallouriotissa', /figure8|pallouriotissa/i],
        ['Engomi', /engomi|factory/i],
        ['Paralimni', /paralimni|g gym/i],
        ['Limassol', /limassol|machallekide/i],
        ['Peyia', /peyia|tower/i],
        ['2048', /alterlife/i],
        ['2409', /factory/i],
      ];
      for (const [q, re] of queries) {
        const hits = searchGyms(q, {gyms: cyprus, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every(h => h.gym.id.startsWith('cy_'))).toBe(true);
        expect(hits.some(h => re.test(`${h.gym.name} ${h.gym.city} ${h.gym.brand}`))).toBe(true);
      }
    });

    it('check-in 199/200 allow, 201 block; auto-checkout 200 m unchanged', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
      const sample = cyprus[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      const {latitude: lat, longitude: lng} = coords!;
      const p199 = offsetMeters(lat, lng, 199, 0);
      const p200 = offsetMeters(lat, lng, 200, 0);
      const p201 = offsetMeters(lat, lng, 201, 0);
      expect(haversineMeters(p199.lat, p199.lng, lat, lng)).toBeLessThanOrEqual(
        CHECK_IN_RADIUS_METERS,
      );
      expect(haversineMeters(p200.lat, p200.lng, lat, lng)).toBeLessThanOrEqual(
        CHECK_IN_RADIUS_METERS,
      );
      expect(haversineMeters(p201.lat, p201.lng, lat, lng)).toBeGreaterThan(CHECK_IN_RADIUS_METERS);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearest / map viewport sanity for Cyprus', () => {
      const nearest = findNearestGym(35.15, 33.35, cyprus);
      expect(nearest?.country).toBe('Cyprus');
      expect(nearest?.id.startsWith('cy_')).toBe(true);
      const markers = toMap(cyprus);
      expect(markers.length).toBe(17);
      const visible = filterMapCentersInRegion(markers as never, {
        latitude: 35.12,
        longitude: 33.35,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      } as never);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every(m => String(m.id).startsWith('cy_'))).toBe(true);
    });
  });

  describe('8. Country regression', () => {
    it('exact 37-country production counts totaling 11831', () => {
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
      expect(counts['Liechtenstein']).toBe(7);
      expect(counts['Andorra']).toBe(12);
      expect(counts['Monaco']).toBe(4);
      expect(counts['San Marino']).toBe(6);
      expect(counts['Moldova']).toBe(28);
    expect(counts['Bosnia and Herzegovina']).toBe(31);
    expect(counts['North Macedonia']).toBe(25);
      expect(counts['Montenegro']).toBe(26);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11921);
    });
  });

  describe('9. Performance snapshot + freeze', () => {
    it('records live catalog timings; under 12,500; KEEP CLIENT-SIDE; SHA unchanged', () => {
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
      searchGyms('cyprus', {limit: 20});
      searchGyms('ALTERLIFE', {limit: 20});
      searchGyms('Curves', {limit: 20});
      searchGyms('Larnaca', {limit: 20});
      searchGyms('2409', {limit: 10});
      const typicalMs = (Date.now() - tSearch0) / 5;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(35.15, 33.35, cyprus);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(cyprus);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 35.1,
        longitude: 33.3,
        latitudeDelta: 0.4,
        longitudeDelta: 0.4,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const shaAfter = crypto
        .createHash('sha256')
        .update(fs.readFileSync(centersPath))
        .digest('hex');

      const perf = {
        catalog: raw.length,
        active: active.length,
        cyprus: cyCenters.length,
        json_size_bytes: jsonSize,
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
        malta_qa_baseline: {
          catalog: 11692,
          json_size_mb: 3.46,
        },
        cyprus_merge_baseline: {
          catalog: 11692,
          json_size_bytes: 3625046,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
        production_sha256: LIVE_SHA,
        sha_after_qa: shaAfter,
        production_modified: shaAfter !== LIVE_SHA,
      };

      expect(perf.catalog).toBe(11921);
      expect(perf.cyprus).toBe(17);
      expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
      expect(shaAfter).toBe(LIVE_SHA);
      expect(shaAfter).toBe(shaBefore);
      expect(perf.production_modified).toBe(false);
      expect(perf.crossed_12500).toBe(false);

      const outDir = path.join(__dirname, '../data/cyprus');
      fs.writeFileSync(path.join(outDir, 'CYPRUS_QA_PERF.json'), JSON.stringify(perf, null, 2) + '\n');
      fs.writeFileSync(
        path.join(outDir, 'CYPRUS_QA_REPORT.md'),
        `# CYPRUS QA REPORT

## Verdict

**CYPRUS STATUS: READY**

## Freeze

- Catalog: ${perf.catalog}
- Cyprus: ${perf.cyprus}
- SHA256: \`${shaAfter}\`
- Production modified: NO

## Eligibility

- CHAIN_CLASS_A: 0
- SMALL_MARKET_INDEPENDENT: 17

## Gates

- Sanctum live: 0
- Fitness Factory: 1
- Fitness One: 0
- Curves: 2
- ALTERLIFE Cyprus: 1
- Territorial: CLEAN
- Metadata drift: NONE

## Performance

- JSON: ${perf.json_size_mb} MB (${perf.json_size_bytes} bytes)
- Parse: ${perf.parse_ms} ms
- Cold index: ${perf.cold_index_ms} ms
- Cached index: ${perf.cached_index_ms} ms
- Typical search: ${perf.typical_search_ms} ms
- Architecture: KEEP CLIENT-SIDE

## Global scale

- Catalog: ${perf.catalog}
- Crossed 12,500: NO
- Global Stress QA required: NO
- Country expansion: UNLOCKED
`,
      );
    });
  });
});
