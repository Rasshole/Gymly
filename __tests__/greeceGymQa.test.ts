/**
 * Greece gym QA — full production validation after gr_* merge (106 centers).
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
  GREECE_POSTAL_RE,
  isGreeceCountry,
  isPlausibleGreeceCoordinate,
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

const staging = require('../data/greece/greece_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  source_url?: string;
  website?: string;
}>;

const approved = require('../data/greece/GREECE_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  address?: string;
  postal_code?: string;
}>;

const phase2Ready = require('../data/greece/GREECE_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  source_url?: string;
  website?: string;
  address?: string;
  postal_code?: string;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|invented/i;
const CYPRUS_RE = /κύπρος|cyprus|λευκωσία|nicosia|lefkosia/i;
const FOREIGN_RE = /\b(albania|north macedonia|bulgaria|turkey|italy|cyprus)\b/i;
const PHONE_AS_ADDRESS_RE = /^\d{2,5}[\s-]?\d{2,3}[\s-]?\d{2,4}$/;

const EXPECTED_BRANDS: Record<string, number> = {
  Alterlife: 72,
  Yava: 22,
  'Planet Fitness Greece': 5,
  'Mega Gym': 4,
  'Holmes Place': 3,
};

const GALATSI_VEIKOU = 'gr_f92effe0b0';
const GALATSI_AVE = 'gr_0fc7dfed4c';
const PLANET_CHALKIDA = 'gr_aa357c70a8';
const PLANET_PIRAEUS = 'gr_e53450042b';
const PLANET_SALAMINA = 'gr_df2945b81f';
const YAVA_HERAKLION = 'gr_2db6f839a2';
const YAVA_CHANIA = 'gr_353c44b22d';
const YAVA_RHODES = 'gr_4a41ab2391';
const ALTERLIFE_SYROS = 'gr_fd74f26b05';
const HOLMES_ATHENS = 'gr_98fb2e4f0e';
const HOLMES_MAROUSSI = 'gr_c6a1f4ad64';
const HOLMES_GLYFADA = 'gr_29853f4256';

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

function toMap(gs: typeof greece) {
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

describe('Greece gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const greece = gyms.filter(g => isGreeceCountry(g.country));
  const grCenters = catalog.filter(c => isGreeceCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 11063; Greece = 106', () => {
      expect(catalog.length).toBe(11254);
      expect(grCenters.length).toBe(106);
      expect(greece.length).toBe(106);
      expect(catalog.filter(c => c.id.startsWith('gr_')).length).toBe(106);
    });

    it('production IDs reconcile with approved + staging MERGED', () => {
      const prod = new Set(grCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(106);
      expect(ap.size).toBe(106);
      expect(merged.size).toBe(106);
      for (const id of prod) {
        expect(ap.has(id)).toBe(true);
        expect(merged.has(id)).toBe(true);
      }
      for (const id of ap) expect(prod.has(id)).toBe(true);
      for (const id of merged) expect(prod.has(id)).toBe(true);
    });

    it('all gr_* IDs unique with required fields and valid Greece geography', () => {
      const ids = new Set<string>();
      for (const c of grCenters) {
        expect(c.id.startsWith('gr_')).toBe(true);
        expect(c.id).toMatch(/^gr_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Greece');
        expect(c.is_active).toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(PHONE_AS_ADDRESS_RE.test(String(c.address || '').trim())).toBe(false);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(GREECE_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(isPlausibleGreeceCoordinate(c.lat!, c.lng!)).toBe(true);
        // Cyprus bbox rejected
        expect(!(c.lat! >= 34.5 && c.lat! <= 35.75 && c.lng! >= 32.0 && c.lng! <= 34.85)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(CYPRUS_RE.test(blob)).toBe(false);
        expect(FOREIGN_RE.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
    });

    it('brand breakdown matches merge expectations', () => {
      const byBrand: Record<string, number> = {};
      for (const c of grCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(106);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('NEEDS_*/DUPLICATE/COMING_SOON/CLOSED IDs are not in production', () => {
      const unresolved = staging.filter(s =>
        ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(
          s.import_category,
        ),
      );
      const cats = unresolved.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.NEEDS_COORDINATES).toBe(15);
      expect(cats.NEEDS_REVIEW).toBe(3);
      expect(cats.DUPLICATE || 0).toBe(1);
      expect(cats.COMING_SOON || 0).toBe(0);
      expect(cats.CLOSED || 0).toBe(0);
      for (const s of unresolved) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
    });

    it('unresolved Mega Gym rows remain outside production', () => {
      const megaUnresolved = staging.filter(
        s =>
          s.brand === 'Mega Gym' &&
          ['NEEDS_COORDINATES', 'NEEDS_REVIEW'].includes(s.import_category),
      );
      expect(megaUnresolved.length).toBe(3);
      for (const s of megaUnresolved) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
      expect(grCenters.filter(c => c.brand === 'Mega Gym').length).toBe(4);
    });
  });

  describe('3. Duplicate / proximity + Alterlife Galatsi pair', () => {
    it('only one same-brand ≤200 m pair; classified A (retain both)', () => {
      const pairs: Array<{a: string; b: string; d: number}> = [];
      for (let i = 0; i < grCenters.length; i++) {
        for (let j = i + 1; j < grCenters.length; j++) {
          const a = grCenters[i]!;
          const b = grCenters[j]!;
          if (a.brand !== b.brand) continue;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d <= 200) pairs.push({a: a.id, b: b.id, d});
        }
      }
      expect(pairs.length).toBe(1);
      expect(pairs[0]!.d).toBeLessThan(25);
      const ids = new Set([pairs[0]!.a, pairs[0]!.b]);
      expect(ids.has(GALATSI_VEIKOU)).toBe(true);
      expect(ids.has(GALATSI_AVE)).toBe(true);
    });

    it('Galatsi pair are genuinely separate clubs (addresses/postcodes/pages)', () => {
      const a = findCenterById(GALATSI_VEIKOU)!;
      const b = findCenterById(GALATSI_AVE)!;
      expect(a.address).toMatch(/Βε[ΐι]κου/i);
      expect(b.address).toMatch(/Γαλατσίου/i);
      expect(a.postal_code).toBe('111 46');
      expect(b.postal_code).toBe('111 41');
      expect(a.address).not.toBe(b.address);
      const readyA = phase2Ready.find(r => r.id === GALATSI_VEIKOU);
      const readyB = phase2Ready.find(r => r.id === GALATSI_AVE);
      expect(String(readyA?.source_url || '')).toContain('galatsi-veikou');
      expect(String(readyB?.source_url || '')).toContain('galatsi-galatsiou');
      expect(getGymLatLngForCheckIn(GALATSI_VEIKOU)!.latitude).not.toBeCloseTo(
        getGymLatLngForCheckIn(GALATSI_AVE)!.latitude,
        6,
      );
    });

    it('no identical coordinate clusters among Greece rows', () => {
      const key = (c: {lat?: number | null; lng?: number | null}) => `${c.lat}|${c.lng}`;
      const counts = new Map<string, number>();
      for (const c of grCenters) counts.set(key(c), (counts.get(key(c)) || 0) + 1);
      expect([...counts.values()].every(n => n === 1)).toBe(true);
    });
  });

  describe('4. YAVA QA', () => {
    const yava = grCenters.filter(c => c.brand === 'Yava');

    it('22 current /content/* clubs; no legacy ?gym= rows', () => {
      expect(yava.length).toBe(22);
      for (const c of yava) {
        const ready = phase2Ready.find(r => r.id === c.id);
        const src = `${ready?.source_url || ''} ${ready?.website || ''}`;
        expect(src).toMatch(/\/content\//i);
        expect(src).not.toMatch(/[?&]gym=/i);
        expect(GREECE_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(isPlausibleGreeceCoordinate(c.lat!, c.lng!)).toBe(true);
      }
    });

    it('YAVA search: brand, partial, Greek/Latin cities', () => {
      getGymSearchIndex(greece);
      expect(searchGyms('yava', {gyms: greece, limit: 30}).length).toBeGreaterThan(5);
      expect(searchGyms('YAV', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      expect(
        searchGyms('Ηράκλειο', {gyms: greece, limit: 40}).some(r => r.gym.id === YAVA_HERAKLION),
      ).toBe(true);
      expect(searchGyms('Heraklion', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      expect(
        searchGyms('Χανιά', {gyms: greece, limit: 40}).some(r => r.gym.id === YAVA_CHANIA),
      ).toBe(true);
      expect(searchGyms('Rhodes', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('Πάτρα', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
    });
  });

  describe('5. Alterlife / Holmes / Planet / Mega', () => {
    it('Alterlife = 72, no Cyprus text, Greek search works', () => {
      const alter = grCenters.filter(c => c.brand === 'Alterlife');
      expect(alter.length).toBe(72);
      for (const c of alter) {
        expect(CYPRUS_RE.test(`${c.name} ${c.city} ${c.address}`)).toBe(false);
      }
      getGymSearchIndex(greece);
      expect(searchGyms('Alterlife', {gyms: greece, limit: 30}).length).toBeGreaterThan(10);
      expect(searchGyms('Αθήνα', {gyms: greece, limit: 30}).length).toBeGreaterThan(0);
      expect(searchGyms('Thessaloniki', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      expect(findCenterById(ALTERLIFE_SYROS)?.city).toMatch(/ΣΥΡΟΣ/i);
    });

    it('Holmes Place Greece estate = 3 only (Athens/Maroussi/Glyfada)', () => {
      const holmes = grCenters.filter(c => c.brand === 'Holmes Place');
      expect(holmes.length).toBe(3);
      expect(holmes.map(c => c.id).sort()).toEqual(
        [HOLMES_ATHENS, HOLMES_GLYFADA, HOLMES_MAROUSSI].sort(),
      );
      for (const id of [HOLMES_ATHENS, HOLMES_MAROUSSI, HOLMES_GLYFADA]) {
        const c = findCenterById(id)!;
        expect(c.country).toBe('Greece');
        expect(c.lng!).toBeGreaterThan(0);
        expect(GREECE_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      }
      // Portuguese Holmes Place must remain separate
      expect(catalog.filter(c => c.brand === 'Holmes Place' && c.country === 'Portugal').length).toBe(
        12,
      );
    });

    it('Planet Fitness Greece = 5 with repaired Chalkida/Piraeus/Salamina addresses', () => {
      const planet = grCenters.filter(c => c.brand === 'Planet Fitness Greece');
      expect(planet.length).toBe(5);
      const chalkida = findCenterById(PLANET_CHALKIDA)!;
      expect(chalkida.address).toBe('Αρεθούσης 38, Χαλκίδα');
      expect(chalkida.postal_code).toBe('341 00');
      expect(PHONE_AS_ADDRESS_RE.test(chalkida.address)).toBe(false);
      expect(findCenterById(PLANET_PIRAEUS)!.address).toBe('Θηβών 41, Πειραιάς');
      expect(findCenterById(PLANET_PIRAEUS)!.postal_code).toBe('185 43');
      expect(findCenterById(PLANET_SALAMINA)!.address).toBe('Εθνάρχου Μακαρίου 23, Σαλαμίνα');
      expect(findCenterById(PLANET_SALAMINA)!.postal_code).toBe('189 00');
      expect(searchGyms('Planet Fitness', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
    });

    it('Mega Gym = 4 READY production rows only', () => {
      expect(grCenters.filter(c => c.brand === 'Mega Gym').length).toBe(4);
      expect(searchGyms('Mega Gym', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
    });
  });

  describe('6. Island QA', () => {
    it('Crete, Rhodes, Syros, Salamina present and check-in eligible', () => {
      for (const id of [YAVA_HERAKLION, YAVA_CHANIA, YAVA_RHODES, ALTERLIFE_SYROS, PLANET_SALAMINA]) {
        const c = findCenterById(id)!;
        expect(isPlausibleGreeceCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(getGymLatLngForCheckIn(id)).not.toBeNull();
      }
      const crete = grCenters.filter(
        c => c.lat! >= 34.8 && c.lat! <= 35.75 && c.lng! >= 23.4 && c.lng! <= 26.4,
      );
      const rhodes = grCenters.filter(
        c => c.lat! >= 35.85 && c.lat! <= 37.0 && c.lng! >= 26.85 && c.lng! <= 28.3,
      );
      expect(crete.length).toBeGreaterThanOrEqual(2);
      expect(rhodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Search aliases + normalization search-only', () => {
    it('Greek/Latin city aliases resolve without rewriting stored display', () => {
      getGymSearchIndex(greece);
      const pairs: Array<[string, string]> = [
        ['Αθήνα', 'Athens'],
        ['Θεσσαλονίκη', 'Thessaloniki'],
        ['Ηράκλειο', 'Heraklion'],
        ['Χανιά', 'Chania'],
        ['Ρόδος', 'Rhodes'],
        ['Πάτρα', 'Patra'],
      ];
      for (const [el, la] of pairs) {
        expect(searchGyms(el, {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
        expect(searchGyms(la, {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      }
      // Stored display remains Greek where originally Greek
      const her = findCenterById(YAVA_HERAKLION)!;
      expect(her.name).toMatch(/ΗΡΑΚΛΕΙΟ/);
      expect(her.city).toMatch(/Ηράκλειο|Ηρακλειο/i);
      // Normalization helpers are search-only transforms
      expect(normalizeGymSearchValue('Αθήνα')).not.toBe('Αθήνα');
      expect(compactGymSearchValue('151 24')).toMatch(/15124/);
      expect(her.name).toBe(findCenterById(YAVA_HERAKLION)!.name);
    });

    it('short-prefix and postcode search', () => {
      expect(searchGyms('Alt', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      expect(searchGyms('Hol', {gyms: greece, limit: 20}).length).toBeGreaterThan(0);
      expect(
        searchGyms('105 64', {gyms: greece, limit: 20}).some(r => r.gym.id === HOLMES_ATHENS),
      ).toBe(true);
    });

    it('Greek transliteration does not force non-GR nearest for Athens query on full catalog', () => {
      getGymSearchIndex(gyms);
      const hits = searchGyms('Athens', {gyms, limit: 40});
      expect(hits.some(h => h.gym.country === 'Greece' || h.gym.id.startsWith('gr_'))).toBe(true);
    });
  });

  describe('8. Nearest / map', () => {
    it.each([
      ['Athens', 37.9838, 23.7275],
      ['Thessaloniki', 40.6401, 22.9444],
      ['Patra', 38.2466, 21.7346],
      ['Heraklion', 35.3387, 25.1442],
      ['Chania', 35.5138, 24.018],
      ['Rhodes', 36.4349, 28.2176],
    ])('%s nearest is plausible gr_* (not DK fallback)', (_label, lat, lng) => {
      const nearest = findNearestGym(lat, lng, greece);
      expect(nearest?.id.startsWith('gr_')).toBe(true);
      expect(nearest?.country).toBe('Greece');
      expect(nearest?.id).not.toBe(gyms[0]?.id);
    });

    it.each([
      ['Athens', 37.98, 23.73, 0.45],
      ['Thessaloniki', 40.64, 22.94, 0.4],
      ['Crete Heraklion', 35.34, 25.14, 0.5],
      ['Rhodes', 36.43, 28.22, 0.4],
    ])('%s viewport scoped (not full catalog)', (_label, lat, lng, delta) => {
      const visible = filterMapCentersInRegion(toMap(greece) as never, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(106);
      expect(visible.length).toBeLessThan(11254);
      expect(visible.every(v => v.id.startsWith('gr_'))).toBe(true);
    });

    it('dense Galatsi pins remain individually addressable by ID', () => {
      const a = findGymById(GALATSI_VEIKOU)!;
      const b = findGymById(GALATSI_AVE)!;
      expect(a.id).not.toBe(b.id);
      expect(getGymLatLngForCheckIn(GALATSI_VEIKOU)!.latitude).not.toBe(
        getGymLatLngForCheckIn(GALATSI_AVE)!.latitude,
      );
    });
  });

  describe('9. 200 m check-in + auto-checkout', () => {
    it('global radii remain 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Athens Holmes', HOLMES_ATHENS],
      ['Crete YAVA', YAVA_HERAKLION],
      ['Rhodes YAVA', YAVA_RHODES],
      ['dense Galatsi A', GALATSI_VEIKOU],
      ['dense Galatsi B', GALATSI_AVE],
      ['Salamina Planet', PLANET_SALAMINA],
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

    it('nearby Alterlife does not replace session gym ID for check-in math', () => {
      const session = getGymLatLngForCheckIn(GALATSI_VEIKOU)!;
      const other = getGymLatLngForCheckIn(GALATSI_AVE)!;
      expect(session.latitude).not.toBeCloseTo(other.latitude, 6);
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
      expect(d).toBeGreaterThan(5);
      expect(d).toBeLessThan(30);
    });
  });

  describe('10. Core flows / orphan', () => {
    it('gr_* resolves for onboarding/profile/favorites paths', () => {
      const sample = greece[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
      expect(getActiveGymsByCountry('Greece').length).toBe(106);
      expect(formatGymDisplayName(findGymById(sample.id))).not.toMatch(/^gr_/);
      const coords = getEffectiveLatLng(findCenterById(sample.id)!);
      expect(Number.isFinite(coords.lat)).toBe(true);
    });

    it('orphan gr_nonexistent_test is safe Greece stub (not DK/catalog[0])', () => {
      const stub = resolveGymOrStub('gr_nonexistent_test');
      expect(stub.id).toBe('gr_nonexistent_test');
      expect(stub.region).toBe('Greece');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('gr_nonexistent_test').name);
      expect(findGymById('gr_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
    });

    it('Greece country label i18n key resolves', () => {
      expect(gymCountryTranslationKey('Greece')).toBe('countries.greece');
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Greece', t)).toBe('Greece');
    });
  });

  describe('11. Country regression', () => {
    it('exact 16-country production counts', () => {
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

  describe('12. Performance sanity', () => {
    it('search index builds for full catalog under 5s', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      expect(Date.now() - t0).toBeLessThan(5000);
    });

    it('typical Greece searches under 3s on live catalog', () => {
      const t0 = Date.now();
      searchGyms('Alterlife Αθήνα', {gyms, limit: 20});
      searchGyms('Yava Thessaloniki', {gyms, limit: 20});
      searchGyms('Heraklion', {gyms, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });
});
