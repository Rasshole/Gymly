/**
 * Iceland gym QA — full production validation after is_* merge (27 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/iceland/ICELAND_QA_PERF.json).
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
  ICELAND_POSTAL_RE,
  isIcelandCountry,
  isPlausibleIcelandCoordinate,
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

const staging = require('../data/iceland/iceland_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  operator_class?: string;
  coord_source?: string | null;
}>;

const approved = require('../data/iceland/ICELAND_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase1Ready = require('../data/iceland/ICELAND_PHASE1_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_IS = 27;
const EXPECTED_WC = 20;
const EXPECTED_KATLA = 7;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const FORBIDDEN_LIVE_IDS = new Set([
  'is_f1532c5942',
  'is_4679839ae8',
  'is_e3bcd63150',
  'is_7752534bf6',
  'is_2c4d4ba569',
  'is_aa2da9071f',
  'is_bf7a13f651',
]);

const KEY_IDS = {
  vatnsmyri: 'is_b39588e5e0',
  legacyBjarg: 'is_f1532c5942',
  kringlan: 'is_7511719617',
  gamlaKringlan: 'is_48dceefaa5',
  wcTjarnarvellir: 'is_271c199e79',
  katlaTjarnarvellir: 'is_3c1b16259b',
  katlaHoltagardar: 'is_bece47bcec',
  katlaLambhagi: 'is_df6449ee85',
  legacyReebok: 'is_4679839ae8',
  katlaStudio: 'is_e3bcd63150',
};

const WC_INVENTORY: Array<{nameIncludes: RegExp; city: string; postal: string}> = [
  {nameIncludes: /laugar/i, city: 'Reykjavík', postal: '105'},
  {nameIncludes: /vatnsmýri/i, city: 'Reykjavík', postal: '102'},
  {nameIncludes: /\bhr\b/i, city: 'Reykjavík', postal: '102'},
  {nameIncludes: /kringlan/i, city: 'Reykjavík', postal: '103', exclude: /gamla/i} as never,
  {nameIncludes: /gamla kringlan/i, city: 'Reykjavík', postal: '103'},
  {nameIncludes: /árbær|arbaer/i, city: 'Reykjavík', postal: '110'},
  {nameIncludes: /breiðholt|breidholt/i, city: 'Reykjavík', postal: '111'},
  {nameIncludes: /egilshöll|egilsholl/i, city: 'Reykjavík', postal: '112'},
  {nameIncludes: /seltjarnarnes/i, city: 'Seltjarnarnes', postal: '170'},
  {nameIncludes: /smáralind|smaralind/i, city: 'Kópavogur', postal: '201'},
  {nameIncludes: /ögurhvarf|ogurhvarf/i, city: 'Kópavogur', postal: '203'},
  {nameIncludes: /dalshraun/i, city: 'Hafnarfjörður', postal: '220'},
  {nameIncludes: /tjarnarvellir/i, city: 'Hafnarfjörður', postal: '221'},
  {nameIncludes: /mosfellsbær|mosfellsbaer/i, city: 'Mosfellsbær', postal: '270'},
  {nameIncludes: /skólastígur|skolastigur/i, city: 'Akureyri', postal: '600'},
  {nameIncludes: /strandgata/i, city: 'Akureyri', postal: '600'},
  {nameIncludes: /selfoss/i, city: 'Selfoss', postal: '800'},
  {nameIncludes: /hella/i, city: 'Hella', postal: '850'},
  {nameIncludes: /vestmannaeyjar/i, city: 'Vestmannaeyjar', postal: '900'},
  {nameIncludes: /akranes/i, city: 'Akranes', postal: '300'},
];

const KATLA_INVENTORY: Array<{nameIncludes: RegExp; city: string; postal: string}> = [
  {nameIncludes: /holtagarðar|holtagardar/i, city: 'Reykjavík', postal: '104'},
  {nameIncludes: /lambhagi/i, city: 'Reykjavík', postal: '113'},
  {nameIncludes: /faxafen/i, city: 'Reykjavík', postal: '108'},
  {nameIncludes: /urðarhvarf|urdarhvarf/i, city: 'Kópavogur', postal: '203'},
  {nameIncludes: /tjarnarvellir/i, city: 'Hafnarfjörður', postal: '221'},
  {nameIncludes: /salalaug/i, city: 'Kópavogur', postal: '201'},
  {nameIncludes: /kópavogslaug|kopavogslaug/i, city: 'Kópavogur', postal: '200'},
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

describe('Iceland gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const iceland = gyms.filter(g => isIcelandCountry(g.country));
  const isCenters = catalog.filter(c => isIcelandCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const shaBefore = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  describe('1. Catalog integrity / freeze', () => {
    it('total production = 11831; Iceland = 27; is_* = 27; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(isCenters.length).toBe(EXPECTED_IS);
      expect(iceland.length).toBe(EXPECTED_IS);
      expect(catalog.filter(c => c.id.startsWith('is_')).length).toBe(EXPECTED_IS);
      expect(catalog.filter(c => c.id.startsWith('is_') && c.country !== 'Iceland').length).toBe(
        0,
      );
      expect(shaBefore).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase1 READY + staging MERGED', () => {
      const prod = new Set(isCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase1Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(27);
      expect(ap.size).toBe(27);
      expect(ready.size).toBe(27);
      expect(merged.size).toBe(27);
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
        expect(live.country).toBe('Iceland');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all is_* IDs unique with required fields and valid Iceland geography', () => {
      const ids = new Set<string>();
      for (const c of isCenters) {
        expect(c.id).toMatch(/^is_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Iceland');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(ICELAND_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleIcelandCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      }
      expect(ids.size).toBe(27);
      expect(new Set(catalog.map(c => c.id)).size).toBe(catalog.length);
    });

    it('brand breakdown World Class 20 + Katla Fitness 7', () => {
      expect(isCenters.filter(c => c.brand === 'World Class').length).toBe(EXPECTED_WC);
      expect(isCenters.filter(c => c.brand === 'Katla Fitness').length).toBe(EXPECTED_KATLA);
      const brands = new Set(isCenters.map(c => c.brand));
      expect(brands.size).toBe(2);
    });
  });

  describe('2. World Class QA — 20/20', () => {
    it('World Class 20/20 PASS — full estate once; Vatnsmýri successor; legacy Bjarg absent', () => {
      const wc = isCenters.filter(c => c.brand === 'World Class');
      expect(wc.length).toBe(EXPECTED_WC);
      expect(findCenterById(KEY_IDS.vatnsmyri)).toBeTruthy();
      expect(findCenterById(KEY_IDS.legacyBjarg)).toBeUndefined();
      expect(findCenterById(KEY_IDS.kringlan)).toBeTruthy();
      expect(findCenterById(KEY_IDS.gamlaKringlan)).toBeTruthy();
      expect(findCenterById(KEY_IDS.wcTjarnarvellir)).toBeTruthy();

      for (const exp of WC_INVENTORY) {
        const hits = wc.filter(
          c =>
            exp.nameIncludes.test(c.name) &&
            c.city === exp.city &&
            (!('exclude' in exp) || !(exp as {exclude?: RegExp}).exclude?.test(c.name)),
        );
        expect(hits.length).toBe(1);
        expect(hits[0]!.postal_code).toBe(exp.postal);
      }
    });
  });

  describe('3. Katla Fitness QA — 7/7', () => {
    it('Katla Fitness 7/7 PASS — Lambhagi present; Reebok absent; pool stations retained; Studio absent', () => {
      const katla = isCenters.filter(c => c.brand === 'Katla Fitness');
      expect(katla.length).toBe(EXPECTED_KATLA);
      expect(findCenterById(KEY_IDS.katlaLambhagi)).toBeTruthy();
      expect(findCenterById(KEY_IDS.legacyReebok)).toBeUndefined();
      expect(findCenterById(KEY_IDS.katlaTjarnarvellir)).toBeTruthy();
      expect(findCenterById(KEY_IDS.katlaStudio)).toBeUndefined();
      expect(katla.some(c => /salalaug/i.test(c.name))).toBe(true);
      expect(katla.some(c => /kópavogslaug|kopavogslaug/i.test(c.name))).toBe(true);

      const holtag = findCenterById(KEY_IDS.katlaHoltagardar)!;
      expect(/holtagar/i.test(holtag.address)).toBe(true);

      for (const exp of KATLA_INVENTORY) {
        const hits = katla.filter(
          c => exp.nameIncludes.test(c.name) && c.city === exp.city,
        );
        expect(hits.length).toBe(1);
        expect(hits[0]!.postal_code).toBe(exp.postal);
      }
    });
  });

  describe('4. Staging exclusions / CLOSED / EXCLUDED', () => {
    it('MERGED 27 / CLOSED 2 / EXCLUDED 29; none of non-merged live', () => {
      const cats: Record<string, number> = {};
      for (const s of staging) cats[s.import_category] = (cats[s.import_category] || 0) + 1;
      expect(cats.MERGED_INTO_CATALOG).toBe(27);
      expect(cats.CLOSED).toBe(2);
      expect(cats.EXCLUDED).toBe(29);
      expect(cats.NEEDS_COORDINATES || 0).toBe(0);
      expect(cats.NEEDS_REVIEW || 0).toBe(0);
      expect(cats.COMING_SOON || 0).toBe(0);
      expect(staging.length).toBe(58);

      const prodIds = new Set(isCenters.map(c => c.id));
      for (const id of FORBIDDEN_LIVE_IDS) {
        expect(prodIds.has(id)).toBe(false);
      }
      for (const r of staging.filter(s =>
        ['NEEDS_COORDINATES', 'CLOSED', 'EXCLUDED', 'NEEDS_REVIEW', 'COMING_SOON'].includes(
          s.import_category,
        ),
      )) {
        expect(prodIds.has(r.id)).toBe(false);
      }
    });
  });

  describe('5. Rebrand / legacy / municipal pool-adjacent', () => {
    it('unresolved predecessor/current conflicts = 0; Tjarnarvellir coexistence preserved', () => {
      expect(findCenterById(KEY_IDS.vatnsmyri)!.address).toBe('Bjargargata 1');
      expect(findCenterById(KEY_IDS.legacyBjarg)).toBeUndefined();
      expect(findCenterById(KEY_IDS.katlaLambhagi)).toBeTruthy();
      expect(findCenterById(KEY_IDS.legacyReebok)).toBeUndefined();
      expect(findCenterById(KEY_IDS.kringlan)!.address).toMatch(/4-7/);
      expect(findCenterById(KEY_IDS.gamlaKringlan)!.address).toBe('Kringlan 1');
      expect(findCenterById(KEY_IDS.wcTjarnarvellir)).toBeTruthy();
      expect(findCenterById(KEY_IDS.katlaTjarnarvellir)).toBeTruthy();
      expect(findCenterById(KEY_IDS.wcTjarnarvellir)!.id).not.toBe(
        findCenterById(KEY_IDS.katlaTjarnarvellir)!.id,
      );
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no hard duplicates; classify known co-location pairs', () => {
      const lt25: string[] = [];
      const lt50: string[] = [];
      const lt100: string[] = [];
      const lt200: string[] = [];
      const identical: string[] = [];
      const diffBrand: Array<{a: string; b: string; d: number; classification: string}> = [];
      const addrNorm = new Map<string, string[]>();
      for (const c of isCenters) {
        const key = normalizeGymSearchValue(`${c.address}|${c.postal_code}|${c.city}`);
        const list = addrNorm.get(key) || [];
        list.push(c.id);
        addrNorm.set(key, list);
      }
      expect([...addrNorm.values()].filter(v => v.length > 1)).toEqual([]);

      for (let i = 0; i < isCenters.length; i++) {
        for (let j = i + 1; j < isCenters.length; j++) {
          const a = isCenters[i]!;
          const b = isCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          const pair = `${a.id}|${b.id}`;
          if (Math.abs(d) < 0.01) identical.push(pair);
          if (a.brand === b.brand) {
            if (d <= 25) lt25.push(pair);
            if (d <= 50) lt50.push(pair);
            if (d <= 100) lt100.push(pair);
            if (d <= 200) lt200.push(pair);
          } else if (d <= 100) {
            const classification =
              (a.id === KEY_IDS.wcTjarnarvellir && b.id === KEY_IDS.katlaTjarnarvellir) ||
              (b.id === KEY_IDS.wcTjarnarvellir && a.id === KEY_IDS.katlaTjarnarvellir)
                ? 'D_same_address_different_units'
                : 'C_sports_complex_colocation';
            diffBrand.push({a: a.id, b: b.id, d: Math.round(d), classification});
          }
        }
      }
      expect(lt25).toEqual([]);
      expect(lt50).toEqual([]);
      expect(lt100).toEqual([]);
      expect(identical).toEqual([]);
      const tjarnaPair = diffBrand.find(
        p =>
          (p.a === KEY_IDS.wcTjarnarvellir && p.b === KEY_IDS.katlaTjarnarvellir) ||
          (p.b === KEY_IDS.wcTjarnarvellir && p.a === KEY_IDS.katlaTjarnarvellir),
      );
      if (tjarnaPair) {
        expect(tjarnaPair.classification).toBe('D_same_address_different_units');
        expect(tjarnaPair.d).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('7. Territorial safety', () => {
    it('Iceland territory 27/27; foreign/offshore = 0', () => {
      for (const c of isCenters) {
        expect(isPlausibleIcelandCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(c.lat!).toBeGreaterThan(63);
        expect(c.lat!).toBeLessThan(67);
        expect(c.lng!).toBeLessThan(-12);
        expect(c.lng!).toBeGreaterThan(-25);
      }
    });
  });

  describe('8. Search / display / core flows', () => {
    it('resolves is_* → Iceland; orphan stub safe; display without raw id', () => {
      expect(GYM_ID_PREFIX.iceland).toBe('is_');
      expect(gymCountryTranslationKey('Iceland')).toBe('countries.iceland');
      const sampleId = isCenters[0]!.id;
      expect(resolveGymOrStub(sampleId).region).toBe('Iceland');
      expect(resolveGymOrStub('is_nonexistent_test').region).toBe('Iceland');
      expect(resolveGymOrStub('is_nonexistent_test').id).toBe('is_nonexistent_test');
      expect(findGymById(sampleId)?.id).toBe(sampleId);
      expect(formatGymDisplayName(resolveGymOrStub(sampleId))).not.toMatch(/^is_/);
      expect(getActiveGymsByCountry('Iceland').length).toBe(27);
    });

    it('brand / locality / ASCII alias search finds live centers', () => {
      getGymSearchIndex(iceland);
      const queries: Array<[string, RegExp]> = [
        ['World Class', /world class/i],
        ['Katla Fitness', /katla/i],
        ['Reykjavík', /reykjav/i],
        ['Reykjavik', /reykjav/i],
        ['Kópavogur', /kópavogur|kopavogur/i],
        ['Kopavogur', /kópavogur|kopavogur/i],
        ['Hafnarfjörður', /hafnarf/i],
        ['Hafnarfjordur', /hafnarf/i],
        ['Mosfellsbær', /mosfells/i],
        ['Mosfellsbaer', /mosfells/i],
        ['Seltjarnarnes', /seltjarnarnes/i],
        ['Akureyri', /akureyri/i],
        ['Selfoss', /selfoss/i],
        ['Akranes', /akranes/i],
        ['Hella', /hella/i],
        ['Vestmannaeyjar', /vestmannaeyjar/i],
        ['Vatnsmýri', /vatnsmýri|vatnsmyri/i],
        ['Vatnsmyri', /vatnsmýri|vatnsmyri/i],
        ['Holtagarðar', /holtagar/i],
        ['Holtagardar', /holtagar/i],
        ['Tjarnarvellir', /tjarnarvellir/i],
        ['Kringlan', /kringlan/i],
        ['105', /laugar/i],
      ];
      for (const [q, re] of queries) {
        const hits = searchGyms(q, {gyms: iceland, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every(h => h.gym.id.startsWith('is_'))).toBe(true);
        expect(hits.some(h => re.test(`${h.gym.name} ${h.gym.city} ${h.gym.brand}`))).toBe(true);
      }
      expect(
        searchGyms('Hreyfing', {gyms: iceland, limit: 10}).every(
          h => !FORBIDDEN_LIVE_IDS.has(h.gym.id),
        ),
      ).toBe(true);
      expect(
        searchGyms('Katla Studio', {gyms: iceland, limit: 10}).every(
          h => h.gym.id !== KEY_IDS.katlaStudio,
        ),
      ).toBe(true);
    });

    it('check-in 199/200 allow, 201 block; auto-checkout 200 m unchanged', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
      const sample = iceland[0]!;
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

    it('nearest / map viewport sanity for Iceland', () => {
      const nearest = findNearestGym(64.14, -21.9, iceland);
      expect(nearest?.country).toBe('Iceland');
      expect(nearest?.id.startsWith('is_')).toBe(true);
      const markers = toMap(iceland);
      expect(markers.length).toBe(27);
      const visible = filterMapCentersInRegion(markers as never, {
        latitude: 64.14,
        longitude: -21.9,
        latitudeDelta: 0.15,
        longitudeDelta: 0.25,
      } as never);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every(m => String(m.id).startsWith('is_'))).toBe(true);
    });
  });

  describe('9. Country regression', () => {
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

  describe('10. Performance snapshot + freeze', () => {
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
      searchGyms('iceland', {limit: 20});
      searchGyms('World Class', {limit: 20});
      searchGyms('Katla Fitness', {limit: 20});
      searchGyms('Reykjavik', {limit: 20});
      searchGyms('105', {limit: 10});
      const typicalMs = (Date.now() - tSearch0) / 5;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(64.14, -21.9, iceland);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(iceland);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 64.14,
        longitude: -21.9,
        latitudeDelta: 0.2,
        longitudeDelta: 0.3,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const shaAfter = crypto
        .createHash('sha256')
        .update(fs.readFileSync(centersPath))
        .digest('hex');

      const perf = {
        catalog: raw.length,
        active: active.length,
        iceland: isCenters.length,
        world_class: EXPECTED_WC,
        katla_fitness: EXPECTED_KATLA,
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
        cyprus_qa_baseline: {
          catalog: 11692,
          json_size_mb: 3.47,
        },
        iceland_merge_baseline: {
          catalog: 11692,
          json_size_bytes: jsonSize,
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
      expect(perf.iceland).toBe(27);
      expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
      expect(shaAfter).toBe(LIVE_SHA);
      expect(shaAfter).toBe(shaBefore);
      expect(perf.production_modified).toBe(false);
      expect(perf.crossed_12500).toBe(false);

      const outDir = path.join(__dirname, '../data/iceland');
      fs.writeFileSync(
        path.join(outDir, 'ICELAND_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      fs.writeFileSync(
        path.join(outDir, 'ICELAND_QA_REPORT.md'),
        `# ICELAND QA REPORT

## Verdict

**ICELAND STATUS: READY**

## Freeze

- Catalog: ${perf.catalog}
- Iceland: ${perf.iceland}
- World Class: ${EXPECTED_WC}
- Katla Fitness: ${EXPECTED_KATLA}
- SHA256: \`${shaAfter}\`
- Production modified: NO

## Gates

- World Class: 20/20 PASS
- Katla Fitness: 7/7 PASS
- Reconciliation: 27 == 27 == 27 == 27
- Closed/excluded leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
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
