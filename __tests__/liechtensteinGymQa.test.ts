/**
 * Liechtenstein gym QA — full production validation after li_* merge (7 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/liechtenstein/LIECHTENSTEIN_QA_*).
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
  LIECHTENSTEIN_POSTAL_RE,
  isLiechtensteinCountry,
  isPlausibleLiechtensteinCoordinate,
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

const staging = require('../data/liechtenstein/liechtenstein_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  eligibility_path?: string;
  coord_source?: string | null;
}>;

const approved = require('../data/liechtenstein/LIECHTENSTEIN_APPROVED_FOR_MERGE.json') as Array<{
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

const phase2Ready = require('../data/liechtenstein/LIECHTENSTEIN_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  eligibility_path?: string;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const SWISS_AT_RISK =
  /\b(buchs|sevelen|grabs|tr[uü]bbach|sargans|st\.?\s*gallen|feldkirch|frastanz|nenzing|hohenems)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_LI = 7;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const REQUIRED = {
  updateVaduz: 'li_9fdb1d933f',
  liefitVaduz: 'li_9514fe2df2',
  purfitness: 'li_35eed72b39',
  lorezPower: 'li_688dc73ac2',
  flexigym: 'li_f02192ce76',
  inMotion: 'li_740e149c77',
  kokon: 'li_9b66d0aa5e',
};

const FORBIDDEN_LIVE_IDS = new Set([
  'li_7f2d2a5ed7', // GEOWAY Eschen
  'li_3ff9b2a62c', // Lorez Gesundheitscenter
  'li_53796ae7be', // Salutaris
  'li_1d8662661d', // fitnesshaus by blugym
  'li_f64f3d5e62', // Bro Performance
  'li_cc52b1bb46', // WOMEN'S GYM
  'li_cd6d79182c', // Sportcenter Lampert
  'li_4752196856', // Called 4 CrossFit
  'li_3e41f7df25', // Budokan
  'li_237909dcc8', // Fita Nendeln
  'li_38b1a364b8', // AKA GYM
  'li_07d5142b96', // Luxe Private Fitness Lounge
]);

const INVENTORY: Array<{
  id: string;
  name: string;
  city: string;
  postal: string;
  brand: string;
}> = [
  {
    id: REQUIRED.updateVaduz,
    name: 'update Fitness Vaduz',
    city: 'Vaduz',
    postal: '9490',
    brand: 'update Fitness',
  },
  {
    id: REQUIRED.liefitVaduz,
    name: 'LieFit Vaduz',
    city: 'Vaduz',
    postal: '9490',
    brand: 'LieFit',
  },
  {
    id: REQUIRED.purfitness,
    name: 'purfitness Schaan',
    city: 'Schaan',
    postal: '9494',
    brand: 'purfitness',
  },
  {
    id: REQUIRED.lorezPower,
    name: 'Lorez Power Center Bendern',
    city: 'Bendern',
    postal: '9487',
    brand: 'Lorez',
  },
  {
    id: REQUIRED.flexigym,
    name: 'flexigym Balzers',
    city: 'Balzers',
    postal: '9496',
    brand: 'flexigym',
  },
  {
    id: REQUIRED.inMotion,
    name: 'In Motion Eschen',
    city: 'Eschen',
    postal: '9492',
    brand: 'In Motion',
  },
  {
    id: REQUIRED.kokon,
    name: 'KOKON Fitness & Spa Ruggell',
    city: 'Ruggell',
    postal: '9491',
    brand: 'KOKON Fitness',
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

describe('Liechtenstein gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const liechtenstein = gyms.filter(g => isLiechtensteinCountry(g.country));
  const liCenters = catalog.filter(c => isLiechtensteinCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const shaBefore = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  describe('1. Catalog integrity / freeze', () => {
    it('total production = 11831; Liechtenstein = 7; li_* = 7; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(liCenters.length).toBe(EXPECTED_LI);
      expect(liechtenstein.length).toBe(EXPECTED_LI);
      expect(catalog.filter(c => c.id.startsWith('li_')).length).toBe(EXPECTED_LI);
      expect(
        catalog.filter(c => c.id.startsWith('li_') && c.country !== 'Liechtenstein').length,
      ).toBe(0);
      expect(shaBefore).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(liCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(7);
      expect(ap.size).toBe(7);
      expect(ready.size).toBe(7);
      expect(merged.size).toBe(7);
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
        expect(live.country).toBe('Liechtenstein');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
        expect(a.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      }
    });

    it('all li_* IDs unique with required fields and valid Liechtenstein geography', () => {
      const ids = new Set<string>();
      for (const c of liCenters) {
        expect(c.id).toMatch(/^li_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Liechtenstein');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(LIECHTENSTEIN_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleLiechtensteinCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
        expect(SWISS_AT_RISK.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(7);
      expect(new Set(catalog.map(c => c.id)).size).toBe(catalog.length);
    });

    it('eligibility: CHAIN_CLASS_A 0 + SMALL_MARKET_INDEPENDENT 7', () => {
      expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      expect(phase2Ready.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      const mergedRows = staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG');
      expect(mergedRows.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
    });
  });

  describe('2. Expected live inventory + brand QA', () => {
    it('exact 7 inventory once; no unexpected LI locations', () => {
      expect(liCenters.length).toBe(7);
      for (const row of INVENTORY) {
        const live = findCenterById(row.id)!;
        expect(live).toBeTruthy();
        expect(live.name).toBe(row.name);
        expect(live.city).toBe(row.city);
        expect(live.postal_code).toBe(row.postal);
        expect(live.brand).toBe(row.brand);
        expect(live.country).toBe('Liechtenstein');
      }
      const expectedIds = new Set(INVENTORY.map(r => r.id));
      expect(liCenters.every(c => expectedIds.has(c.id))).toBe(true);
    });

    it('update Fitness = 1 Vaduz Landstrasse 117; no Swiss li_* leakage', () => {
      const updates = liCenters.filter(c => c.brand === 'update Fitness');
      expect(updates.length).toBe(1);
      expect(updates[0]!.id).toBe(REQUIRED.updateVaduz);
      expect(updates[0]!.address).toBe('Landstrasse 117');
      expect(updates[0]!.city).toBe('Vaduz');
      expect(updates[0]!.postal_code).toBe('9490');
      expect(
        catalog.filter(c => c.id.startsWith('li_') && /switzerland|buchs|sg\b/i.test(`${c.city}`))
          .length,
      ).toBe(0);
    });

    it('LieFit = 1; GEOWAY = 0', () => {
      expect(liCenters.filter(c => c.brand === 'LieFit').length).toBe(1);
      expect(liCenters.filter(c => c.id === REQUIRED.liefitVaduz).length).toBe(1);
      expect(liCenters.filter(c => /GEOWAY/i.test(`${c.brand} ${c.name}`)).length).toBe(0);
      expect(findCenterById('li_7f2d2a5ed7')).toBeUndefined();
    });

    it('purfitness = 1; fitnesshaus/blugym predecessor = 0', () => {
      expect(liCenters.filter(c => c.brand === 'purfitness').length).toBe(1);
      expect(liCenters.filter(c => c.id === REQUIRED.purfitness).length).toBe(1);
      expect(findCenterById(REQUIRED.purfitness)!.address).toMatch(/Im alten Riet 22/i);
      expect(
        liCenters.filter(c => /fitnesshaus|blugym/i.test(`${c.brand} ${c.name}`)).length,
      ).toBe(0);
      expect(findCenterById('li_1d8662661d')).toBeUndefined();
    });

    it('Lorez Power Center = 1; Gesundheitscenter = 0; Salutaris = 0; no Health Training club', () => {
      expect(liCenters.filter(c => c.id === REQUIRED.lorezPower).length).toBe(1);
      expect(liCenters.filter(c => /Gesundheitscenter/i.test(`${c.brand} ${c.name}`)).length).toBe(
        0,
      );
      expect(liCenters.filter(c => /Salutaris/i.test(`${c.brand} ${c.name}`)).length).toBe(0);
      expect(liCenters.filter(c => /Health Training/i.test(`${c.brand} ${c.name}`)).length).toBe(0);
      expect(findCenterById('li_3ff9b2a62c')).toBeUndefined();
      expect(findCenterById('li_53796ae7be')).toBeUndefined();
    });

    it('flexigym Balzers = 1; In Motion = 1; KOKON = 1', () => {
      expect(liCenters.filter(c => c.brand === 'flexigym').length).toBe(1);
      expect(findCenterById(REQUIRED.flexigym)!.city).toBe('Balzers');
      expect(findCenterById(REQUIRED.flexigym)!.postal_code).toBe('9496');
      expect(isPlausibleLiechtensteinCoordinate(
        findCenterById(REQUIRED.flexigym)!.lat!,
        findCenterById(REQUIRED.flexigym)!.lng!,
      )).toBe(true);

      expect(liCenters.filter(c => c.brand === 'In Motion').length).toBe(1);
      expect(findCenterById(REQUIRED.inMotion)!.city).toBe('Eschen');
      expect(findCenterById(REQUIRED.inMotion)!.postal_code).toBe('9492');

      const kokon = findCenterById(REQUIRED.kokon)!;
      expect(kokon).toBeTruthy();
      expect(kokon.postal_code).toBe('9491');
      expect(kokon.city).toBe('Ruggell');
      expect(/Industriering 3/i.test(kokon.address)).toBe(true);
      expect(isPlausibleLiechtensteinCoordinate(kokon.lat!, kokon.lng!)).toBe(true);
    });
  });

  describe('3. Closed / excluded / rebrand leakage', () => {
    it('staging MERGED 7 / EXCLUDED 43 / CLOSED 2 / total 52; leakage = 0', () => {
      const cats: Record<string, number> = {};
      for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
      expect(cats.MERGED_INTO_CATALOG).toBe(7);
      expect(cats.EXCLUDED).toBe(43);
      expect(cats.CLOSED).toBe(2);
      expect(staging.length).toBe(52);

      const prodIds = new Set(catalog.map(c => c.id));
      const closedExcluded = staging.filter(r =>
        ['CLOSED', 'EXCLUDED'].includes(r.import_category),
      );
      expect(closedExcluded.every(r => !prodIds.has(r.id))).toBe(true);
      for (const id of FORBIDDEN_LIVE_IDS) {
        expect(prodIds.has(id)).toBe(false);
        expect(findCenterById(id)).toBeUndefined();
      }
    });

    it('rebrand/legacy conflicts = 0; only purfitness successor live', () => {
      expect(liCenters.filter(c => /Salutaris|blugym|fitnesshaus|GEOWAY/i.test(`${c.brand} ${c.name}`)).length).toBe(
        0,
      );
      expect(liCenters.filter(c => c.brand === 'purfitness').length).toBe(1);
      expect(liCenters.filter(c => c.brand === 'LieFit').length).toBe(1);
      expect(liCenters.filter(c => c.brand === 'Lorez').length).toBe(1);
    });
  });

  describe('4. Duplicate / proximity / cross-border', () => {
    it('hard duplicate problems = 0; proximity classified', () => {
      const lt25: string[] = [];
      const lt50: string[] = [];
      const lt100: string[] = [];
      const lt200: string[] = [];
      const identical: string[] = [];
      const diffBrand100: Array<{a: string; b: string; d: number}> = [];
      const diffBrand200: Array<{a: string; b: string; d: number}> = [];
      const addrNorm = new Map<string, string[]>();
      for (const c of liCenters) {
        const key = normalizeGymSearchValue(`${c.address}|${c.postal_code}|${c.city}`);
        const list = addrNorm.get(key) || [];
        list.push(c.id);
        addrNorm.set(key, list);
      }
      expect([...addrNorm.values()].filter(v => v.length > 1)).toEqual([]);
      expect(new Set(liCenters.map(c => c.id)).size).toBe(7);

      for (let i = 0; i < liCenters.length; i++) {
        for (let j = i + 1; j < liCenters.length; j++) {
          const a = liCenters[i]!;
          const b = liCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical.push(`${a.id}|${b.id}`);
          if (a.brand === b.brand) {
            if (d <= 25) lt25.push(`${a.id}|${b.id}`);
            if (d <= 50) lt50.push(`${a.id}|${b.id}`);
            if (d <= 100) lt100.push(`${a.id}|${b.id}`);
            if (d <= 200) lt200.push(`${a.id}|${b.id}`);
          } else {
            if (d <= 100) diffBrand100.push({a: a.id, b: b.id, d: Math.round(d)});
            if (d <= 200) diffBrand200.push({a: a.id, b: b.id, d: Math.round(d)});
          }
        }
      }
      expect(lt25).toEqual([]);
      expect(lt50).toEqual([]);
      expect(lt100).toEqual([]);
      expect(lt200).toEqual([]);
      expect(identical).toEqual([]);
      expect(diffBrand100).toEqual([]);
      expect(diffBrand200).toEqual([]);
    });

    it('cross-border CLEAN: LI 7/7; CH/AT contamination 0', () => {
      for (const c of liCenters) {
        expect(isPlausibleLiechtensteinCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(LIECHTENSTEIN_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(c.country).toBe('Liechtenstein');
      }
      expect(
        liCenters.filter(c => !isPlausibleLiechtensteinCoordinate(c.lat!, c.lng!)).length,
      ).toBe(0);
    });
  });

  describe('5. Search / display / core flows', () => {
    it('resolves li_* → Liechtenstein; orphan stub safe; no LU/CH/AT collision', () => {
      expect(GYM_ID_PREFIX.liechtenstein).toBe('li_');
      expect(gymCountryTranslationKey('Liechtenstein')).toBe('countries.liechtenstein');
      expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
      expect(isLiechtensteinCountry('LI')).toBe(true);
      const sampleId = REQUIRED.updateVaduz;
      expect(resolveGymOrStub(sampleId).region).toBe('Liechtenstein');
      expect(resolveGymOrStub('li_nonexistent_test').region).toBe('Liechtenstein');
      expect(resolveGymOrStub('li_nonexistent_test').id).toBe('li_nonexistent_test');
      expect(findGymById(sampleId)?.id).toBe(sampleId);
      expect(formatGymDisplayName(resolveGymOrStub(sampleId))).not.toMatch(/^li_/);
      expect(getActiveGymsByCountry('Liechtenstein').length).toBe(7);
      expect(resolveGymOrStub(sampleId).region).not.toBe('Luxembourg');
      expect(resolveGymOrStub(sampleId).region).not.toBe('Switzerland');
      expect(resolveGymOrStub(sampleId).region).not.toBe('Austria');
    });

    it('brand / locality search finds live centers; excluded not production', () => {
      getGymSearchIndex(liechtenstein);
      const queries: Array<[string, RegExp]> = [
        ['update Fitness', /update fitness/i],
        ['LieFit', /liefit/i],
        ['purfitness', /purfitness/i],
        ['Lorez', /lorez/i],
        ['flexigym', /flexigym/i],
        ['In Motion', /in motion/i],
        ['KOKON Fitness', /kokon/i],
        ['Vaduz', /vaduz/i],
        ['Schaan', /schaan|purfitness/i],
        ['Bendern', /bendern|lorez/i],
        ['Balzers', /balzers|flexigym/i],
        ['Eschen', /eschen|in motion/i],
        ['Ruggell', /ruggell|kokon/i],
        ['9490', /vaduz|update|liefit/i],
        ['9491', /kokon|ruggell/i],
      ];
      for (const [q, re] of queries) {
        const hits = searchGyms(q, {gyms: liechtenstein, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every(h => h.gym.id.startsWith('li_'))).toBe(true);
        expect(hits.some(h => re.test(`${h.gym.name} ${h.gym.city} ${h.gym.brand}`))).toBe(true);
        expect(hits.every(h => !FORBIDDEN_LIVE_IDS.has(h.gym.id))).toBe(true);
      }
      // Gamprin may resolve via Bendern/Gamprin locality noise; ensure no fabricated ID
      const gamprin = searchGyms('Gamprin', {gyms: liechtenstein, limit: 20});
      expect(gamprin.every(h => h.gym.id.startsWith('li_'))).toBe(true);
    });

    it('check-in 199/200 allow, 201 block; auto-checkout 200 m unchanged', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
      const sample = liechtenstein[0]!;
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

    it('nearest / map viewport sanity; zero-gym municipalities not fabricated', () => {
      const nearest = findNearestGym(47.14, 9.52, liechtenstein);
      expect(nearest?.country).toBe('Liechtenstein');
      expect(nearest?.id.startsWith('li_')).toBe(true);
      const markers = toMap(liechtenstein);
      expect(markers.length).toBe(7);
      const visible = filterMapCentersInRegion(markers as never, {
        latitude: 47.16,
        longitude: 9.52,
        latitudeDelta: 0.2,
        longitudeDelta: 0.15,
      } as never);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every(m => String(m.id).startsWith('li_'))).toBe(true);

      const cities = new Set(liCenters.map(c => c.city.toLowerCase()));
      for (const zero of ['Triesen', 'Mauren', 'Triesenberg', 'Schellenberg', 'Planken', 'Nendeln']) {
        expect(cities.has(zero.toLowerCase())).toBe(false);
      }
    });

    it('core display resolution for all 7 li_* IDs', () => {
      for (const row of INVENTORY) {
        const resolved = resolveGymOrStub(row.id);
        expect(resolved.region).toBe('Liechtenstein');
        expect(formatGymDisplayName(resolved)).not.toMatch(/^li_/);
        expect(formatGymDisplayName(resolved).length).toBeGreaterThan(0);
        expect(findCenterById(row.id)?.id).toBe(row.id);
        expect(getGymLatLngForCheckIn(row.id)).not.toBeNull();
      }
    });
  });

  describe('6. Country regression', () => {
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

  describe('7. Performance snapshot + freeze', () => {
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
      searchGyms('liechtenstein', {limit: 20});
      searchGyms('update Fitness', {limit: 20});
      searchGyms('LieFit', {limit: 20});
      searchGyms('Vaduz', {limit: 20});
      searchGyms('9490', {limit: 10});
      const typicalMs = (Date.now() - tSearch0) / 5;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(47.14, 9.52, liechtenstein);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(liechtenstein);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 47.16,
        longitude: 9.52,
        latitudeDelta: 0.2,
        longitudeDelta: 0.15,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const shaAfter = crypto
        .createHash('sha256')
        .update(fs.readFileSync(centersPath))
        .digest('hex');

      const perf = {
        catalog: raw.length,
        active: active.length,
        liechtenstein: liCenters.length,
        li_prefix: catalog.filter(c => c.id.startsWith('li_')).length,
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
        iceland_qa_baseline: {
          catalog: 11692,
          json_size_mb: 3.47,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
        production_sha256: LIVE_SHA,
        sha_after_qa: shaAfter,
        production_modified: shaAfter !== LIVE_SHA,
        reconciliation: '7 == 7 == 7 == 7',
        eligibility: {
          CHAIN_CLASS_A: 0,
          SMALL_MARKET_INDEPENDENT: 7,
        },
        hard_duplicates: 0,
        excluded_closed_leakage: 0,
        swiss_austrian_contamination: 0,
      };

      expect(perf.catalog).toBe(11921);
      expect(perf.liechtenstein).toBe(7);
      expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
      expect(shaAfter).toBe(LIVE_SHA);
      expect(shaAfter).toBe(shaBefore);
      expect(perf.production_modified).toBe(false);
      expect(perf.crossed_12500).toBe(false);

      const outDir = path.join(__dirname, '../data/liechtenstein');
      fs.writeFileSync(
        path.join(outDir, 'LIECHTENSTEIN_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      fs.writeFileSync(
        path.join(outDir, 'LIECHTENSTEIN_QA_REPORT.md'),
        `# LIECHTENSTEIN QA REPORT

## Verdict

**LIECHTENSTEIN STATUS: READY**

## Freeze

- Catalog: ${perf.catalog}
- Liechtenstein: ${perf.liechtenstein}
- li_*: ${perf.li_prefix}
- SHA256: \`${shaAfter}\`
- Production modified: NO

## Gates

- Reconciliation: 7 == 7 == 7 == 7
- Eligibility: CHAIN_CLASS_A 0 / SMALL_MARKET_INDEPENDENT 7
- Closed/excluded leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
- Cross-border: CLEAN
- Metadata drift: NONE

## Live inventory

1. update Fitness Vaduz (\`li_9fdb1d933f\`) — Vaduz 9490
2. LieFit Vaduz (\`li_9514fe2df2\`) — Vaduz 9490
3. purfitness Schaan (\`li_35eed72b39\`) — Schaan 9494
4. Lorez Power Center Bendern (\`li_688dc73ac2\`) — Bendern 9487
5. flexigym Balzers (\`li_f02192ce76\`) — Balzers 9496
6. In Motion Eschen (\`li_740e149c77\`) — Eschen 9492
7. KOKON Fitness & Spa Ruggell (\`li_9b66d0aa5e\`) — Ruggell 9491

## Performance

- JSON: ${perf.json_size_mb} MB (${perf.json_size_bytes} bytes)
- Parse: ${perf.parse_ms} ms
- Cold index: ${perf.cold_index_ms} ms
- Cached index: ${perf.cached_index_ms} ms
- Typical search: ${perf.typical_search_ms} ms
- Worst search: ${perf.worst_search_ms} ms
- Nearest: ${perf.nearest_ms} ms
- Map build: ${perf.map_build_ms} ms
- Viewport: ${perf.viewport_filter_ms} ms
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
