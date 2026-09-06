/**
 * Romania gym QA — full production validation after ro_* merge (154 centers).
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
  ROMANIA_POSTAL_RE,
  isRomaniaCountry,
  isPlausibleRomaniaCoordinate,
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

const staging = require('../data/romania/romania_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  notes?: string;
  postcode_source?: string;
  coord_source?: string;
}>;

const approved = require('../data/romania/ROMANIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/romania/ROMANIA_PHASE2_READY_TO_IMPORT.json') as Array<{
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
const FOREIGN_BLOB =
  /\b(hungary|magyarország|serbia|beograd|bulgaria|ukraine|kyiv|republica moldova)\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  'Stay Fit Gym': 67,
  'World Class': 45,
  '18GYM': 42,
};

const GRAND_ARENA = 'ro_841c3d6ffe';
const METALURGIEI = 'ro_4c5fd28082';

const COMING_SOON_NAME_RE =
  /lujerului|edgar quinet|cluj era|cluj via|bucurești otopeni|bucuresti otopeni/i;

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

function isMoldovaContamination(c: {city?: string; country?: string}): boolean {
  const city = (c.city || '').toLowerCase();
  const country = (c.country || '').toLowerCase();
  return country === 'moldova' || city === 'chișinău' || city === 'chisinau';
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

function isHubOrLegalNoise(c: {name?: string; address?: string; city?: string}): boolean {
  const blob = `${c.name || ''} ${c.address || ''} ${c.city || ''}`.toLowerCase();
  return /\b(cluburi|contact|regulament|politica|termeni|blog|cariere|cookie|gdpr)\b/.test(
    blob,
  );
}

describe('Romania gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const romania = gyms.filter(g => isRomaniaCountry(g.country));
  const roCenters = catalog.filter(c => isRomaniaCountry(c.country));
  const stagingById = new Map(staging.map(s => [s.id, s]));

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Romania = 154; ro_* = 154', () => {
      expect(catalog.length).toBe(11692);
      expect(roCenters.length).toBe(154);
      expect(romania.length).toBe(154);
      expect(catalog.filter(c => c.id.startsWith('ro_')).length).toBe(154);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(roCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(154);
      expect(ap.size).toBe(154);
      expect(ready.size).toBe(154);
      expect(merged.size).toBe(154);
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
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all ro_* IDs unique with required fields and valid Romania geography', () => {
      const ids = new Set<string>();
      for (const c of roCenters) {
        expect(c.id).toMatch(/^ro_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Romania');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(ROMANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(String(c.postal_code).length).toBe(6);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat).not.toBe(0);
        expect(c.lng).not.toBe(0);
        expect(isPlausibleRomaniaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(isMoldovaContamination(c)).toBe(false);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(154);
    });

    it('brand breakdown exact; ESX = 0', () => {
      const byBrand: Record<string, number> = {};
      for (const c of roCenters) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(154);
      expect(roCenters.filter(c => /esx/i.test(`${c.brand} ${c.name}`)).length).toBe(0);
    });

    it('leading-zero postcodes preserved as strings', () => {
      const leading = roCenters.filter(c => String(c.postal_code).startsWith('0'));
      expect(leading.length).toBeGreaterThan(0);
      for (const c of leading) {
        expect(String(c.postal_code)).toMatch(/^0\d{5}$/);
        expect(typeof c.postal_code).toBe('string');
      }
      // Display must not coerce to 10011
      const sample = leading[0]!;
      expect(String(sample.postal_code)).not.toBe(String(Number(sample.postal_code)));
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('NEEDS_REVIEW=4 COMING_SOON=5 MERGED=154; none unresolved live', () => {
      const cats = staging.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.MERGED_INTO_CATALOG).toBe(154);
      expect(cats.NEEDS_REVIEW).toBe(4);
      expect(cats.COMING_SOON).toBe(5);
      expect(cats.NEEDS_COORDINATES || 0).toBe(0);

      const prodIds = new Set(roCenters.map(c => c.id));
      const unresolved = staging.filter(s => s.import_category !== 'MERGED_INTO_CATALOG');
      expect(unresolved.length).toBe(9);
      for (const s of unresolved) {
        expect(prodIds.has(s.id)).toBe(false);
      }

      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(coming.every(s => /18gym/i.test(s.brand || ''))).toBe(true);
      expect(
        coming.every(s => COMING_SOON_NAME_RE.test(s.name || '') || /otopeni/i.test(s.name || '')),
      ).toBe(true);
    });
  });

  describe('3. World Class QA', () => {
    it('45/45 live; recovered-postcode clubs keep official coords', () => {
      const wc = roCenters.filter(c => c.brand === 'World Class');
      expect(wc.length).toBe(45);
      const recovered = wc.filter(c => {
        const s = stagingById.get(c.id);
        return (
          s?.postcode_source === 'NOMINATIM_REVERSE_OFFICIAL_COORDS' ||
          String(s?.notes || '').includes('postal_from_reverse')
        );
      });
      expect(recovered.length).toBe(13);
      for (const c of recovered) {
        const s = stagingById.get(c.id)!;
        expect(s.coord_source).toBe('OFFICIAL_API');
        expect(ROMANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(isPlausibleRomaniaCoordinate(c.lat!, c.lng!)).toBe(true);
      }
      // no duplicate WC names at identical coords
      const coordKeys = new Set<string>();
      for (const c of wc) {
        const key = `${c.lat!.toFixed(5)},${c.lng!.toFixed(5)}`;
        expect(coordKeys.has(key)).toBe(false);
        coordKeys.add(key);
      }
    });
  });

  describe('4. Stay Fit Gym QA', () => {
    it('67 live; no hub/legal/marketing rows; unresolved stay out', () => {
      const sf = roCenters.filter(c => c.brand === 'Stay Fit Gym');
      expect(sf.length).toBe(67);
      expect(sf.filter(isHubOrLegalNoise).length).toBe(0);

      const unresolvedSf = staging.filter(
        s =>
          s.brand === 'Stay Fit Gym' &&
          ['NEEDS_REVIEW', 'NEEDS_COORDINATES', 'COMING_SOON'].includes(s.import_category),
      );
      expect(unresolvedSf.length).toBe(4);
      const prodIds = new Set(roCenters.map(c => c.id));
      for (const s of unresolvedSf) {
        expect(prodIds.has(s.id)).toBe(false);
      }
    });
  });

  describe('5. 18GYM QA', () => {
    it('42 open live; 5 coming-soon excluded', () => {
      const g18 = roCenters.filter(c => c.brand === '18GYM');
      expect(g18.length).toBe(42);
      expect(g18.every(c => !COMING_SOON_NAME_RE.test(c.name || ''))).toBe(true);
      // 18GYM Otopeni coming-soon must not be live (Stay Fit Otopeni may exist)
      expect(g18.filter(c => /otopeni/i.test(c.name || '')).length).toBe(0);
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(coming.length).toBe(5);
      expect(coming.every(s => s.brand === '18GYM')).toBe(true);
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no duplicate IDs; Grand Arena/Metalurgiei ~137m A_legitimate', () => {
      const ids = roCenters.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);

      const sameBrand: Array<{d: number; a: string; b: string; brand: string}> = [];
      for (let i = 0; i < roCenters.length; i++) {
        for (let j = i + 1; j < roCenters.length; j++) {
          const a = roCenters[i]!;
          const b = roCenters[j]!;
          if (a.brand !== b.brand) continue;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d <= 200) {
            sameBrand.push({d, a: a.id, b: b.id, brand: a.brand!});
          }
        }
      }
      expect(sameBrand.filter(p => p.d <= 25).length).toBe(0);
      expect(sameBrand.filter(p => p.d <= 50).length).toBe(0);
      expect(sameBrand.filter(p => p.d <= 100).length).toBe(0);
      expect(sameBrand.length).toBe(1);

      const ga = findCenterById(GRAND_ARENA)!;
      const met = findCenterById(METALURGIEI)!;
      expect(ga.brand).toBe('Stay Fit Gym');
      expect(met.brand).toBe('Stay Fit Gym');
      expect(ga.address).not.toBe(met.address);
      const dist = haversineMeters(ga.lat!, ga.lng!, met.lat!, met.lng!);
      expect(dist).toBeGreaterThan(100);
      expect(dist).toBeLessThan(160);
      expect(sameBrand[0]!.a === GRAND_ARENA || sameBrand[0]!.b === GRAND_ARENA).toBe(true);
      expect(sameBrand[0]!.a === METALURGIEI || sameBrand[0]!.b === METALURGIEI).toBe(true);

      // identical coords
      const coordMap = new Map<string, string>();
      for (const c of roCenters) {
        const key = `${c.lat},${c.lng}`;
        expect(coordMap.has(key)).toBe(false);
        coordMap.set(key, c.id);
      }
    });
  });

  describe('7. Border / Moldova safety', () => {
    it('rejects neighbor cores; all live coords plausible RO', () => {
      expect(isPlausibleRomaniaCoordinate(44.4268, 26.1025)).toBe(true); // Bucharest
      expect(isPlausibleRomaniaCoordinate(46.7712, 23.6236)).toBe(true); // Cluj
      expect(isPlausibleRomaniaCoordinate(47.4979, 19.0402)).toBe(false); // Budapest
      expect(isPlausibleRomaniaCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
      expect(isPlausibleRomaniaCoordinate(42.6977, 23.3219)).toBe(false); // Sofia
      expect(isPlausibleRomaniaCoordinate(50.4501, 30.5234)).toBe(false); // Kyiv
      expect(isPlausibleRomaniaCoordinate(47.0105, 28.8638)).toBe(false); // Chișinău
      expect(roCenters.every(c => isPlausibleRomaniaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(roCenters.every(c => !isMoldovaContamination(c))).toBe(true);
    });
  });

  describe('8. Romanian text / diacritics', () => {
    it('preserves diacritics in display; search folds ASCII', () => {
      const cities = roCenters.map(c => c.city || '');
      expect(cities.some(c => /ă|â|î|ș|ț|Ă|Â|Î|Ș|Ț/.test(c))).toBe(true);
      expect(normalizeGymSearchValue('București')).toBe('bucuresti');
      expect(normalizeGymSearchValue('Timișoara')).toBe('timisoara');
      expect(normalizeGymSearchValue('Iași')).toBe('iasi');
      expect(normalizeGymSearchValue('Brașov')).toBe('brasov');
      expect(normalizeGymSearchValue('Constanța')).toBe('constanta');
      expect(normalizeGymSearchValue('Târgu Mureș')).toBe('targu mures');
      expect('București').toBe('București');
      for (const c of roCenters) {
        expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      }
    });
  });

  describe('9. Search QA', () => {
    it('brands, cities, diacritics, postcodes', () => {
      getGymSearchIndex();
      const brandHits = searchGyms('World Class', {limit: 30});
      expect(brandHits.some(h => h.gym.id.startsWith('ro_') && /world class/i.test(h.gym.brand || ''))).toBe(
        true,
      );
      expect(searchGyms('Stay Fit', {limit: 30}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('18GYM', {limit: 30}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('ESX', {limit: 20}).every(h => !/esx/i.test(`${h.gym.brand} ${h.gym.name}`))).toBe(
        true,
      );

      expect(searchGyms('București', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('Bucuresti', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('Bucharest', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('Cluj', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('Timisoara', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('Timișoara', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);
      expect(searchGyms('Iasi', {limit: 20}).some(h => h.gym.id.startsWith('ro_'))).toBe(true);

      const leading = roCenters.find(c => String(c.postal_code).startsWith('0'))!;
      const pcHits = searchGyms(String(leading.postal_code), {limit: 20});
      expect(pcHits.some(h => h.gym.id === leading.id)).toBe(true);
      expect(compactGymSearchValue(String(leading.postal_code))).toBe(String(leading.postal_code));
    });
  });

  describe('10. Onboarding / profile / nearest / map', () => {
    it('onboarding selection persists ro_* ID', () => {
      const pick = romania.find(g => /bucure/i.test(g.city || '')) || romania[0]!;
      expect(pick.id.startsWith('ro_')).toBe(true);
      expect(findGymById(pick.id)?.id).toBe(pick.id);
      expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
      expect(resolveGymOrStub(pick.id).region).toBe('Romania');
      expect(formatGymDisplayName(pick).length).toBeGreaterThan(0);
      expect(gymCountryTranslationKey('Romania')).toBe('countries.romania');
      const t = createTranslator(en as never);
      expect(formatGymCountryLabel('Romania', t)).toBe('Romania');
    });

    it('nearest returns plausible ro_* near major cities', () => {
      const fixtures = [
        {lat: 44.4268, lng: 26.1025, label: 'Bucharest'},
        {lat: 46.7712, lng: 23.6236, label: 'Cluj'},
        {lat: 45.7489, lng: 21.2087, label: 'Timisoara'},
        {lat: 47.1585, lng: 27.6014, label: 'Iasi'},
        {lat: 44.1598, lng: 28.6348, label: 'Constanta'},
        {lat: 45.6427, lng: 25.5887, label: 'Brasov'},
        {lat: 44.3302, lng: 23.7949, label: 'Craiova'},
        {lat: 45.7983, lng: 24.1256, label: 'Sibiu'},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, romania);
        expect(n?.id.startsWith('ro_')).toBe(true);
        expect(isRomaniaCountry(n!.country)).toBe(true);
      }
    });

    it('map viewport Bucharest filters to RO markers only subset', () => {
      const markers = toMap(romania);
      const visible = filterMapCentersInRegion(markers as never, {
        latitude: 44.43,
        longitude: 26.1,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      expect(visible.length).toBeGreaterThan(10);
      expect(visible.length).toBeLessThan(catalog.length);
      expect(visible.every(v => v.id.startsWith('ro_'))).toBe(true);
      // dense branches individually present
      const ids = new Set(visible.map(v => v.id));
      expect(ids.size).toBe(visible.length);
    });
  });

  describe('11. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Grand Arena dense Bucharest', GRAND_ARENA],
      ['Metalurgiei dense Bucharest', METALURGIEI],
      ['World Class sample', 'ro_a95ce67da1'],
      ['18GYM sample', 'ro_d96b9f3d8b'],
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

    it('nearby Grand Arena / Metalurgiei do not replace session gym ID', () => {
      const session = getGymLatLngForCheckIn(GRAND_ARENA)!;
      const other = getGymLatLngForCheckIn(METALURGIEI)!;
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(160);
      expect(getGymLatLngForCheckIn(GRAND_ARENA)!.latitude).toBeCloseTo(session.latitude, 5);
      expect(getGymLatLngForCheckIn(METALURGIEI)!.latitude).toBeCloseTo(other.latitude, 5);
      expect(findGymById(GRAND_ARENA)!.id).not.toBe(findGymById(METALURGIEI)!.id);
    });

    it('repeated away evaluations stay set_away (no duplicate-checkout side effects)', () => {
      const t = Date.now();
      const first = decideGeofenceAutoCheckout(250, null, t);
      expect(first.action).toBe('set_away');
      const awayIso =
        first.action === 'set_away' ? first.awayStartedAt : new Date(t).toISOString();
      expect(decideGeofenceAutoCheckout(250, awayIso, t + 1000).action).toBe(
        'update_distance_only',
      );
      expect(decideGeofenceAutoCheckout(250, awayIso, t + 2000).action).not.toBe(
        'checkout_away',
      );
    });
  });

  describe('12. Core flows / orphan ID', () => {
    it('ro_* resolves for onboarding/profile/favorites paths', () => {
      const live = romania[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Romania').length).toBe(154);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^ro_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan ro_nonexistent_test is safe Romania stub (not HU/MD/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('ro_nonexistent_test');
      expect(stub.id).toBe('ro_nonexistent_test');
      expect(stub.region).toBe('Romania');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('ro_nonexistent_test').name);
      expect(findGymById('ro_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
    });
  });

  describe('13. Country regression', () => {
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

  describe('14. Performance snapshot', () => {
    it('records live catalog timings vs merge benchmark', () => {
      const centersPath = path.join(__dirname, '../src/data/centers.json');
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
      searchGyms('bucuresti', {limit: 20});
      searchGyms('cluj', {limit: 20});
      searchGyms('stay fit', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(44.4268, 26.1025, romania);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(romania);
      const tMap0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 44.43,
        longitude: 26.1,
        latitudeDelta: 0.3,
        longitudeDelta: 0.3,
      } as never);
      const viewportMs = Date.now() - tMap0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
        parse_ms: parseMs,
        cold_index_ms: coldMs,
        cached_index_ms: cachedMs,
        typical_search_ms: +typicalMs.toFixed(2),
        worst_search_ms: worstMs,
        nearest_ms: nearestMs,
        viewport_filter_ms: viewportMs,
        merge_benchmark: {
          catalog: 11217,
          json_size_mb: 3.32,
          parse_ms: 25.6,
          cold_index_ms: 57.2,
          typical_search_ms: 1.75,
          worst_search_ms: 1.96,
          nearest_ms: 0.21,
        },
      };
      const outDir = path.join(__dirname, '../data/romania');
      fs.writeFileSync(
        path.join(outDir, 'ROMANIA_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      expect(perf.catalog).toBe(11692);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.json_size_mb).toBeLessThan(5);
      // Material regression gates (generous for CI variance under larger catalog)
      expect(perf.cold_index_ms).toBeLessThan(5000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
    });
  });
});
