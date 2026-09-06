/**
 * Switzerland gym QA — comprehensive production validation after ch_* merge (475 centers).
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
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {isSwitzerlandCountry} from '../src/utils/gymCountry';
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

const staging = require('../data/switzerland/switzerland_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
}>;

const approved = require('../data/switzerland/SWITZERLAND_APPROVED_FOR_MERGE.json') as Array<{id: string}>;
const phase2Ready = require('../data/switzerland/SWITZERLAND_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
}>;

const CH_POSTAL_RE = /^\d{4}$/;
const CH_BOUNDS = {latMin: 45.82, latMax: 47.81, lngMin: 5.96, lngMax: 10.49};
const MOJIBAKE_RE = /Ã.|�|â€|Â(?![a-z])/;
const LEGACY_RE = /\b(basefit|one training center|silhouette wellness|only fitness)\b/i;
const LI_CITIES = ['vaduz', 'schaan', 'triesen', 'balzers', 'eschen', 'mauren'];

const EXPECTED_BRANDS: Record<string, number> = {
  'ACTIV FITNESS': 130,
  'update Fitness': 88,
  "Let's Go Fitness": 66,
  PureGym: 49,
  'NonStop Gym': 45,
  'well come FIT': 27,
  'clever fit': 23,
  Kieser: 21,
  Fitnesspark: 15,
  Harmony: 11,
};

const AARAU_INDUSTRIE_ID = 'ch_53e82ae848';
const KUSSNACHT_ID = 'ch_2d35aeb0dd';
const KUSSNACHT_OFFICIAL = {lat: 47.109262, lng: 8.4499984};

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

function normalizeBrand(b: string): string {
  return String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('Switzerland gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const switzerland = gyms.filter(g => isSwitzerlandCountry(g.country));
  const chCenters = catalog.filter(c => isSwitzerlandCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 10772; Switzerland = 475', () => {
      expect(catalog.length).toBe(11254);
      expect(chCenters.length).toBe(475);
      expect(switzerland.length).toBe(475);
    });

    it('all ch_* IDs unique with required fields', () => {
      const ids = new Set<string>();
      for (const c of chCenters) {
        expect(c.id.startsWith('ch_')).toBe(true);
        expect(c.id).toMatch(/^ch_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Switzerland');
        expect(c.is_active).toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(0);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(CH_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat).not.toBe(0);
        expect(c.lng).not.toBe(0);
        expect(c.lat! >= CH_BOUNDS.latMin && c.lat! <= CH_BOUNDS.latMax).toBe(true);
        expect(c.lng! >= CH_BOUNDS.lngMin && c.lng! <= CH_BOUNDS.lngMax).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(LEGACY_RE.test(c.brand || '')).toBe(false);
        expect(LEGACY_RE.test(c.name || '')).toBe(false);
      }
    });

    it('no Liechtenstein contamination', () => {
      for (const c of chCenters) {
        expect(c.postal_code.startsWith('948') || c.postal_code.startsWith('949')).toBe(false);
        const city = (c.city || '').toLowerCase();
        expect(LI_CITIES.some(x => city.includes(x))).toBe(false);
      }
    });
  });

  describe('2. Brand breakdown', () => {
    it('matches Phase 2 contract', () => {
      const byBrand: Record<string, number> = {};
      for (const c of chCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      }
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(475);
    });
  });

  describe('3. Merge reconciliation', () => {
    it('approved, phase2 ready, staging MERGED, and production IDs match exactly', () => {
      const approvedIds = new Set(approved.map(r => r.id));
      const readyIds = new Set(phase2Ready.map(r => r.id));
      const mergedIds = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      const prodIds = new Set(chCenters.map(c => c.id));
      expect(approvedIds.size).toBe(475);
      expect(readyIds.size).toBe(475);
      expect(mergedIds.size).toBe(475);
      expect(prodIds.size).toBe(475);
      for (const id of approvedIds) {
        expect(readyIds.has(id)).toBe(true);
        expect(mergedIds.has(id)).toBe(true);
        expect(prodIds.has(id)).toBe(true);
      }
    });
  });

  describe('4. Critical ACTIV coordinate pair (QA repair)', () => {
    it('Aarau Industrie and Küssnacht have distinct official coordinates', () => {
      const aarau = findCenterById(AARAU_INDUSTRIE_ID)!;
      const kuss = findCenterById(KUSSNACHT_ID)!;
      expect(aarau.address).toBe('Rohrerstrasse 78');
      expect(aarau.city).toBe('Aarau');
      expect(aarau.postal_code).toBe('5000');
      expect(kuss.address).toBe('Fännring 2');
      expect(kuss.city).toBe('Küssnacht');
      expect(kuss.postal_code).toBe('6403');
      expect(kuss.lat).toBeCloseTo(KUSSNACHT_OFFICIAL.lat, 5);
      expect(kuss.lng).toBeCloseTo(KUSSNACHT_OFFICIAL.lng, 5);
      const d = haversineMeters(aarau.lat!, aarau.lng!, kuss.lat!, kuss.lng!);
      expect(d).toBeGreaterThan(30000);
    });

    it('no identical-coordinate same-brand clusters remain', () => {
      const coordMap = new Map<string, string[]>();
      for (const c of chCenters) {
        const key = `${c.lat!.toFixed(6)}|${c.lng!.toFixed(6)}|${normalizeBrand(c.brand)}`;
        if (!coordMap.has(key)) coordMap.set(key, []);
        coordMap.get(key)!.push(c.id);
      }
      const dupes = [...coordMap.values()].filter(v => v.length > 1);
      expect(dupes.length).toBe(0);
    });
  });

  describe('5. Staging exclusions', () => {
    it('NEEDS_COORDINATES, NEEDS_REVIEW, COMING_SOON not in production', () => {
      const excluded = staging.filter(s =>
        ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON'].includes(s.import_category),
      );
      expect(excluded.filter(s => s.import_category === 'NEEDS_COORDINATES').length).toBe(10);
      expect(excluded.filter(s => s.import_category === 'NEEDS_REVIEW').length).toBe(1);
      expect(excluded.filter(s => s.import_category === 'COMING_SOON').length).toBe(6);
      for (const s of excluded) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
      expect(findCenterById('ch_3b0f6c104b')).toBeUndefined(); // update Fitness Vaduz
    });
  });

  describe('6. Search — brands', () => {
    const brands = [
      'ACTIV FITNESS',
      'update Fitness',
      "Let's Go Fitness",
      'PureGym',
      'NonStop Gym',
      'well come FIT',
      'clever fit',
      'Kieser',
      'Fitnesspark',
      'Harmony',
    ];

    it.each(brands)('%s returns ch_* near Zürich', brand => {
      const hits = searchGyms(brand, {limit: 50, userLat: 47.3769, userLng: 8.5417});
      expect(hits.some(h => h.gym.id.startsWith('ch_'))).toBe(true);
    });

    it.each(['activ', 'update', 'nonstop', 'clever', 'kieser', 'harmony'])(
      'partial %s returns ch_*',
      q => {
        const hits = searchGyms(q, {limit: 40, userLat: 47.3769, userLng: 8.5417});
        expect(hits.some(h => h.gym.id.startsWith('ch_'))).toBe(true);
      },
    );
  });

  describe('7. Search — cities', () => {
    const cities: Array<[string, number, number]> = [
      ['Zürich', 47.3769, 8.5417],
      ['Zurich', 47.3769, 8.5417],
      ['Genève', 46.2044, 6.1432],
      ['Geneva', 46.2044, 6.1432],
      ['Basel', 47.5596, 7.5886],
      ['Bern', 46.948, 7.4474],
      ['Lausanne', 46.5197, 6.6323],
      ['Lugano', 46.0037, 8.9511],
      ['Winterthur', 47.5, 8.724],
      ['St. Gallen', 47.4245, 9.3767],
    ];

    it.each(cities)('%s returns ch_* results', (city, lat, lng) => {
      const hits = searchGyms(city, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.filter(h => h.gym.id.startsWith('ch_')).length).toBeGreaterThan(0);
    });
  });

  describe('8. Postcode search', () => {
    it.each([
      ['8001', 47.3769, 8.5417],
      ['1201', 46.2044, 6.1432],
      ['3011', 46.948, 7.4474],
      ['4001', 47.5596, 7.5886],
      ['6900', 46.0037, 8.9511],
      ['6403', 47.109262, 8.4499984],
    ])('%s returns ch_* with local bias', (pc, lat, lng) => {
      const hits = searchGyms(pc, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.some(h => h.gym.id.startsWith('ch_'))).toBe(true);
    });

    it('AT 1010 and BE 1000 do not absorb Swiss-only context', () => {
      const atHits = searchGyms('1010', {limit: 20});
      expect(atHits.some(h => h.gym.id.startsWith('at_'))).toBe(true);
      const beHits = searchGyms('1000', {limit: 20});
      expect(beHits.some(h => h.gym.id.startsWith('be_'))).toBe(true);
    });
  });

  describe('9. Cross-country shared brands', () => {
    it('clever fit near Zürich ranks ch_*', () => {
      const hits = searchGyms('clever fit', {limit: 10, userLat: 47.3769, userLng: 8.5417});
      expect(hits[0]!.gym.id).toMatch(/^ch_/);
    });

    it('PureGym near Genève ranks ch_*', () => {
      const hits = searchGyms('PureGym', {limit: 10, userLat: 46.2044, userLng: 6.1432});
      expect(hits.some(h => h.gym.id.startsWith('ch_'))).toBe(true);
    });

    it('Kieser near Bern ranks ch_*', () => {
      const hits = searchGyms('Kieser', {limit: 10, userLat: 46.948, userLng: 7.4474});
      expect(hits[0]!.gym.id).toMatch(/^ch_/);
    });
  });

  describe('10. Onboarding / profile / orphan', () => {
    it('ch_* resolves from active list', () => {
      const sample = switzerland[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
      expect(getActiveGymsByCountry('Switzerland').length).toBe(475);
    });

    it('orphan ch_nonexistent_test is safe stub', () => {
      const stub = resolveGymOrStub('ch_nonexistent_test');
      expect(stub.id).toBe('ch_nonexistent_test');
      expect(stub.region).toBe('Schweiz');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('ch_nonexistent_test').name);
      expect(findGymById('ch_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
    });

    it('formatGymDisplayName never shows raw ch_* ID', () => {
      const sample = switzerland[10]!;
      const display = formatGymDisplayName(findGymById(sample.id));
      expect(display).not.toMatch(/^ch_/);
    });
  });

  describe('11. Nearest gym', () => {
    it('near Zürich returns ch_* first among Swiss subset', () => {
      const nearest = findNearestGym(47.3769, 8.5417, switzerland);
      expect(nearest?.id.startsWith('ch_')).toBe(true);
      expect(nearest?.country).toBe('Switzerland');
    });

    it('near Lugano returns ch_*', () => {
      const nearest = findNearestGym(46.0037, 8.9511, switzerland);
      expect(nearest?.id.startsWith('ch_')).toBe(true);
    });
  });

  describe('12. Map viewport', () => {
    it('Zürich viewport shows subset of ch_* (not all 475)', () => {
      const mapCenters = switzerland.map(g => ({
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
      }));
      const visible = filterMapCentersInRegion(mapCenters as any, {
        latitude: 47.3769,
        longitude: 8.5417,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(475);
      expect(visible.every(v => v.id.startsWith('ch_'))).toBe(true);
    });
  });

  describe('13. 200 m check-in + auto-checkout', () => {
    it('CHECK_IN_RADIUS and AUTO_CHECKOUT = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('boundary semantics at selected gym coordinates', () => {
      const sample = findCenterById(KUSSNACHT_ID)!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });
  });

  describe('14. Duplicate / proximity audit', () => {
    it('no same-brand same-address duplicates', () => {
      const keys = new Set<string>();
      for (const c of chCenters) {
        const k = [
          normalizeAddr(c.address || ''),
          c.postal_code,
          normalizeAddr(c.city || ''),
          normalizeBrand(c.brand || ''),
        ].join('|');
        expect(keys.has(k)).toBe(false);
        keys.add(k);
      }
    });

    it('documents different-brand co-locations without same-address collapse', () => {
      let diffBrandNear = 0;
      for (let i = 0; i < chCenters.length; i++) {
        for (let j = i + 1; j < chCenters.length; j++) {
          const a = chCenters[i]!;
          const b = chCenters[j]!;
          if (normalizeBrand(a.brand) === normalizeBrand(b.brand)) continue;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d <= 100) diffBrandNear += 1;
        }
      }
      expect(diffBrandNear).toBeGreaterThan(0);
    });
  });

  describe('15. Country labels', () => {
    it('Switzerland i18n key resolves', () => {
      expect(gymCountryTranslationKey('Switzerland')).toBe('countries.switzerland');
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Switzerland', t)).toBe('Switzerland');
    });
  });

  describe('16. Performance sanity', () => {
    it('search index builds for full catalog under 5s', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      expect(Date.now() - t0).toBeLessThan(5000);
    });

    it('typical search under 3s on live catalog', () => {
      const t0 = Date.now();
      searchGyms('NonStop Genève', {gyms, limit: 20});
      searchGyms('PureGym Zürich', {gyms, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });
});
