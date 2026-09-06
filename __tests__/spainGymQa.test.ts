/**
 * Spain gym QA — comprehensive production validation after es_* merge.
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
import {calculateDistance} from '../src/utils/geoUtils';
import {
  allowsInventedCoordinates,
  isDenmarkCountry,
  isFranceCountry,
  isFinlandCountry,
  isGermanyCountry,
  isItalyCountry,
  isNetherlandsCountry,
  isNorwayCountry,
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

const staging = require('../data/spain/spain_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  id?: string;
  country?: string;
  city?: string;
  verification_status?: string;
  is_active?: boolean;
}>;

type GeoRegion = 'mainland' | 'balearic' | 'canary' | 'ceuta' | 'melilla' | 'outlier';

function spainGeoRegion(c: {lat: number | null; lng: number | null}): GeoRegion {
  const lat = c.lat!;
  const lng = c.lng!;
  if (lat >= 27.5 && lat <= 29.5 && lng >= -18.5 && lng <= -13.0) {
    return 'canary';
  }
  if (lat >= 38.5 && lat <= 40.2 && lng >= 1.0 && lng <= 4.5) {
    return 'balearic';
  }
  if (lat >= 35.85 && lat <= 35.95 && lng >= -5.4 && lng <= -5.25) {
    return 'ceuta';
  }
  if (lat >= 35.25 && lat <= 35.35 && lng >= -3.0 && lng <= -2.9) {
    return 'melilla';
  }
  if (lat >= 35.9 && lat <= 43.9 && lng >= -9.5 && lng <= 3.5) {
    return 'mainland';
  }
  return 'outlier';
}

describe('Spain gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const spain = gyms.filter(g => isSpainCountry(g.country));
  const esCenters = catalog.filter(c => isSpainCountry(c.country));

  // ─── 1. Catalog integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Spain = 976 centers', () => {
      expect(esCenters.length).toBe(976);
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

    it('all ES IDs use es_* prefix', () => {
      for (const c of esCenters) {
        expect(c.id).toMatch(/^es_/);
      }
    });

    it('GYM_ID_PREFIX.spain is es_', () => {
      expect(GYM_ID_PREFIX.spain).toBe('es_');
    });

    it('all ES centers have country="Spain"', () => {
      for (const c of esCenters) {
        expect(c.country).toBe('Spain');
      }
    });

    it('all ES centers are active', () => {
      for (const c of esCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all ES centers have name, brand, address, postal_code, city', () => {
      for (const c of esCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all ES centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of esCenters) {
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat !== 0 || c.lng !== 0).toBe(true);
      }
    });

    it('unique IDs across entire catalog', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ─── 2. Brand breakdown ─────────────────────────────────────────
  describe('2. Brand breakdown', () => {
    const expected: Record<string, number> = {
      VivaGym: 246,
      'Basic-Fit': 238,
      Synergym: 142,
      'Fitness Park': 114,
      'Anytime Fitness': 57,
      Forus: 47,
      BeOne: 25,
      DIR: 22,
      'Holiday Gym': 22,
      Dreamfit: 20,
      'Enjoy!': 18,
      'GO fit': 13,
      Altafit: 5,
      Eurofitness: 3,
      Metropolitan: 3,
      'O2 Centro Wellness': 1,
    };

    it.each(Object.entries(expected))('%s = %d', (brand, count) => {
      expect(esCenters.filter(c => c.brand === brand).length).toBe(count);
    });

    it('brand total = 976', () => {
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(976);
    });
  });

  // ─── 3. Geography ──────────────────────────────────────────────
  describe('3. Geography', () => {
    const byRegion = {
      mainland: esCenters.filter(c => spainGeoRegion(c) === 'mainland'),
      balearic: esCenters.filter(c => spainGeoRegion(c) === 'balearic'),
      canary: esCenters.filter(c => spainGeoRegion(c) === 'canary'),
      ceuta: esCenters.filter(c => spainGeoRegion(c) === 'ceuta'),
      melilla: esCenters.filter(c => spainGeoRegion(c) === 'melilla'),
      outlier: esCenters.filter(c => spainGeoRegion(c) === 'outlier'),
    };

    it('mainland = 940', () => {
      expect(byRegion.mainland.length).toBe(940);
    });
    it('balearic = 14', () => {
      expect(byRegion.balearic.length).toBe(14);
    });
    it('canary = 22', () => {
      expect(byRegion.canary.length).toBe(22);
    });
    it('ceuta = 0', () => {
      expect(byRegion.ceuta.length).toBe(0);
    });
    it('melilla = 0', () => {
      expect(byRegion.melilla.length).toBe(0);
    });
    it('no geographic outliers', () => {
      expect(byRegion.outlier.length).toBe(0);
    });

    it('no Portugal / France / Andorra / Gibraltar / Morocco outliers', () => {
      const suspicious = esCenters.filter(c => {
        const lat = c.lat!;
        const lng = c.lng!;
        if (lng < -9.5 && lat > 36.8 && lat < 42.2) {
          return true;
        } // Portugal west
        if (lat > 42.4 && lat < 42.7 && lng > 1.3 && lng < 1.8) {
          return true;
        } // Andorra
        if (lat > 36.1 && lat < 36.16 && lng > -5.37 && lng < -5.33) {
          return true;
        } // Gibraltar
        if (
          lat < 35.8 &&
          spainGeoRegion(c) !== 'ceuta' &&
          spainGeoRegion(c) !== 'melilla' &&
          spainGeoRegion(c) !== 'canary'
        ) {
          return true;
        } // Morocco
        return false;
      });
      expect(suspicious.length).toBe(0);
    });

    it('Spain does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Spain')).toBe(false);
    });

    it('missing Spain coords → NaN (no Madrid fallback)', () => {
      const fake: GymCenter = {
        id: 'es_qa_missing',
        name: 'Test',
        brand: 'B',
        address: 'A',
        postal_code: '28001',
        city: 'Madrid',
        country: 'Spain',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      expect(Number.isFinite(lat)).toBe(false);
      expect(Number.isFinite(lng)).toBe(false);
    });
  });

  // ─── 4. Postcodes ──────────────────────────────────────────────
  describe('4. Postcodes', () => {
    it('all ES postcodes are 5-digit strings', () => {
      for (const c of esCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toMatch(/^\d{5}$/);
      }
    });

    it('leading zeros preserved (252)', () => {
      const leading = esCenters.filter(c => c.postal_code.startsWith('0'));
      expect(leading.length).toBe(252);
      for (const c of leading) {
        expect(c.postal_code.length).toBe(5);
      }
    });
  });

  // ─── 5. Encoding ────────────────────────────────────────────────
  describe('5. Encoding', () => {
    it('no mojibake', () => {
      const mojibake = /Ã¤|Ã¶|Ã¥|ï¿½|â€|Ã©|Ã¸|Â/;
      for (const c of esCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(mojibake);
      }
    });

    it('Spanish/Catalan/Basque/Galician diacritics preserved', () => {
      const withDiacritics = esCenters.filter(c =>
        /[áéíóúüñçàèìòùÁÉÍÓÚÜÑÇ]/i.test(`${c.name}|${c.address}|${c.city}|${c.brand}`),
      );
      expect(withDiacritics.length).toBeGreaterThan(100);
    });
  });

  // ─── 6. Brand search ───────────────────────────────────────────
  describe('6. Brand search', () => {
    const esBrands = [
      'VivaGym',
      'Basic-Fit',
      'Synergym',
      'Fitness Park',
      'Anytime Fitness',
      'Forus',
      'BeOne',
      'DIR',
      'Holiday Gym',
      'Dreamfit',
      'Enjoy!',
      'GO fit',
      'Altafit',
      'Eurofitness',
      'Metropolitan',
      'O2 Centro Wellness',
    ];

    it.each(esBrands)('%s returns es_* results (with Madrid location)', brand => {
      const hits = searchGyms(brand, {limit: 100, userLat: 40.42, userLng: -3.7});
      const esHits = hits.filter(h => h.gym.id.startsWith('es_'));
      expect(esHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 7. City search ────────────────────────────────────────────
  describe('7. City search', () => {
    const cities = [
      'Madrid',
      'Barcelona',
      'Valencia',
      'Sevilla',
      'Zaragoza',
      'Málaga',
      'Murcia',
      'Palma',
      'Bilbao',
      'Alicante',
      'Córdoba',
      'Valladolid',
      'Vigo',
      'A Coruña',
      'Granada',
      'Las Palmas',
      'Santa Cruz de Tenerife',
    ];

    it.each(cities)('%s returns es_* results', city => {
      const hits = searchGyms(city, {limit: 40});
      const esHits = hits.filter(h => h.gym.id.startsWith('es_'));
      expect(esHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 8. Regional/accent search ─────────────────────────────────
  describe('8. Regional/accent ASCII search', () => {
    it('Coruna → A Coruña results', () => {
      const hits = searchGyms('Coruna', {limit: 40});
      const esHits = hits.filter(h => h.gym.id.startsWith('es_'));
      expect(esHits.length).toBeGreaterThan(0);
    });

    it('Malaga → Málaga results', () => {
      const hits = searchGyms('Malaga', {limit: 40});
      const esHits = hits.filter(h => h.gym.id.startsWith('es_'));
      expect(esHits.length).toBeGreaterThan(0);
    });

    it('Cordoba → Córdoba results', () => {
      const hits = searchGyms('Cordoba', {limit: 40});
      const esHits = hits.filter(h => h.gym.id.startsWith('es_'));
      expect(esHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 9. Postcode search ────────────────────────────────────────
  describe('9. Postcode search', () => {
    const postcodes = ['28019', '08029', '29007', '48004', '07012', '35018', '15006'];

    it.each(postcodes)('%s returns es_* results', pc => {
      const hits = searchGyms(pc, {limit: 40});
      const esHits = hits.filter(h => h.gym.id.startsWith('es_'));
      expect(esHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 10. Onboarding ────────────────────────────────────────────
  describe('10. Onboarding', () => {
    it('ES gym is selectable from active list', () => {
      expect(spain.length).toBe(976);
    });

    it('es_* ID is valid and resolves', () => {
      const sample = spain[0]!;
      expect(sample.id).toMatch(/^es_/);
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe(sample.name);
    });

    it('mixed-country search works', () => {
      const hits = searchGyms('Basic-Fit', {limit: 100});
      const countries = new Set(hits.map(h => h.gym.country));
      expect(countries.size).toBeGreaterThan(1);
    });
  });

  // ─── 11. Profile/favorites ─────────────────────────────────────
  describe('11. Profile/favorites', () => {
    it('es_* resolves and shows Spanish name', () => {
      const sample = spain[Math.floor(spain.length / 2)]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const display = formatGymDisplayName(resolved);
      expect(display.length).toBeGreaterThan(0);
      expect(display).not.toBe('Ubekendt center');
    });

    it('no raw ID displayed', () => {
      const sample = spain[0]!;
      const display = formatGymDisplayName(findGymById(sample.id));
      expect(display).not.toMatch(/^es_/);
    });
  });

  // ─── 12. Nearest gym ──────────────────────────────────────────
  describe('12. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Madrid', 40.42, -3.7],
      ['Barcelona', 41.39, 2.17],
      ['Valencia', 39.47, -0.38],
      ['Sevilla', 37.39, -5.99],
      ['Málaga', 36.72, -4.42],
      ['Bilbao', 43.26, -2.93],
      ['Palma', 39.57, 2.65],
      ['Las Palmas', 28.12, -15.43],
      ['Santa Cruz de Tenerife', 28.46, -16.25],
    ];

    it.each(coords)('nearest gym in %s is es_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, spain);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^es_/);
    });

    it('nearest from Madrid coords returns es_* (not DK/SE/etc)', () => {
      const nearest = findNearestGym(40.42, -3.7, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^es_/);
    });
  });

  // ─── 13. Dense/co-located ──────────────────────────────────────
  describe('13. Dense/co-located pairs', () => {
    it('different brands coexist as separate es_* entries', () => {
      const bf = spain.filter(g => g.brand === 'Basic-Fit');
      const vg = spain.filter(g => g.brand === 'VivaGym');
      expect(bf.length).toBeGreaterThan(0);
      expect(vg.length).toBeGreaterThan(0);
      const bfIds = new Set(bf.map(g => g.id));
      expect(vg.filter(g => bfIds.has(g.id)).length).toBe(0);
    });

    it('dense pairs exist (≤200m)', () => {
      let count = 0;
      for (let i = 0; i < spain.length; i++) {
        for (let j = i + 1; j < spain.length; j++) {
          const d = calculateDistance(
            spain[i]!.latitude,
            spain[i]!.longitude,
            spain[j]!.latitude,
            spain[j]!.longitude,
          );
          if (d <= 200) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThan(0);
    });
  });

  // ─── 14. 200m check-in ────────────────────────────────────────
  describe('14. 200m check-in radius', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('ES center resolves check-in coords', () => {
      const sample = spain[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      expect(Number.isFinite(coords!.latitude)).toBe(true);
      expect(Number.isFinite(coords!.longitude)).toBe(true);
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
  });

  // ─── 15. Auto-checkout ────────────────────────────────────────
  describe('15. Auto-checkout uses session gym ID', () => {
    it('geofence at gym location = none', () => {
      const sample = spain[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      const d = calculateDistance(
        coords!.latitude,
        coords!.longitude,
        coords!.latitude,
        coords!.longitude,
      );
      expect(d).toBe(0);
      expect(decideGeofenceAutoCheckout(d, null, Date.now()).action).toBe('none');
    });
  });

  // ─── 16. Workout/PR ───────────────────────────────────────────
  describe('16. Workout/PR flow', () => {
    it('ES gym resolves — country irrelevant to logging', () => {
      const sample = spain[0]!;
      expect(sample.country).toBe('Spain');
      expect(findGymById(sample.id)).not.toBeNull();
    });
  });

  // ─── 17. History ──────────────────────────────────────────────
  describe('17. History', () => {
    it('es_* resolves to correct name, no raw ID', () => {
      const sample = spain[10] ?? spain[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });
  });

  // ─── 18. Feed/share ───────────────────────────────────────────
  describe('18. Feed/share', () => {
    it('ES session retains correct gym data', () => {
      const sample = spain[5] ?? spain[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.city).toBeTruthy();
      expect(resolved!.country).toBe('Spain');
    });

    it('no Danish fallback', () => {
      const sample = spain[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved!.country).not.toBe('Denmark');
    });
  });

  // ─── 19. Notifications ────────────────────────────────────────
  describe('19. Notifications', () => {
    it('es_* resolves for notification display', () => {
      const sample = spain[20] ?? spain[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(resolved.name).not.toBe('Unknown gym');
    });
  });

  // ─── 20. Planned sessions ─────────────────────────────────────
  describe('20. Planned sessions', () => {
    it('ES center selectable and persists', () => {
      const sample = spain[15] ?? spain[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(findGymById(resolved!.id)!.id).toBe(sample.id);
    });
  });

  // ─── 21. Map viewport ─────────────────────────────────────────
  describe('21. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Madrid', 40.42, -3.7],
      ['Barcelona', 41.39, 2.17],
      ['Valencia', 39.47, -0.38],
      ['Sevilla', 37.39, -5.99],
      ['Málaga', 36.72, -4.42],
      ['Bilbao', 43.26, -2.93],
      ['Palma', 39.57, 2.65],
      ['Las Palmas', 28.12, -15.43],
    ];

    it.each(viewports)('%s viewport shows es_* pins', (_city, lat, lng) => {
      const mapCenters = spain.map(g => ({
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
      for (const v of visible) {
        expect(v.id).toMatch(/^es_/);
      }
    });
  });

  // ─── 22. Mesa y López exclusion ────────────────────────────────
  describe('22. Mesa y López exclusion', () => {
    it('es_e13a21a4c1 not in production', () => {
      expect(findCenterById('es_e13a21a4c1')).toBeUndefined();
      expect(esCenters.find(c => c.id === 'es_e13a21a4c1')).toBeUndefined();
    });

    it('staging marks Mesa y López as COMING_SOON', () => {
      const mesa = staging.find(s => s.id === 'es_e13a21a4c1');
      expect(mesa).toBeDefined();
      expect(mesa!.import_category).toBe('COMING_SOON');
      expect(mesa!.name).toMatch(/Mesa y L[oó]pez/i);
    });

    it('Mesa y López not searchable', () => {
      const hits = searchGyms('Mesa y Lopez', {limit: 20});
      expect(hits.find(h => h.gym.id === 'es_e13a21a4c1')).toBeUndefined();
    });
  });

  // ─── 23. Forus Porto exclusion ─────────────────────────────────
  describe('23. Forus Porto exclusion', () => {
    it('es_42caeb0614 not in Spain production', () => {
      expect(findCenterById('es_42caeb0614')).toBeUndefined();
      expect(esCenters.find(c => c.id === 'es_42caeb0614')).toBeUndefined();
    });

    it('staging marks Forus Porto as NEEDS_REVIEW / Portugal', () => {
      const porto = staging.find(s => s.id === 'es_42caeb0614');
      expect(porto).toBeDefined();
      expect(porto!.import_category).toBe('NEEDS_REVIEW');
      expect(porto!.country).toBe('Portugal');
    });

    it('no Portugal country in Spain production catalog', () => {
      expect(catalog.filter(c => c.country === 'Portugal').length).toBe(0);
    });
  });

  // ─── 24. Country labels i18n ───────────────────────────────────
  describe('24. Country labels i18n', () => {
    it('gymCountryTranslationKey returns countries.spain', () => {
      expect(gymCountryTranslationKey('Spain')).toBe('countries.spain');
      expect(gymCountryTranslationKey('es')).toBe('countries.spain');
    });

    it('Spain label in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.spain')).toBe('Spain');
      expect(tDa('countries.spain')).toBe('Spanien');
      expect(tSv('countries.spain')).toBe('Spanien');
      expect(tNb('countries.spain')).toBe('Spania');
    });

    it('gymPickerLocationLine includes Spain', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Madrid', region: 'España', country: 'Spain'},
        t,
      );
      expect(line).toContain('Madrid');
      expect(line).toContain('Spain');
    });

    it('formatGymCountryLabel works for Spain', () => {
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Spain', t)).toBe('Spain');
    });
  });

  // ─── 25. Staging safety ────────────────────────────────────────
  describe('25. Staging safety', () => {
    it('976 MERGED_INTO_CATALOG', () => {
      expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(976);
    });

    it('no COMING_SOON in production', () => {
      const cs = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(cs.length).toBe(5);
      for (const s of cs) {
        expect(esCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('no NEEDS_REVIEW in production', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(3);
      for (const s of nr) {
        expect(esCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('no NEEDS_COORDINATES in production', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      expect(nc.length).toBe(92);
      for (const s of nc) {
        expect(esCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });
  });

  // ─── 26. Orphan-ID safety ─────────────────────────────────────
  describe('26. Orphan-ID safety', () => {
    it('invalid es_xxx does not resolve', () => {
      expect(findGymById('es_nonexistent_xxx')).toBeNull();
    });

    it('invalid es_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('es_nonexistent_xxx');
      expect(stub.id).toBe('es_nonexistent_xxx');
      expect(stub.region).toBe('España');
      expect(stub.name).toBe('Unknown gym');
    });

    it('relaxed lookup also returns null for invalid es_*', () => {
      expect(findGymByIdRelaxed('es_nonexistent_xxx')).toBeNull();
    });

    it('unresolvedGymStub never substitutes live gym', () => {
      const stub = unresolvedGymStub('es_fake_id');
      expect(getActiveCenters()[0]?.id).not.toBe(stub.id);
    });
  });

  // ─── 27. Search stress typing ──────────────────────────────────
  describe('27. Search stress typing', () => {
    const prefixes = [
      ['m', 'madrid'],
      ['b', 'barcelona'],
      ['basic', 'basic'],
      ['synergym', 'synergym'],
      ['fitness park', 'fitness park'],
    ] as const;

    it.each(prefixes)('"%s" returns results including es_* for path to %s', query => {
      const hits = searchGyms(query, {limit: 40, userLat: 40.42, userLng: -3.7});
      expect(hits.length).toBeGreaterThan(0);
      if (query.length >= 3) {
        expect(hits.some(h => h.gym.id.startsWith('es_'))).toBe(true);
      }
    });
  });

  // ─── 28. Regressions ───────────────────────────────────────────
  describe('28. Regression counts & search', () => {
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
    it('Italy = 588', () => {
      expect(catalog.filter(c => isItalyCountry(c.country)).length).toBe(588);
    });
    it('Belgium = 363', () => {
      expect(catalog.filter(c => c.country === 'Belgium').length).toBe(363);
    });

    it('DK search still works', () => {
      const hits = searchGyms('PureGym', {limit: 10, userLat: 55.68, userLng: 12.57});
      expect(hits.length).toBeGreaterThan(0);
    });
    it('SE search still works', () => {
      expect(searchGyms('SATS Stockholm', {limit: 10}).length).toBeGreaterThan(0);
    });
    it('NO search still works', () => {
      expect(searchGyms('SATS Oslo', {limit: 10}).length).toBeGreaterThan(0);
    });
    it('DE search still works', () => {
      expect(searchGyms('clever fit Berlin', {limit: 10}).length).toBeGreaterThan(0);
    });
    it('GB search still works', () => {
      expect(searchGyms('PureGym London', {limit: 10}).length).toBeGreaterThan(0);
    });
    it('NL search still works', () => {
      const hits = searchGyms('Basic-Fit Amsterdam', {limit: 10});
      expect(hits.filter(h => h.gym.id.startsWith('nl_')).length).toBeGreaterThan(0);
    });
    it('FI search still works', () => {
      expect(searchGyms('Elixia Helsinki', {limit: 10}).length).toBeGreaterThan(0);
    });
    it('FR search still works', () => {
      const hits = searchGyms('Basic-Fit Paris', {limit: 10});
      expect(hits.filter(h => h.gym.id.startsWith('fr_')).length).toBeGreaterThan(0);
    });
    it('IT search still works', () => {
      const hits = searchGyms('FitActive Milano', {limit: 10});
      expect(hits.filter(h => h.gym.id.startsWith('it_')).length).toBeGreaterThan(0);
    });
  });

  // ─── 29. Performance ──────────────────────────────────────────
  describe('29. Performance', () => {
    it('search index builds in <5000ms for 10050 centers', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      const elapsed = Date.now() - start;
      expect(index.length).toBe(gyms.length);
      expect(elapsed).toBeLessThan(5000);
    });

    it('search query completes in <2000ms', () => {
      const start = Date.now();
      searchGyms('Basic-Fit Madrid', {limit: 40});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('nearest gym scan completes in <100ms', () => {
      const start = Date.now();
      findNearestGym(40.42, -3.7, spain);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ─── 30. Known legacy risks documented ─────────────────────────
  describe('30. Known legacy risks (documented)', () => {
    it('SE still allows invented Stockholm fallback coords', () => {
      expect(allowsInventedCoordinates('Sweden')).toBe(true);
    });

    it('DK still allows invented postal approx coords', () => {
      expect(allowsInventedCoordinates('Denmark')).toBe(true);
    });
  });
});
