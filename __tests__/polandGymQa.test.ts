/**
 * Poland gym QA — comprehensive production validation after pl_* merge (621 centers).
 */
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms} from '../src/data/danishGyms';
import {
  ALL_GYM_CENTERS,
  findCenterById,
  getActiveCenters,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {
  compactGymSearchValue,
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  allowsInventedCoordinates,
  isBelgiumCountry,
  isDenmarkCountry,
  isFinlandCountry,
  isFranceCountry,
  isGermanyCountry,
  isItalyCountry,
  isNetherlandsCountry,
  isNorwayCountry,
  isPolandCountry,
  isSpainCountry,
  isSwedenCountry,
  isUnitedKingdomCountry,
} from '../src/utils/gymCountry';
import {
  formatGymCountryLabel,
  gymCountryTranslationKey,
  gymPickerLocationLine,
} from '../src/utils/gymCountryLabel';
import {
  findGymById,
  findGymByIdRelaxed,
  formatGymDisplayName,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {GymCenter} from '../src/types/center.types';

const staging = require('../data/poland/poland_centers_staging.json') as Array<{
  import_category?: string;
  id?: string;
  brand?: string;
  name?: string;
  city?: string;
  legacy_brand?: string | null;
}>;

const PL_POSTAL_RE = /^\d{2}-\d{3}$/;
const PL_BOUNDS = {latMin: 49.0, latMax: 54.9, lngMin: 14.07, lngMax: 24.15};
const MOJIBAKE_RE = /Ã.|�|â€|Â(?![a-z])/;

function inPolandBbox(lat: number, lng: number): boolean {
  return (
    lat >= PL_BOUNDS.latMin &&
    lat <= PL_BOUNDS.latMax &&
    lng >= PL_BOUNDS.lngMin &&
    lng <= PL_BOUNDS.lngMax
  );
}

function normalizeBrand(b: string): string {
  return String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('Poland gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const poland = gyms.filter(g => isPolandCountry(g.country));
  const plCenters = catalog.filter(c => isPolandCountry(c.country));

  // ─── 1. Catalog integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Poland = 621 centers', () => {
      expect(plCenters.length).toBe(621);
    });

    it('Denmark = 354', () => {
      expect(catalog.filter(c => isDenmarkCountry(c.country)).length).toBe(354);
    });
    it('Sweden = 639', () => {
      expect(catalog.filter(c => isSwedenCountry(c.country)).length).toBe(639);
    });
    it('Norway = 535', () => {
      expect(catalog.filter(c => isNorwayCountry(c.country)).length).toBe(535);
    });
    it('Finland = 429', () => {
      expect(catalog.filter(c => isFinlandCountry(c.country)).length).toBe(429);
    });
    it('Germany = 1424', () => {
      expect(catalog.filter(c => isGermanyCountry(c.country)).length).toBe(1424);
    });
    it('United Kingdom = 1474', () => {
      expect(catalog.filter(c => isUnitedKingdomCountry(c.country)).length).toBe(1474);
    });
    it('Netherlands = 600', () => {
      expect(catalog.filter(c => isNetherlandsCountry(c.country)).length).toBe(600);
    });
    it('France = 1712', () => {
      expect(catalog.filter(c => isFranceCountry(c.country)).length).toBe(1712);
    });
    it('Spain = 976', () => {
      expect(catalog.filter(c => isSpainCountry(c.country)).length).toBe(976);
    });
    it('Italy = 588', () => {
      expect(catalog.filter(c => isItalyCountry(c.country)).length).toBe(588);
    });
    it('Belgium = 363', () => {
      expect(catalog.filter(c => isBelgiumCountry(c.country)).length).toBe(363);
    });

    it('all PL IDs use pl_* prefix', () => {
      for (const c of plCenters) {
        expect(c.id).toMatch(/^pl_/);
      }
    });

    it('GYM_ID_PREFIX.poland is pl_', () => {
      expect(GYM_ID_PREFIX.poland).toBe('pl_');
    });

    it('all PL centers have country="Poland"', () => {
      for (const c of plCenters) {
        expect(c.country).toBe('Poland');
      }
    });

    it('all PL centers are active', () => {
      for (const c of plCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all PL centers have name, brand, address, postal_code, city', () => {
      for (const c of plCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all PL centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of plCenters) {
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat !== 0 || c.lng !== 0).toBe(true);
      }
    });

    it('all PL postcodes match NN-NNN string format', () => {
      for (const c of plCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(PL_POSTAL_RE.test(c.postal_code)).toBe(true);
      }
    });

    it('unique IDs across entire catalog', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('no pol_/po_ prefixes in production', () => {
      expect(catalog.filter(c => c.id.startsWith('pol_')).length).toBe(0);
      expect(catalog.filter(c => c.id.startsWith('po_')).length).toBe(0);
    });

    it('no Fitness Platinium as current brand in production', () => {
      expect(plCenters.filter(c => c.brand === 'Fitness Platinium').length).toBe(0);
    });
  });

  // ─── 2. Brand breakdown ─────────────────────────────────────────
  describe('2. Brand breakdown', () => {
    const expected: Record<string, number> = {
      Zdrofit: 212,
      'Xtreme Fitness Gyms': 185,
      'Well Fitness': 97,
      'Just GYM': 55,
      CityFit: 24,
      'Fit Fabric': 21,
      'Fabryka Formy': 18,
      'Calypso Fitness': 9,
    };

    it.each(Object.entries(expected))('%s = %d', (brand, count) => {
      expect(plCenters.filter(c => c.brand === brand).length).toBe(count);
    });

    it('brand total = 621', () => {
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(621);
    });
  });

  // ─── 3. Geography ──────────────────────────────────────────────
  describe('3. Geography', () => {
    it('no foreign coordinate outliers', () => {
      const outliers = plCenters.filter(c => !inPolandBbox(c.lat!, c.lng!));
      expect(outliers.length).toBe(0);
    });

    it('Poland does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Poland')).toBe(false);
      expect(allowsInventedCoordinates('Polska')).toBe(false);
    });

    it('missing Poland coords → NaN (no Warsaw fallback)', () => {
      const fake: GymCenter = {
        id: 'pl_qa_missing',
        name: 'Test',
        brand: 'B',
        address: 'ul. Testowa 1',
        postal_code: '00-001',
        city: 'Warszawa',
        country: 'Poland',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      expect(Number.isFinite(lat)).toBe(false);
      expect(Number.isFinite(lng)).toBe(false);
      expect(lat).not.toBe(52.2297);
      expect(lng).not.toBe(21.0122);
    });

    it('no same-brand physical duplicates within 100m', () => {
      const pairs: Array<{a: string; b: string; d: number}> = [];
      for (let i = 0; i < plCenters.length; i++) {
        for (let j = i + 1; j < plCenters.length; j++) {
          const a = plCenters[i]!;
          const b = plCenters[j]!;
          if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
          const d = calculateDistance(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d < 100) pairs.push({a: a.id, b: b.id, d});
        }
      }
      expect(pairs.length).toBe(0);
    });
  });

  // ─── 4. Encoding ────────────────────────────────────────────────
  describe('4. Polish encoding', () => {
    it('no mojibake in PL rows', () => {
      for (const c of plCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(MOJIBAKE_RE);
      }
    });

    it('Polish diacritics preserved in stored text', () => {
      expect(plCenters.some(c => c.city === 'Łódź')).toBe(true);
      expect(plCenters.some(c => c.city === 'Wrocław')).toBe(true);
      expect(plCenters.some(c => c.city === 'Poznań')).toBe(true);
      expect(plCenters.some(c => c.city === 'Gdańsk')).toBe(true);
      expect(plCenters.some(c => c.city === 'Białystok')).toBe(true);
      const withDiacritics = plCenters.filter(c =>
        /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(`${c.name}|${c.address}|${c.city}`),
      );
      expect(withDiacritics.length).toBeGreaterThanOrEqual(100);
    });

    it('ł folds to l for search only', () => {
      expect(normalizeGymSearchValue('Łódź')).toBe('lodz');
      expect(normalizeGymSearchValue('Lodz')).toBe('lodz');
    });
  });

  // ─── 5. Brand search ───────────────────────────────────────────
  describe('5. Brand search', () => {
    const brands = [
      'Zdrofit',
      'Xtreme Fitness Gyms',
      'Well Fitness',
      'Just GYM',
      'CityFit',
      'Fit Fabric',
      'Fabryka Formy',
      'Calypso Fitness',
    ];

    it.each(brands)('%s returns pl_* results (Warsaw-biased)', brand => {
      const hits = searchGyms(brand, {limit: 50, userLat: 52.23, userLng: 21.01});
      const plHits = hits.filter(h => h.gym.id.startsWith('pl_'));
      expect(plHits.length).toBeGreaterThan(0);
    });

    it('Zdrofit near Warsaw ranks pl_* first', () => {
      const hits = searchGyms('Zdrofit', {limit: 10, userLat: 52.23, userLng: 21.01});
      expect(hits[0]!.gym.id).toMatch(/^pl_/);
      expect(hits.slice(0, 5).every(h => h.gym.id.startsWith('pl_'))).toBe(true);
    });

    it('partial brand queries work (zdrofit, xtreme)', () => {
      expect(searchGyms('zdrofit', {limit: 20, userLat: 52.23, userLng: 21.01}).some(h => h.gym.id.startsWith('pl_'))).toBe(true);
      expect(searchGyms('xtreme', {limit: 20, userLat: 52.23, userLng: 21.01}).some(h => h.gym.id.startsWith('pl_'))).toBe(true);
    });
  });

  // ─── 6. City search ────────────────────────────────────────────
  describe('6. Polish city search', () => {
    const cities: Array<[string, number, number]> = [
      ['Warszawa', 52.23, 21.01],
      ['Kraków', 50.06, 19.94],
      ['Łódź', 51.76, 19.46],
      ['Wrocław', 51.1, 17.03],
      ['Poznań', 52.4, 16.93],
      ['Gdańsk', 54.35, 18.65],
      ['Szczecin', 53.43, 14.55],
      ['Bydgoszcz', 53.12, 18.0],
      ['Lublin', 51.25, 22.57],
      ['Białystok', 53.13, 23.16],
      ['Katowice', 50.26, 19.02],
      ['Gdynia', 54.52, 18.53],
      ['Częstochowa', 50.81, 19.12],
      ['Rzeszów', 50.04, 22.0],
      ['Toruń', 53.01, 18.61],
      ['Gliwice', 50.29, 18.67],
      ['Zabrze', 50.32, 18.79],
      ['Sopot', 54.44, 18.56],
    ];

    it.each(cities)('%s returns pl_* results', (city, lat, lng) => {
      const hits = searchGyms(city, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.filter(h => h.gym.id.startsWith('pl_')).length).toBeGreaterThan(0);
    });
  });

  // ─── 7. ASCII / diacritic search ───────────────────────────────
  describe('7. ASCII/diacritic search', () => {
    const asciiPairs: Array<[string, string, number, number]> = [
      ['Lodz', 'Łódź', 51.76, 19.46],
      ['Wroclaw', 'Wrocław', 51.1, 17.03],
      ['Poznan', 'Poznań', 52.4, 16.93],
      ['Gdansk', 'Gdańsk', 54.35, 18.65],
      ['Bialystok', 'Białystok', 53.13, 23.16],
      ['Czestochowa', 'Częstochowa', 50.81, 19.12],
      ['Rzeszow', 'Rzeszów', 50.04, 22.0],
      ['Torun', 'Toruń', 53.01, 18.61],
    ];

    it.each(asciiPairs)('%s → %s city results', (ascii, official, lat, lng) => {
      const hits = searchGyms(ascii, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.some(h => h.gym.city === official && h.gym.id.startsWith('pl_'))).toBe(true);
    });

    it('Warsaw → Warszawa results', () => {
      const hits = searchGyms('Warsaw', {limit: 40, userLat: 52.23, userLng: 21.01});
      expect(hits.some(h => h.gym.city === 'Warszawa' && h.gym.id.startsWith('pl_'))).toBe(true);
    });

    it('Krakow → Kraków results', () => {
      const hits = searchGyms('Krakow', {limit: 40, userLat: 50.06, userLng: 19.94});
      expect(hits.some(h => h.gym.city === 'Kraków' && h.gym.id.startsWith('pl_'))).toBe(true);
    });
  });

  // ─── 8. Postcode search ────────────────────────────────────────
  describe('8. Postcode search', () => {
    it('exact NN-NNN postcodes return pl_* results', () => {
      const samples = ['05-082', '31-978', '90-440', '50-053', '80-280'];
      for (const pc of samples) {
        const hits = searchGyms(pc, {limit: 20});
        expect(hits.some(h => h.gym.id.startsWith('pl_'))).toBe(true);
      }
    });

    it('stripped-hyphen NNNNN query matches via compact normalization', () => {
      expect(compactGymSearchValue('05-082')).toBe('05082');
      const hits = searchGyms('05082', {limit: 20});
      expect(hits.some(h => h.gym.postalCode === '05-082' && h.gym.id.startsWith('pl_'))).toBe(true);
    });

    it('postcodes remain strings in production', () => {
      for (const c of plCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toBe(String(c.postal_code));
      }
    });
  });

  // ─── 9. Rebrand integrity ──────────────────────────────────────
  describe('9. Rebrand integrity', () => {
    it('no Fitness Platinium current-brand rows in production', () => {
      expect(plCenters.filter(c => c.brand === 'Fitness Platinium').length).toBe(0);
    });

    it('Well Fitness rows with legacy Fitness Platinium metadata are current-brand only', () => {
      const legacyMeta = staging.filter(
        s => s.import_category === 'MERGED_INTO_CATALOG' && s.legacy_brand === 'Fitness Platinium',
      );
      expect(legacyMeta.length).toBe(8);
      for (const s of legacyMeta) {
        const live = findCenterById(s.id!);
        expect(live?.brand).toBe('Well Fitness');
        expect(live?.brand).not.toBe('Fitness Platinium');
      }
    });

    it('Fitness Platinium NEEDS_REVIEW rows not in production', () => {
      const fpReview = staging.filter(
        s => s.import_category === 'NEEDS_REVIEW' && s.brand === 'Fitness Platinium',
      );
      expect(fpReview.length).toBeGreaterThan(0);
      for (const s of fpReview) {
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });
  });

  // ─── 10. Priority brands ───────────────────────────────────────
  describe('10. Priority brands', () => {
    it('Fit Fabric = 21 production rows', () => {
      expect(plCenters.filter(c => c.brand === 'Fit Fabric').length).toBe(21);
    });

    it('Fabryka Formy = 18 production rows', () => {
      expect(plCenters.filter(c => c.brand === 'Fabryka Formy').length).toBe(18);
    });

    it('Xtreme Fitness Gyms = 185', () => {
      expect(plCenters.filter(c => c.brand === 'Xtreme Fitness Gyms').length).toBe(185);
    });

    it('Zdrofit = 212', () => {
      expect(plCenters.filter(c => c.brand === 'Zdrofit').length).toBe(212);
    });

    it('Well Fitness = 97', () => {
      expect(plCenters.filter(c => c.brand === 'Well Fitness').length).toBe(97);
    });

    it('Just GYM = 55', () => {
      expect(plCenters.filter(c => c.brand === 'Just GYM').length).toBe(55);
    });

    it('CityFit = 24', () => {
      expect(plCenters.filter(c => c.brand === 'CityFit').length).toBe(24);
    });

    it('Calypso Fitness = 9', () => {
      expect(plCenters.filter(c => c.brand === 'Calypso Fitness').length).toBe(9);
    });
  });

  // ─── 11. Known co-location ─────────────────────────────────────
  describe('11. Known Well/Zdrofit co-location', () => {
    const wellId = 'pl_3b16c7db04';
    const zdrofitId = 'pl_a8b07a3cbe';

    it('both clubs exist with distinct IDs and brands', () => {
      const well = findGymById(wellId);
      const zdrofit = findGymById(zdrofitId);
      expect(well?.brand).toBe('Well Fitness');
      expect(zdrofit?.brand).toBe('Zdrofit');
      expect(well!.id).not.toBe(zdrofit!.id);
    });

    it('distance ~36m — legitimate different-brand co-location', () => {
      const well = findGymById(wellId)!;
      const zdrofit = findGymById(zdrofitId)!;
      const d = calculateDistance(
        well.latitude,
        well.longitude,
        zdrofit.latitude,
        zdrofit.longitude,
      );
      expect(d).toBeGreaterThan(30);
      expect(d).toBeLessThan(45);
    });

    it('each resolves check-in coords independently', () => {
      const wellCoords = getGymLatLngForCheckIn(wellId);
      const zdrofitCoords = getGymLatLngForCheckIn(zdrofitId);
      expect(wellCoords).not.toBeNull();
      expect(zdrofitCoords).not.toBeNull();
      expect(wellCoords!.latitude).not.toBe(zdrofitCoords!.latitude);
    });
  });

  // ─── 12. Upper Silesia dense gyms ──────────────────────────────
  describe('12. Upper Silesia dense gyms', () => {
    const silesiaCities = ['Katowice', 'Gliwice', 'Zabrze', 'Chorzów', 'Sosnowiec', 'Bytom', 'Tychy'];

    it('each Silesian city has distinct pl_* clubs', () => {
      for (const city of silesiaCities) {
        const inCity = plCenters.filter(c => c.city === city);
        expect(inCity.length).toBeGreaterThan(0);
        const ids = new Set(inCity.map(c => c.id));
        expect(ids.size).toBe(inCity.length);
      }
    });

    it('Katowice has multiple distinct brands', () => {
      const katowice = plCenters.filter(c => c.city === 'Katowice');
      const brands = new Set(katowice.map(c => c.brand));
      expect(brands.size).toBeGreaterThan(1);
    });
  });

  // ─── 13. Tricity ───────────────────────────────────────────────
  describe('13. Tricity (Gdańsk/Gdynia/Sopot)', () => {
    it('Gdańsk, Gdynia, Sopot remain separate city identities', () => {
      expect(plCenters.filter(c => c.city === 'Gdańsk').length).toBeGreaterThan(0);
      expect(plCenters.filter(c => c.city === 'Gdynia').length).toBeGreaterThan(0);
      expect(plCenters.filter(c => c.city === 'Sopot').length).toBeGreaterThan(0);
    });

    it('Tricity cities searchable independently', () => {
      for (const [city, lat, lng] of [
        ['Gdańsk', 54.35, 18.65],
        ['Gdynia', 54.52, 18.53],
        ['Sopot', 54.44, 18.56],
      ] as const) {
        const hits = searchGyms(city, {limit: 20, userLat: lat, userLng: lng});
        expect(hits.some(h => h.gym.city === city && h.gym.id.startsWith('pl_'))).toBe(true);
      }
    });
  });

  // ─── 14. Onboarding / profile ──────────────────────────────────
  describe('14. Onboarding and profile', () => {
    it('Polish gym selectable from active list', () => {
      expect(poland.length).toBe(621);
    });

    it('pl_* ID resolves with display name', () => {
      const sample = poland[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(formatGymDisplayName(resolved)).not.toMatch(/^pl_/);
    });

    it('catalog supports multi-country search (Poland + legacy countries)', () => {
      const plHits = searchGyms('Poland', {limit: 50, userLat: 52.23, userLng: 21.01});
      const dkHits = searchGyms('Denmark', {limit: 50, userLat: 55.67, userLng: 12.57});
      expect(plHits.some(h => h.gym.id.startsWith('pl_'))).toBe(true);
      expect(dkHits.some(h => isDenmarkCountry(h.gym.country))).toBe(true);
      expect(plHits[0]!.gym.country).toBe('Poland');
    });

    it('Zdrofit brand search returns only pl_* (Poland-exclusive brand)', () => {
      const hits = searchGyms('Zdrofit', {limit: 50});
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(h => h.gym.id.startsWith('pl_'))).toBe(true);
    });
  });

  // ─── 15. Nearest gym ───────────────────────────────────────────
  describe('15. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Warszawa', 52.23, 21.01],
      ['Kraków', 50.06, 19.94],
      ['Łódź', 51.76, 19.46],
      ['Wrocław', 51.1, 17.03],
      ['Poznań', 52.4, 16.93],
      ['Gdańsk', 54.35, 18.65],
      ['Katowice', 50.26, 19.02],
    ];

    it.each(coords)('nearest gym in %s is pl_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, poland);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^pl_/);
    });

    it('nearest from Warsaw coords is pl_* (not DK/SE)', () => {
      const nearest = findNearestGym(52.23, 21.01, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^pl_/);
      expect(nearest!.country).toBe('Poland');
    });
  });

  // ─── 16. 200m check-in ─────────────────────────────────────────
  describe('16. 200m check-in radius', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('PL center resolves check-in coords', () => {
      const sample = poland[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      expect(Number.isFinite(coords!.latitude)).toBe(true);
    });

    it('Zdrofit Warsaw check-in coords resolve', () => {
      const zd = findGymById('pl_712cabb4ea');
      expect(getGymLatLngForCheckIn(zd!.id)).not.toBeNull();
    });

    it('500m → blocked', () => {
      expect(decideGeofenceAutoCheckout(500, null, Date.now()).action).toBe('set_away');
    });
    it('250m → blocked', () => {
      expect(decideGeofenceAutoCheckout(250, null, Date.now()).action).toBe('set_away');
    });
    it('201m → triggers away', () => {
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });
    it('200m → still inside', () => {
      const d = decideGeofenceAutoCheckout(200, null, Date.now());
      expect(d.action).not.toBe('checkout_away');
      expect(d.action).not.toBe('set_away');
    });
    it('199m → allowed', () => {
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    });
    it('100m → allowed', () => {
      expect(decideGeofenceAutoCheckout(100, null, Date.now()).action).toBe('none');
    });
    it('10m → allowed', () => {
      expect(decideGeofenceAutoCheckout(10, null, Date.now()).action).toBe('none');
    });

    it('co-located Well vs Zdrofit have independent check-in pins', () => {
      const well = getGymLatLngForCheckIn('pl_3b16c7db04')!;
      const zdrofit = getGymLatLngForCheckIn('pl_a8b07a3cbe')!;
      const d = calculateDistance(well.latitude, well.longitude, zdrofit.latitude, zdrofit.longitude);
      expect(d).toBeLessThan(50);
      expect(d).toBeGreaterThan(0);
    });
  });

  // ─── 17. Core flows ────────────────────────────────────────────
  describe('17. Core flows (workout/history/feed/notifications)', () => {
    it('PL gym resolves — country irrelevant to logging', () => {
      const sample = poland[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
    });

    it('pl_* history resolves to name not raw ID', () => {
      const sample = poland[10] ?? poland[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });

    it('PL session retains correct gym data for feed/share', () => {
      const sample = poland[5] ?? poland[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved!.country).toBe('Poland');
      expect(resolved!.city).toBeTruthy();
    });

    it('notification pl_* resolves without Danish fallback', () => {
      const sample = poland[20] ?? poland[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).not.toBe('Unknown gym');
      expect(resolved.country).toBe('Poland');
    });
  });

  // ─── 18. Map viewport ──────────────────────────────────────────
  describe('18. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Warszawa', 52.23, 21.01],
      ['Kraków', 50.06, 19.94],
      ['Łódź', 51.76, 19.46],
      ['Wrocław', 51.1, 17.03],
      ['Poznań', 52.4, 16.93],
      ['Gdańsk', 54.35, 18.65],
      ['Katowice', 50.26, 19.02],
    ];

    it.each(viewports)('%s viewport shows pl_* pins (not entire catalog)', (_city, lat, lng) => {
      const mapCenters = poland.map(g => ({
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
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(poland.length);
      for (const v of visible) {
        expect(v.id).toMatch(/^pl_/);
      }
    });
  });

  // ─── 19. Staging exclusions ──────────────────────────────────────
  describe('19. Staging exclusions not in production', () => {
    it('621 MERGED_INTO_CATALOG', () => {
      expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(621);
    });

    it('no NEEDS_REVIEW in production (23)', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(23);
      for (const s of nr) {
        expect(plCenters.find(c => c.id === s.id)).toBeUndefined();
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });

    it('no COMING_SOON in production (15)', () => {
      const cs = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(cs.length).toBe(15);
      for (const s of cs) {
        expect(plCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('4 known Xtreme COMING_SOON not in production', () => {
      const xtremeCs = [
        'pl_c6b0d0e282',
        'pl_18c4e21223',
        'pl_5eda123adc',
        'pl_8891a13159',
      ];
      for (const id of xtremeCs) {
        expect(findCenterById(id)).toBeUndefined();
        expect(staging.find(s => s.id === id)?.import_category).toBe('COMING_SOON');
      }
    });
  });

  // ─── 20. Country labels i18n ───────────────────────────────────
  describe('20. Country labels i18n', () => {
    it('gymCountryTranslationKey returns countries.poland', () => {
      expect(gymCountryTranslationKey('Poland')).toBe('countries.poland');
      expect(gymCountryTranslationKey('pl')).toBe('countries.poland');
      expect(gymCountryTranslationKey('Polska')).toBe('countries.poland');
    });

    it('Poland label in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.poland')).toBe('Poland');
      expect(tDa('countries.poland')).toBe('Polen');
      expect(tSv('countries.poland')).toBe('Polen');
      expect(tNb('countries.poland')).toBe('Polen');
    });

    it('gymPickerLocationLine includes Poland', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Warszawa', region: 'Polska', country: 'Poland'},
        t,
      );
      expect(line).toContain('Warszawa');
      expect(line).toContain('Poland');
    });
  });

  // ─── 21. Orphan-ID safety ────────────────────────────────────────
  describe('21. Orphan-ID safety', () => {
    it('invalid pl_xxx does not resolve', () => {
      expect(findGymById('pl_nonexistent_test')).toBeNull();
    });

    it('invalid pl_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('pl_nonexistent_test');
      expect(stub.id).toBe('pl_nonexistent_test');
      expect(stub.region).toBe('Polska');
      expect(stub.name).toBe('Unknown gym');
      expect(getActiveCenters()[0]?.id).not.toBe(stub.id);
    });

    it('relaxed lookup returns null for invalid pl_*', () => {
      expect(findGymByIdRelaxed('pl_nonexistent_test')).toBeNull();
    });

    it('unresolvedGymStub never substitutes live gym', () => {
      const stub = unresolvedGymStub('pl_fake_id');
      expect(stub.region).toBe('Polska');
      expect(Number.isFinite(stub.latitude)).toBe(false);
    });
  });

  // ─── 22. Search typing responsiveness ───────────────────────────
  describe('22. Search typing responsiveness', () => {
    it('prefix queries return pl_* within cached index', () => {
      getGymSearchIndex(gyms);
      const prefixes = [
        ['war', 'warszawa'],
        ['wars', 'warszawa'],
        ['warsz', 'warszawa'],
        ['lod', 'lodz'],
        ['wro', 'wroclaw'],
        ['wrocl', 'wroclaw'],
        ['zdr', 'zdrofit'],
        ['zdro', 'zdrofit'],
        ['xtr', 'xtreme'],
        ['xtre', 'xtreme'],
      ] as const;
      for (const [prefix, full] of prefixes) {
        const prefixHits = searchGyms(prefix, {limit: 30, userLat: 52.23, userLng: 21.01});
        const fullHits = searchGyms(full, {limit: 30, userLat: 52.23, userLng: 21.01});
        expect(prefixHits.some(h => h.gym.id.startsWith('pl_'))).toBe(true);
        expect(fullHits.some(h => h.gym.id.startsWith('pl_'))).toBe(true);
      }
    });

    it('cached index rebuild is fast at 10050', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      const ms = Date.now() - t0;
      expect(ms).toBeLessThan(3000);
    });
  });

  // ─── 23. 10k checkpoint ────────────────────────────────────────
  describe('23. 10k checkpoint', () => {
    it('catalog 10050 crossed 10k threshold', () => {
      expect(catalog.length).toBe(10050);
      expect(catalog.length).toBeGreaterThan(10000);
      expect(catalog.length - 10000).toBe(50);
    });
  });
});
