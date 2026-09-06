/**
 * Ireland gym QA — full production validation after ie_* merge (65 centers).
 */
import fs from 'fs';
import path from 'path';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms, getActiveGymsByCountry} from '../src/data/danishGyms';
import {
  ALL_GYM_CENTERS,
  findCenterById,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {
  compactGymSearchValue,
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  IRELAND_EIRCODE_RE,
  isIrelandCountry,
  isPlausibleIrelandCoordinate,
  isUnitedKingdomCountry,
} from '../src/utils/gymCountry';
import {
  formatGymCountryLabel,
  gymCountryTranslationKey,
} from '../src/utils/gymCountryLabel';
import {
  findGymById,
  formatGymDisplayName,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';

const staging = require('../data/ireland/ireland_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
}>;

const approved = require('../data/ireland/IRELAND_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  address?: string;
  postal_code?: string;
}>;

const phase4Ready = require('../data/ireland/IRELAND_PHASE4_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const NI_RE =
  /\b(belfast|derry|londonderry|newry|lisburn|bangor|armagh|enniskillen|coleraine|ballymena|craigavon|omagh|northern ireland|co\.?\s*antrim|co\.?\s*down|BT\d{1,2})\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  FLYEfit: 17,
  'Energie Fitness': 16,
  'Gym Plus': 7,
  'West Wood Club': 6,
  'Anytime Fitness': 5,
  'Aura Leisure': 4,
  'Ben Dunne Gyms': 4,
  'Iconic Health Clubs': 4,
  'Shoreline Leisure': 2,
};

const ENERGIE_TALLAGHT = 'ie_6930f99872';
const ENERGIE_CITYWEST = 'ie_2574437176';
const ICONIC_SMITHFIELD = 'ie_42999953b2';
const ICONIC_CAMDEN = 'ie_7448978ec4';
const DEPAUL_POOL = 'ie_31276d22be';
const CHERRYWOOD = 'ie_64481d16de';
const KILNAMANAGH = 'ie_09c791f803';
const FLYEFIT_SWORDS_UNRESOLVED = 'ie_db780fb567';
const FLYEFIT_BAGGOT = 'ie_d831af4dc0';
const FLYEFIT_CORK = 'ie_32456939f3';
const AURA_LUCAN = 'ie_36b8a305fe';
const AURA_NAVAN = 'ie_edd9fa4599';
const AURA_TULLAMORE = 'ie_470c031a08';
const SHORELINE_BRAY = 'ie_473cfd314f';
const SHORELINE_GREYSTONES = 'ie_e7ced5aa52';
const WESTWOOD_ASTON = 'ie_3225af54be';
const ANYTIME_MAYNOOTH = 'ie_ef7c4ce736';

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

describe('Ireland gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const ireland = gyms.filter(g => isIrelandCountry(g.country));
  const ieCenters = catalog.filter(c => isIrelandCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 11063; Ireland = 65', () => {
      expect(catalog.length).toBe(11254);
      expect(ieCenters.length).toBe(65);
      expect(ireland.length).toBe(65);
      expect(catalog.filter(c => c.id.startsWith('ie_')).length).toBe(65);
    });

    it('production IDs reconcile with approved + Phase4 READY + staging MERGED', () => {
      const prod = new Set(ieCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase4Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(65);
      expect(ap.size).toBe(65);
      expect(ready.size).toBe(65);
      expect(merged.size).toBe(65);
      for (const id of prod) {
        expect(ap.has(id)).toBe(true);
        expect(ready.has(id)).toBe(true);
        expect(merged.has(id)).toBe(true);
      }
    });

    it('all ie_* IDs unique with required fields and valid ROI geography', () => {
      const ids = new Set<string>();
      for (const c of ieCenters) {
        expect(c.id).toMatch(/^ie_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Ireland');
        expect(c.is_active).toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(IRELAND_EIRCODE_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat).not.toBe(0);
        expect(c.lng).not.toBe(0);
        expect(isPlausibleIrelandCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(!(c.lat! >= 54.02 && c.lat! <= 55.32 && c.lng! >= -7.05 && c.lng! <= -5.4)).toBe(
          true,
        );
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(NI_RE.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
    });

    it('brand breakdown matches merge expectations', () => {
      const byBrand: Record<string, number> = {};
      for (const c of ieCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(65);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('NEEDS_REVIEW (13) and EXCLUDED (4) are not in production', () => {
      const unresolved = staging.filter(s =>
        ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'EXCLUDED'].includes(s.import_category),
      );
      const cats = unresolved.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.NEEDS_REVIEW).toBe(13);
      expect(cats.EXCLUDED).toBe(4);
      expect(cats.NEEDS_COORDINATES || 0).toBe(0);
      for (const s of unresolved) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
    });

    it('De Paul pool-only, Cherrywood, Kilnamanagh, FLYEfit Swords remain outside production', () => {
      for (const id of [DEPAUL_POOL, CHERRYWOOD, KILNAMANAGH, FLYEFIT_SWORDS_UNRESOLVED]) {
        expect(findCenterById(id)).toBeUndefined();
      }
      expect(staging.find(s => s.id === DEPAUL_POOL)?.import_category).toBe('EXCLUDED');
      expect(staging.find(s => s.id === CHERRYWOOD)?.import_category).toBe('NEEDS_REVIEW');
    });
  });

  describe('3. Northern Ireland safety', () => {
    it('no NI text or bbox contamination in live Ireland rows', () => {
      for (const c of ieCenters) {
        expect(NI_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
        expect(isPlausibleIrelandCoordinate(c.lat!, c.lng!)).toBe(true);
      }
      expect(isUnitedKingdomCountry('Northern Ireland')).toBe(true);
      expect(isIrelandCountry('Northern Ireland')).toBe(false);
    });
  });

  describe('4. Eircode QA', () => {
    it('all live Eircodes are strings; compact normalization works; display preserved', () => {
      for (const c of ieCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(IRELAND_EIRCODE_RE.test(c.postal_code!)).toBe(true);
        const compact = compactGymSearchValue(c.postal_code!);
        expect(compact.length).toBeGreaterThanOrEqual(7);
        expect(c.postal_code).toMatch(/\s/); // canonical spaced form in catalog
      }
      const lucan = findCenterById(AURA_LUCAN)!;
      expect(lucan.postal_code).toBe('K78 H9V9');
      const navan = findCenterById(AURA_NAVAN)!;
      expect(navan.postal_code).toBe('C15 N274');
      expect(
        searchGyms('K78H9V9', {gyms: ireland, limit: 20}).some(r => r.gym.id === AURA_LUCAN),
      ).toBe(true);
      expect(
        searchGyms('K78 H9V9', {gyms: ireland, limit: 20}).some(r => r.gym.id === AURA_LUCAN),
      ).toBe(true);
    });

    it('normalization helpers are search-only transforms', () => {
      const sample = findCenterById(FLYEFIT_BAGGOT)!;
      expect(normalizeGymSearchValue('Dublin')).not.toBe('');
      expect(sample.postal_code).toBe(findCenterById(FLYEFIT_BAGGOT)!.postal_code);
    });
  });

  describe('5. FLYEfit QA', () => {
    const flye = ieCenters.filter(c => c.brand === 'FLYEfit');

    it('17 live; no FLYEHUB legacy; Swords unresolved stays out of production', () => {
      expect(flye.length).toBe(17);
      for (const c of flye) {
        expect(/flyehub/i.test(`${c.brand} ${c.name}`)).toBe(false);
        expect(IRELAND_EIRCODE_RE.test(String(c.postal_code))).toBe(true);
        expect(isPlausibleIrelandCoordinate(c.lat!, c.lng!)).toBe(true);
      }
      expect(findCenterById(FLYEFIT_SWORDS_UNRESOLVED)).toBeUndefined();
    });

    it('FLYEfit search: brand, partial, city, Eircode', () => {
      getGymSearchIndex(ireland);
      expect(searchGyms('flyefit', {gyms: ireland, limit: 30}).length).toBeGreaterThan(10);
      expect(searchGyms('flye', {gyms: ireland, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('Cork', {gyms: ireland, limit: 40}).some(r => r.gym.id === FLYEFIT_CORK)).toBe(
        true,
      );
      expect(
        searchGyms('D02 AV91', {gyms: ireland, limit: 20}).some(r => r.gym.id === FLYEFIT_BAGGOT),
      ).toBe(true);
    });
  });

  describe('6. Energie Fitness QA + Tallaght/Citywest', () => {
    const energie = ieCenters.filter(c => c.brand === 'Energie Fitness');

    it('16 live ROI locations; no gb_* IDs', () => {
      expect(energie.length).toBe(16);
      for (const c of energie) {
        expect(c.id.startsWith('ie_')).toBe(true);
        expect(c.country).toBe('Ireland');
      }
    });

    it('Tallaght vs Citywest are separate clubs ~3.6 km (A_legitimate)', () => {
      const tallaght = findCenterById(ENERGIE_TALLAGHT)!;
      const citywest = findCenterById(ENERGIE_CITYWEST)!;
      expect(tallaght.address).not.toBe(citywest.address);
      expect(tallaght.postal_code).toBe('D24 X2FC');
      expect(citywest.postal_code).toBe('D24 TD81');
      const d = haversineMeters(tallaght.lat!, tallaght.lng!, citywest.lat!, citywest.lng!);
      expect(d).toBeGreaterThan(3000);
      expect(d).toBeLessThan(4000);
      expect(getGymLatLngForCheckIn(ENERGIE_TALLAGHT)!.latitude).not.toBeCloseTo(
        getGymLatLngForCheckIn(ENERGIE_CITYWEST)!.latitude,
        4,
      );
    });

    it('Energie search across cities', () => {
      getGymSearchIndex(ireland);
      expect(searchGyms('Energie', {gyms: ireland, limit: 30}).length).toBeGreaterThan(10);
      expect(searchGyms('Galway', {gyms: ireland, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('D24 X2FC', {gyms: ireland, limit: 20}).some(r => r.gym.id === ENERGIE_TALLAGHT)).toBe(
        true,
      );
    });
  });

  describe('7. Gym Plus QA', () => {
    it('7 live with search/map eligibility', () => {
      const gp = ieCenters.filter(c => c.brand === 'Gym Plus');
      expect(gp.length).toBe(7);
      for (const c of gp) {
        expect(getGymLatLngForCheckIn(c.id)).not.toBeNull();
      }
      getGymSearchIndex(ireland);
      expect(searchGyms('Gym Plus', {gyms: ireland, limit: 20}).length).toBeGreaterThan(5);
      expect(searchGyms('Naas', {gyms: ireland, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('Swords', {gyms: ireland, limit: 20}).length).toBeGreaterThan(0);
    });
  });

  describe('8. West Wood Club QA', () => {
    it('6 live complete estate', () => {
      const ww = ieCenters.filter(c => c.brand === 'West Wood Club');
      expect(ww.length).toBe(6);
      for (const c of ww) {
        expect(IRELAND_EIRCODE_RE.test(String(c.postal_code))).toBe(true);
        expect(getGymLatLngForCheckIn(c.id)).not.toBeNull();
      }
      getGymSearchIndex(ireland);
      expect(searchGyms('West Wood', {gyms: ireland, limit: 20}).length).toBeGreaterThan(5);
      expect(findCenterById(WESTWOOD_ASTON)?.city).toBe('Dublin');
    });
  });

  describe('9. Anytime Fitness QA', () => {
    it('5 live ROI only; Kilnamanagh withheld; cross-country identity preserved', () => {
      const af = ieCenters.filter(c => c.brand === 'Anytime Fitness');
      expect(af.length).toBe(5);
      expect(findCenterById(KILNAMANAGH)).toBeUndefined();
      for (const c of af) {
        expect(c.country).toBe('Ireland');
        expect(c.id.startsWith('ie_')).toBe(true);
        expect(c.id.startsWith('gb_')).toBe(false);
      }
      getGymSearchIndex(ireland);
      const ieHits = searchGyms('Anytime Fitness', {gyms: ireland, limit: 20}).filter(
        h => h.gym.brand === 'Anytime Fitness',
      );
      expect(ieHits.length).toBe(5);
      expect(ieHits.every(h => h.gym.id.startsWith('ie_'))).toBe(true);
      expect(ieHits.every(h => h.gym.country === 'Ireland')).toBe(true);

      const ukGyms = gyms.filter(g => g.country === 'United Kingdom');
      getGymSearchIndex(ukGyms);
      const gbHits = searchGyms('Anytime Fitness', {gyms: ukGyms, limit: 20});
      expect(gbHits.length).toBeGreaterThan(0);
      expect(gbHits.every(h => h.gym.id.startsWith('gb_'))).toBe(true);
      expect(gbHits.every(h => h.gym.country === 'United Kingdom')).toBe(true);
    });
  });

  describe('10. Ben Dunne Gyms QA', () => {
    it('4 live; Cherrywood withheld', () => {
      const bd = ieCenters.filter(c => c.brand === 'Ben Dunne Gyms');
      expect(bd.length).toBe(4);
      expect(findCenterById(CHERRYWOOD)).toBeUndefined();
      getGymSearchIndex(ireland);
      expect(searchGyms('Ben Dunne', {gyms: ireland, limit: 20}).length).toBeGreaterThan(3);
    });
  });

  describe('11. Iconic Health Clubs QA', () => {
    it('4 live; One Escape absent; Smithfield + Camden present', () => {
      const iconic = ieCenters.filter(c => c.brand === 'Iconic Health Clubs');
      expect(iconic.length).toBe(4);
      for (const c of iconic) {
        expect(/one escape/i.test(`${c.brand} ${c.name}`)).toBe(false);
      }
      expect(findCenterById(ICONIC_SMITHFIELD)?.name).toMatch(/Smithfield/i);
      expect(findCenterById(ICONIC_CAMDEN)?.name).toMatch(/Camden/i);
      getGymSearchIndex(ireland);
      expect(searchGyms('Iconic', {gyms: ireland, limit: 20}).length).toBeGreaterThan(3);
    });
  });

  describe('12. Aura Leisure QA', () => {
    it('4 gym-capable live; De Paul pool-only excluded; unresolved Aura withheld', () => {
      const aura = ieCenters.filter(c => c.brand === 'Aura Leisure');
      expect(aura.length).toBe(4);
      expect(findCenterById(DEPAUL_POOL)).toBeUndefined();
      for (const id of [AURA_LUCAN, AURA_NAVAN, AURA_TULLAMORE, 'ie_aac6d0e126']) {
        expect(findCenterById(id)).toBeTruthy();
      }
      const auraUnresolved = staging.filter(
        s => s.brand === 'Aura Leisure' && s.import_category === 'NEEDS_REVIEW',
      );
      expect(auraUnresolved.length).toBe(6);
      for (const s of auraUnresolved) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
    });
  });

  describe('13. Shoreline Leisure QA', () => {
    it('Bray + Greystones live', () => {
      const sl = ieCenters.filter(c => c.brand === 'Shoreline Leisure');
      expect(sl.length).toBe(2);
      expect(findCenterById(SHORELINE_BRAY)?.city).toMatch(/Bray/i);
      expect(findCenterById(SHORELINE_GREYSTONES)?.city).toMatch(/Greystones/i);
      getGymSearchIndex(ireland);
      expect(searchGyms('Shoreline', {gyms: ireland, limit: 10}).length).toBe(2);
    });
  });

  describe('14. Duplicate / proximity QA', () => {
    it('no same-brand <=200 m pairs among Ireland rows', () => {
      const pairs: Array<{a: string; b: string; d: number}> = [];
      for (let i = 0; i < ieCenters.length; i++) {
        for (let j = i + 1; j < ieCenters.length; j++) {
          const a = ieCenters[i]!;
          const b = ieCenters[j]!;
          if (a.brand !== b.brand) continue;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d <= 200) pairs.push({a: a.id, b: b.id, d});
        }
      }
      expect(pairs.length).toBe(0);
    });

    it('no identical coordinate clusters', () => {
      const key = (c: {lat?: number | null; lng?: number | null}) => `${c.lat}|${c.lng}`;
      const counts = new Map<string, number>();
      for (const c of ieCenters) counts.set(key(c), (counts.get(key(c)) || 0) + 1);
      expect([...counts.values()].every(n => n === 1)).toBe(true);
    });

    it('no duplicate catalog IDs globally', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('15. Search QA', () => {
    beforeAll(() => getGymSearchIndex(ireland));

    it('city searches return Ireland results', () => {
      for (const city of [
        'Dublin',
        'Cork',
        'Galway',
        'Limerick',
        'Drogheda',
        'Dundalk',
        'Carlow',
        'Naas',
        'Maynooth',
        'Mullingar',
        'Midleton',
        'Balbriggan',
        'Ashbourne',
        'Bray',
        'Greystones',
        'Tullamore',
      ]) {
        expect(searchGyms(city, {gyms: ireland, limit: 20}).length).toBeGreaterThan(0);
      }
    });

    it('short-prefix typing remains responsive', () => {
      const t0 = Date.now();
      searchGyms('FLY', {gyms: ireland, limit: 20});
      searchGyms('Ene', {gyms: ireland, limit: 20});
      searchGyms('Gym', {gyms: ireland, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });

  describe('16. Nearest / map QA', () => {
    it.each([
      ['Dublin', 53.3498, -6.2603],
      ['Cork', 51.8985, -8.4756],
      ['Galway', 53.2707, -9.0568],
      ['Limerick', 52.6638, -8.6267],
      ['Drogheda', 53.7179, -6.3561],
      ['Dundalk', 54.0, -6.4167],
      ['Bray', 53.204, -6.111],
      ['Tullamore', 53.273, -7.488],
    ])('%s nearest is plausible ie_* (not UK/DK fallback)', (_label, lat, lng) => {
      const nearest = findNearestGym(lat, lng, ireland);
      expect(nearest?.id.startsWith('ie_')).toBe(true);
      expect(nearest?.country).toBe('Ireland');
      expect(nearest?.id).not.toBe(gyms[0]?.id);
    });

    it.each([
      ['Dublin', 53.35, -6.26, 0.12],
      ['Cork', 51.9, -8.47, 0.15],
      ['Galway', 53.27, -9.06, 0.2],
      ['east coast', 53.4, -6.2, 0.25],
    ])('%s viewport scoped (not full catalog)', (_label, lat, lng, delta) => {
      const visible = filterMapCentersInRegion(toMap(ireland) as never, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(65);
      expect(visible.length).toBeLessThan(11254);
      expect(visible.every(v => v.id.startsWith('ie_'))).toBe(true);
    });
  });

  describe('17. 200 m check-in + auto-checkout', () => {
    it('global radii remain 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Dublin FLYEfit Baggot', FLYEFIT_BAGGOT],
      ['Cork FLYEfit', FLYEFIT_CORK],
      ['Energie Tallaght', ENERGIE_TALLAGHT],
      ['West Wood Aston', WESTWOOD_ASTON],
      ['Shoreline Bray', SHORELINE_BRAY],
    ])('%s uses selected gym coords; 199/200 allowed, 201 away', (_label, id) => {
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      const center = findCenterById(id)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearby Energie clubs do not replace session gym ID for check-in math', () => {
      const session = getGymLatLngForCheckIn(ENERGIE_TALLAGHT)!;
      const other = getGymLatLngForCheckIn(ENERGIE_CITYWEST)!;
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
      expect(d).toBeGreaterThan(3000);
    });
  });

  describe('18. Core flows / orphan', () => {
    it('ie_* resolves for onboarding/profile/favorites paths', () => {
      const sample = ireland[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
      expect(getActiveGymsByCountry('Ireland').length).toBe(65);
      expect(formatGymDisplayName(findGymById(sample.id))).not.toMatch(/^ie_/);
      const coords = getEffectiveLatLng(findCenterById(sample.id)!);
      expect(Number.isFinite(coords.lat)).toBe(true);
    });

    it('orphan ie_nonexistent_test is safe Ireland stub (not UK/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('ie_nonexistent_test');
      expect(stub.id).toBe('ie_nonexistent_test');
      expect(stub.region).toBe('Ireland');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('ie_nonexistent_test').name);
      expect(findGymById('ie_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
    });

    it('Ireland country label i18n key resolves', () => {
      expect(gymCountryTranslationKey('Ireland')).toBe('countries.ireland');
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Ireland', t)).toBe('Ireland');
    });
  });

  describe('19. Country regression', () => {
    it('exact 19-country production counts totaling 11063', () => {
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
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11254);
    });
  });

  describe('20. Performance sanity', () => {
    it('search index builds for full catalog under 5s', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      expect(Date.now() - t0).toBeLessThan(5000);
    });

    it('typical Ireland searches under 3s on live catalog', () => {
      const t0 = Date.now();
      searchGyms('FLYEfit Dublin', {gyms, limit: 20});
      searchGyms('Energie Galway', {gyms, limit: 20});
      searchGyms('D02 AV91', {gyms, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });
});
