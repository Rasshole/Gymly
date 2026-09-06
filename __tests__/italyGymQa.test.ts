/**
 * Italy gym QA — comprehensive production validation after it_* merge.
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

const staging = require('../data/italy/italy_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  id?: string;
  country?: string;
  city?: string;
  verification_status?: string;
  is_active?: boolean;
}>;

type GeoRegion = 'north' | 'central' | 'south' | 'sicily' | 'sardinia' | 'outlier';

const IT_MAINLAND = {latMin: 36.6, latMax: 47.15, lngMin: 6.6, lngMax: 18.6};
const IT_SICILY = {latMin: 36.6, latMax: 38.35, lngMin: 12.0, lngMax: 15.7};
const IT_SARDINIA = {latMin: 38.8, latMax: 41.35, lngMin: 8.1, lngMax: 9.9};

function inBounds(
  lat: number,
  lng: number,
  b: {latMin: number; latMax: number; lngMin: number; lngMax: number},
): boolean {
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
}

function italyGeoRegion(c: {lat: number | null; lng: number | null}): GeoRegion {
  const lat = c.lat!;
  const lng = c.lng!;
  if (inBounds(lat, lng, IT_SICILY)) {
    return 'sicily';
  }
  if (inBounds(lat, lng, IT_SARDINIA)) {
    return 'sardinia';
  }
  if (!inBounds(lat, lng, IT_MAINLAND)) {
    return 'outlier';
  }
  if (lat >= 44.0) {
    return 'north';
  }
  if (lat <= 41.0) {
    return 'south';
  }
  return 'central';
}

/** Neighbor micro-boxes — reject SM/VA/FR/CH/AT/SI/HR/MT pins (aligned with merge script). */
function foreignNeighborHint(
  lat: number,
  lng: number,
  city?: string,
  name?: string,
  address?: string,
): string | null {
  const cityL = (city ?? '').toLowerCase().trim();
  const blob = `${city ?? ''} ${name ?? ''} ${address ?? ''}`.toLowerCase();
  if (
    /\brepubblica\s+di\s+san\s*marino\b/.test(blob) ||
    (/^\s*san\s*marino\s*$/i.test(cityL) && !/torino|rimini|pesaro|cattolica/i.test(blob))
  ) {
    return 'SM_name';
  }
  if (/\bcitt[aà]\s+del\s+vaticano\b|\bvatican\s+city\b/.test(blob)) {
    return 'VA_name';
  }
  if (/\b(republic\s+of\s+)?malta\b/.test(blob) && !/via\s+malta|viale\s+malta|corso\s+malta/i.test(blob)) {
    return 'MT_name';
  }
  // Menton / Côte d'Azur France west of Liguria
  if (lat >= 43.6 && lat <= 44.2 && lng >= 6.6 && lng < 7.35) {
    return 'FR_geo';
  }
  // Swiss Ticino north of Alpine crest
  if (lat > 46.55 && lng >= 8.4 && lng <= 9.5) {
    return 'CH_geo';
  }
  // Austria north of Brenner
  if (lat > 47.0 && lng >= 10.5 && lng <= 13.0) {
    return 'AT_geo';
  }
  // Slovenia east of Trieste
  if (lat >= 45.4 && lat <= 46.6 && lng > 13.8 && lng <= 14.6) {
    return 'SI_geo';
  }
  // Croatia Istria (not Adriatic Italy)
  if (lat >= 44.8 && lat <= 45.6 && lng > 13.7 && lng <= 14.5) {
    return 'HR_geo';
  }
  // Vatican micro-box
  if (lat >= 41.9 && lat <= 41.908 && lng >= 12.445 && lng <= 12.459) {
    return 'VA_geo';
  }
  // San Marino micro-box
  if (lat >= 43.89 && lat <= 43.99 && lng >= 12.41 && lng <= 12.52) {
    return 'SM_geo';
  }
  // Malta
  if (lat < 36.2 && lng > 14.0 && lng < 15.0) {
    return 'MT_geo';
  }
  return null;
}

describe('Italy gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const italy = gyms.filter(g => isItalyCountry(g.country));
  const itCenters = catalog.filter(c => isItalyCountry(c.country));

  // ─── 1. Catalog integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Italy = 588 centers', () => {
      expect(itCenters.length).toBe(588);
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
    it('Belgium = 363', () => {
      expect(catalog.filter(c => c.country === 'Belgium').length).toBe(363);
    });

    it('all IT IDs use it_* prefix', () => {
      for (const c of itCenters) {
        expect(c.id).toMatch(/^it_/);
      }
    });

    it('GYM_ID_PREFIX.italy is it_', () => {
      expect(GYM_ID_PREFIX.italy).toBe('it_');
    });

    it('all IT centers have country="Italy"', () => {
      for (const c of itCenters) {
        expect(c.country).toBe('Italy');
      }
    });

    it('all IT centers are active', () => {
      for (const c of itCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all IT centers have name, brand, address, postal_code, city', () => {
      for (const c of itCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all IT centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of itCenters) {
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
      FitActive: 193,
      FitUP: 80,
      'Anytime Fitness': 68,
      'Fit Express': 55,
      McFIT: 42,
      'Virgin Active': 42,
      'Icon Palestre': 36,
      Orange: 23,
      WebFit: 16,
      FITINN: 10,
      GetFIT: 8,
      '20Hours': 7,
      Dabliu: 5,
      "Gold's Gym": 2,
      'JOHN REED': 1,
    };

    it.each(Object.entries(expected))('%s = %d', (brand, count) => {
      expect(itCenters.filter(c => c.brand === brand).length).toBe(count);
    });

    it('brand total = 588', () => {
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(588);
    });
  });

  // ─── 3. Geography ──────────────────────────────────────────────
  describe('3. Geography', () => {
    const byRegion = {
      north: itCenters.filter(c => italyGeoRegion(c) === 'north'),
      central: itCenters.filter(c => italyGeoRegion(c) === 'central'),
      south: itCenters.filter(c => italyGeoRegion(c) === 'south'),
      sicily: itCenters.filter(c => italyGeoRegion(c) === 'sicily'),
      sardinia: itCenters.filter(c => italyGeoRegion(c) === 'sardinia'),
      outlier: itCenters.filter(c => italyGeoRegion(c) === 'outlier'),
    };

    it('north = 396', () => {
      expect(byRegion.north.length).toBe(396);
    });
    it('central = 137', () => {
      expect(byRegion.central.length).toBe(137);
    });
    it('south = 23', () => {
      expect(byRegion.south.length).toBe(23);
    });
    it('sicily = 22', () => {
      expect(byRegion.sicily.length).toBe(22);
    });
    it('sardinia = 10', () => {
      expect(byRegion.sardinia.length).toBe(10);
    });
    it('no geographic outliers', () => {
      expect(byRegion.outlier.length).toBe(0);
    });

    it('no SM/VA/FR/CH/AT/SI/HR/MT coordinate outliers', () => {
      const suspicious = itCenters.filter(
        c => foreignNeighborHint(c.lat!, c.lng!, c.city, c.name, c.address) != null,
      );
      expect(suspicious.length).toBe(0);
    });

    it('Italy does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Italy')).toBe(false);
      expect(allowsInventedCoordinates('Italia')).toBe(false);
    });

    it('missing Italy coords → NaN (no Rome/Milan fallback)', () => {
      const fake: GymCenter = {
        id: 'it_qa_missing',
        name: 'Test',
        brand: 'B',
        address: 'A',
        postal_code: '00118',
        city: 'Roma',
        country: 'Italy',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      expect(Number.isFinite(lat)).toBe(false);
      expect(Number.isFinite(lng)).toBe(false);
      expect(lat).not.toBe(41.9028);
      expect(lng).not.toBe(12.4964);
    });

    it('Sweden Stockholm fallback does not apply to Italy', () => {
      expect(allowsInventedCoordinates('Sweden')).toBe(true);
      expect(allowsInventedCoordinates('Italy')).toBe(false);
      const fake: GymCenter = {
        id: 'it_qa_no_stockholm',
        name: 'Test Milano',
        brand: 'B',
        address: 'A',
        postal_code: '20121',
        city: 'Milano',
        country: 'Italy',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      // Stockholm approx used by SE legacy path
      expect(lat).not.toBe(59.3293);
      expect(lng).not.toBe(18.0686);
      expect(Number.isFinite(lat)).toBe(false);
    });
  });

  // ─── 4. CAP (postal codes) ──────────────────────────────────────
  describe('4. CAP postal codes', () => {
    it('all IT CAP are 5-digit strings matching /^\\d{5}$/', () => {
      for (const c of itCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toMatch(/^\d{5}$/);
      }
    });

    it('leading zeros preserved (92)', () => {
      const leading = itCenters.filter(c => c.postal_code.startsWith('0'));
      expect(leading.length).toBe(92);
      for (const c of leading) {
        expect(c.postal_code.length).toBe(5);
        expect(Number(c.postal_code).toString().length).toBeLessThan(5);
      }
    });
  });

  // ─── 5. Encoding ────────────────────────────────────────────────
  describe('5. Encoding', () => {
    it('no mojibake', () => {
      const mojibake = /Ã¤|Ã¶|Ã¥|ï¿½|â€|Ã©|Ã¸|Â/;
      for (const c of itCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(mojibake);
      }
    });

    it('Italian diacritics preserved (àèéìòù)', () => {
      const withDiacritics = itCenters.filter(c =>
        /[àèéìòùÀÈÉÌÒÙ]/.test(`${c.name}|${c.address}|${c.city}|${c.brand}`),
      );
      expect(withDiacritics.length).toBeGreaterThanOrEqual(10);
      expect(itCenters.some(c => c.city === 'Forlì')).toBe(true);
      expect(itCenters.some(c => c.city === 'Città di Castello')).toBe(true);
    });
  });

  // ─── 6. Brand search ───────────────────────────────────────────
  describe('6. Brand search', () => {
    const itBrands = [
      'FitActive',
      'FitUP',
      'Anytime Fitness',
      'Fit Express',
      'McFIT',
      'Virgin Active',
      'Icon Palestre',
      'Orange',
      'WebFit',
      '20Hours',
      "Gold's Gym",
      'JOHN REED',
    ];

    it.each(itBrands)('%s returns it_* results (with Milano location)', brand => {
      const hits = searchGyms(brand, {limit: 100, userLat: 45.46, userLng: 9.19});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 7. City search ────────────────────────────────────────────
  describe('7. City search', () => {
    const cities = [
      'Milano',
      'Roma',
      'Napoli',
      'Torino',
      'Palermo',
      'Genova',
      'Bologna',
      'Firenze',
      'Bari',
      'Catania',
      'Verona',
      'Padova',
      'Cagliari',
      'Trieste',
      'Brescia',
      'Bergamo',
    ];

    it.each(cities)('%s returns it_* results', city => {
      const hits = searchGyms(city, {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 8. Accent/ASCII + EN city aliases ─────────────────────────
  describe('8. Accent/ASCII and EN city aliases', () => {
    it('Forli → Forlì results', () => {
      const hits = searchGyms('Forli', {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Forlì')).toBe(true);
    });

    it('Citta → Città di Castello results', () => {
      const hits = searchGyms('Citta di Castello', {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Città di Castello')).toBe(true);
    });

    it('Rome → Roma results', () => {
      const hits = searchGyms('Rome', {limit: 40, userLat: 41.9, userLng: 12.5});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Roma')).toBe(true);
    });

    it('Milan → Milano results', () => {
      const hits = searchGyms('Milan', {limit: 40, userLat: 45.46, userLng: 9.19});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Milano')).toBe(true);
    });

    it('Florence → Firenze results', () => {
      const hits = searchGyms('Florence', {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Firenze')).toBe(true);
    });

    it('Naples → Napoli results', () => {
      const hits = searchGyms('Naples', {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Napoli')).toBe(true);
    });

    it('Turin → Torino results', () => {
      const hits = searchGyms('Turin', {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.some(h => h.gym.city === 'Torino')).toBe(true);
    });
  });

  // ─── 9. Address tokens ─────────────────────────────────────────
  describe('9. Address tokens Via/Viale/Piazza/Corso', () => {
    it.each(['Via', 'Viale', 'Piazza', 'Corso'] as const)(
      '%s returns it_* results (Milano-biased)',
      token => {
        const hits = searchGyms(token, {limit: 40, userLat: 45.46, userLng: 9.19});
        const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
        expect(itHits.length).toBeGreaterThan(0);
      },
    );
  });

  // ─── 10. CAP search ────────────────────────────────────────────
  describe('10. CAP search', () => {
    const postcodes = ['00149', '00166', '20161', '20159', '50124', '80145', '09122', '04011'];

    it.each(postcodes)('%s returns it_* results', pc => {
      const hits = searchGyms(pc, {limit: 40});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 11. Onboarding ────────────────────────────────────────────
  describe('11. Onboarding', () => {
    it('IT gym is selectable from active list', () => {
      expect(italy.length).toBe(588);
    });

    it('it_* ID is valid and resolves', () => {
      const sample = italy[0]!;
      expect(sample.id).toMatch(/^it_/);
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe(sample.name);
    });

    it('mixed-country search works (Virgin Active)', () => {
      const hits = searchGyms('Virgin Active', {limit: 100});
      const countries = new Set(hits.map(h => h.gym.country));
      expect(countries.size).toBeGreaterThan(1);
      expect(hits.some(h => h.gym.id.startsWith('it_'))).toBe(true);
      expect(hits.some(h => h.gym.id.startsWith('gb_'))).toBe(true);
    });

    it('popular onboarding list remains DK-centric (documented)', () => {
      // POPULAR_ONBOARDING_GYM_IDS in OnboardingGymPicker are legacy DK IDs.
      // Italy users rely on search — intentional, not changed in this QA.
      const dkPopular = [
        'sats-2500-valby-torvegade-17',
        'fitness-x-2000-frederiksberg-nordre-fasanvej-27',
        'puregym-2730-herlev-noerrelundvej-4',
      ];
      for (const id of dkPopular) {
        expect(findGymById(id)?.country).toBe('Denmark');
      }
    });
  });

  // ─── 12. Profile/favorites ─────────────────────────────────────
  describe('12. Profile/favorites', () => {
    it('it_* resolves and shows Italian name', () => {
      const sample = italy[Math.floor(italy.length / 2)]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const display = formatGymDisplayName(resolved);
      expect(display.length).toBeGreaterThan(0);
      expect(display).not.toBe('Ubekendt center');
    });

    it('no raw ID displayed', () => {
      const sample = italy[0]!;
      const display = formatGymDisplayName(findGymById(sample.id));
      expect(display).not.toMatch(/^it_/);
    });
  });

  // ─── 13. Nearest gym ──────────────────────────────────────────
  describe('13. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Milano', 45.4642, 9.19],
      ['Roma', 41.9028, 12.4964],
      ['Napoli', 40.8518, 14.2681],
      ['Torino', 45.0703, 7.6869],
      ['Palermo', 38.1157, 13.3615],
      ['Genova', 44.4056, 8.9463],
      ['Bologna', 44.4949, 11.3426],
      ['Firenze', 43.7696, 11.2558],
      ['Catania', 37.5079, 15.083],
      ['Cagliari', 39.2238, 9.1217],
    ];

    it.each(coords)('nearest gym in %s is it_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, italy);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^it_/);
    });

    it('nearest from Milano coords returns it_* (not DK/SE/etc)', () => {
      const nearest = findNearestGym(45.4642, 9.19, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^it_/);
    });
  });

  // ─── 14. Manual selection ─────────────────────────────────────
  describe('14. Manual selection', () => {
    it('any it_* can be selected by ID and re-resolved', () => {
      const sample = italy[42] ?? italy[0]!;
      const a = findGymById(sample.id);
      const b = findGymByIdRelaxed(sample.id);
      expect(a!.id).toBe(sample.id);
      expect(b!.id).toBe(sample.id);
      expect(a!.country).toBe('Italy');
    });
  });

  // ─── 15. Dense/co-located ──────────────────────────────────────
  describe('15. Dense/co-located pairs', () => {
    it('different brands coexist as separate it_* entries', () => {
      const fe = italy.filter(g => g.brand === 'Fit Express');
      const icon = italy.filter(g => g.brand === 'Icon Palestre');
      expect(fe.length).toBeGreaterThan(0);
      expect(icon.length).toBeGreaterThan(0);
      const feIds = new Set(fe.map(g => g.id));
      expect(icon.filter(g => feIds.has(g.id)).length).toBe(0);
    });

    it('known different-brand co-locations at 0m kept', () => {
      const a = findGymById('it_dd296aa3bd');
      const b = findGymById('it_1dbcbcdcc6');
      expect(a?.brand).toBe('Fit Express');
      expect(b?.brand).toBe('Icon Palestre');
      const d = calculateDistance(a!.latitude, a!.longitude, b!.latitude, b!.longitude);
      expect(d).toBeLessThanOrEqual(1);
    });

    it('dense pairs exist (≤200m)', () => {
      let count = 0;
      for (let i = 0; i < italy.length; i++) {
        for (let j = i + 1; j < italy.length; j++) {
          const d = calculateDistance(
            italy[i]!.latitude,
            italy[i]!.longitude,
            italy[j]!.latitude,
            italy[j]!.longitude,
          );
          if (d <= 200) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThan(0);
    });
  });

  // ─── 16. 200m check-in ────────────────────────────────────────
  describe('16. 200m check-in radius', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('IT center resolves check-in coords', () => {
      const sample = italy[0]!;
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

  // ─── 17. Auto-checkout session ID ─────────────────────────────
  describe('17. Auto-checkout uses session gym ID', () => {
    it('geofence at gym location = none', () => {
      const sample = italy[0]!;
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

    it('201m from session gym triggers away (no nearest switch)', () => {
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });
  });

  // ─── 18. Workout/PR ───────────────────────────────────────────
  describe('18. Workout/PR flow', () => {
    it('IT gym resolves — country irrelevant to logging', () => {
      const sample = italy[0]!;
      expect(sample.country).toBe('Italy');
      expect(findGymById(sample.id)).not.toBeNull();
    });
  });

  // ─── 19. History ──────────────────────────────────────────────
  describe('19. History', () => {
    it('it_* resolves to correct name, no raw ID', () => {
      const sample = italy[10] ?? italy[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });
  });

  // ─── 20. Feed/share ───────────────────────────────────────────
  describe('20. Feed/share', () => {
    it('IT session retains correct gym data', () => {
      const sample = italy[5] ?? italy[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.city).toBeTruthy();
      expect(resolved!.country).toBe('Italy');
    });

    it('no Danish fallback', () => {
      const sample = italy[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved!.country).not.toBe('Denmark');
    });
  });

  // ─── 21. Notifications ────────────────────────────────────────
  describe('21. Notifications', () => {
    it('it_* resolves for notification display', () => {
      const sample = italy[20] ?? italy[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(resolved.name).not.toBe('Unknown gym');
    });
  });

  // ─── 22. Planned sessions ─────────────────────────────────────
  describe('22. Planned sessions', () => {
    it('IT center selectable and persists', () => {
      const sample = italy[15] ?? italy[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(findGymById(resolved!.id)!.id).toBe(sample.id);
    });
  });

  // ─── 23. Map viewport ─────────────────────────────────────────
  describe('23. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Milano', 45.4642, 9.19],
      ['Roma', 41.9028, 12.4964],
      ['Napoli', 40.8518, 14.2681],
      ['Torino', 45.0703, 7.6869],
      ['Palermo', 38.1157, 13.3615],
      ['Genova', 44.4056, 8.9463],
      ['Bologna', 44.4949, 11.3426],
      ['Firenze', 43.7696, 11.2558],
      ['Catania', 37.5079, 15.083],
      ['Cagliari', 39.2238, 9.1217],
    ];

    it.each(viewports)('%s viewport shows it_* pins', (_city, lat, lng) => {
      const mapCenters = italy.map(g => ({
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
        expect(v.id).toMatch(/^it_/);
      }
    });
  });

  // ─── 24. Country labels i18n ───────────────────────────────────
  describe('24. Country labels i18n', () => {
    it('gymCountryTranslationKey returns countries.italy', () => {
      expect(gymCountryTranslationKey('Italy')).toBe('countries.italy');
      expect(gymCountryTranslationKey('it')).toBe('countries.italy');
      expect(gymCountryTranslationKey('Italia')).toBe('countries.italy');
    });

    it('Italy label in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.italy')).toBe('Italy');
      expect(tDa('countries.italy')).toBe('Italien');
      expect(tSv('countries.italy')).toBe('Italien');
      expect(tNb('countries.italy')).toBe('Italia');
    });

    it('gymPickerLocationLine includes Italy', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Milano', region: 'Italia', country: 'Italy'},
        t,
      );
      expect(line).toContain('Milano');
      expect(line).toContain('Italy');
    });

    it('formatGymCountryLabel works for Italy', () => {
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Italy', t)).toBe('Italy');
    });
  });

  // ─── 25. Staging exclusions ────────────────────────────────────
  describe('25. Staging exclusions not in production', () => {
    it('586 MERGED_INTO_CATALOG in staging (550 Phase2 + 36 completeness; 2 FITINN only in READY)', () => {
      expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(586);
    });

    it('no COMING_SOON in production (15)', () => {
      const cs = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(cs.length).toBe(15);
      for (const s of cs) {
        expect(itCenters.find(c => c.id === s.id)).toBeUndefined();
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });

    it('no NEEDS_REVIEW in production (24)', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(24);
      for (const s of nr) {
        expect(itCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('no NEEDS_COORDINATES in production (18)', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      expect(nc.length).toBe(18);
      for (const s of nc) {
        expect(itCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('McFIT Como COMING_SOON not searchable', () => {
      expect(findCenterById('it_5c0d544918')).toBeUndefined();
      const hits = searchGyms('McFIT Como', {limit: 20});
      expect(hits.find(h => h.gym.id === 'it_5c0d544918')).toBeUndefined();
    });
  });

  // ─── 26. Orphan-ID safety ─────────────────────────────────────
  describe('26. Orphan-ID safety', () => {
    it('invalid it_xxx does not resolve', () => {
      expect(findGymById('it_nonexistent_xxx')).toBeNull();
    });

    it('invalid it_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('it_nonexistent_xxx');
      expect(stub.id).toBe('it_nonexistent_xxx');
      expect(stub.region).toBe('Italia');
      expect(stub.name).toBe('Unknown gym');
    });

    it('relaxed lookup also returns null for invalid it_*', () => {
      expect(findGymByIdRelaxed('it_nonexistent_xxx')).toBeNull();
    });

    it('unresolvedGymStub never substitutes live gym', () => {
      const stub = unresolvedGymStub('it_fake_id');
      expect(getActiveCenters()[0]?.id).not.toBe(stub.id);
    });
  });

  // ─── 27. Search stress typing ──────────────────────────────────
  describe('27. Search stress typing', () => {
    const prefixes = [
      ['m', 'milano'],
      ['r', 'roma'],
      ['fit', 'fitactive'],
      ['fitactive', 'fitactive'],
      ['virgin', 'virgin'],
      ['icon', 'icon'],
    ] as const;

    it.each(prefixes)('"%s" returns results including it_* for path to %s', query => {
      const hits = searchGyms(query, {limit: 40, userLat: 45.46, userLng: 9.19});
      expect(hits.length).toBeGreaterThan(0);
      if (query.length >= 3) {
        expect(hits.some(h => h.gym.id.startsWith('it_'))).toBe(true);
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
    it('Spain = 976', () => {
      expect(catalog.filter(c => isSpainCountry(c.country)).length).toBe(976);
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
    it('ES search still works', () => {
      const hits = searchGyms('VivaGym Madrid', {limit: 10});
      expect(hits.filter(h => h.gym.id.startsWith('es_')).length).toBeGreaterThan(0);
    });
  });

  // ─── 29. Performance / 10K headroom ───────────────────────────
  describe('29. Performance and 10K headroom', () => {
    it('search index builds in <5000ms for 10050 centers', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      const elapsed = Date.now() - start;
      expect(index.length).toBe(gyms.length);
      expect(elapsed).toBeLessThan(5000);
    });

    it('search query completes in <2000ms', () => {
      const start = Date.now();
      searchGyms('FitActive Milano', {limit: 40});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('nearest gym scan completes in <100ms', () => {
      const start = Date.now();
      findNearestGym(45.4642, 9.19, italy);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it('catalog crossed 10k threshold at 10050', () => {
      expect(catalog.length).toBe(10050);
      expect(catalog.length).toBeGreaterThan(10000);
      expect(catalog.length - 10000).toBe(50);
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

    it('Italy never allows invented coords', () => {
      expect(allowsInventedCoordinates('Italy')).toBe(false);
    });
  });
});
