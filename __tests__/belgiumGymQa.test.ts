/**
 * Belgium gym QA — comprehensive production validation after be_* merge.
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
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  allowsInventedCoordinates,
  isBelgiumCountry,
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

const staging = require('../data/belgium/belgium_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  id?: string;
  country?: string;
  city?: string;
  region?: string;
  verification_status?: string;
  is_active?: boolean;
  lat?: number | null;
  lng?: number | null;
}>;

type GeoRegion = 'flanders' | 'wallonia' | 'brussels' | 'outlier';

/** Belgium mainland bounding box (excl. NL/FR/DE/LU neighbor micro-boxes). */
const BE_BOX = {latMin: 49.45, latMax: 51.55, lngMin: 2.5, lngMax: 6.45};

function inBounds(
  lat: number,
  lng: number,
  b: {latMin: number; latMax: number; lngMin: number; lngMax: number},
): boolean {
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
}

/**
 * Regional classification aligned with merge report (Flanders / Wallonia / Brussels-Capital).
 * Prefer staging region when available; else approximate from coords + city.
 */
function belgiumGeoRegion(c: {
  id: string;
  lat: number | null;
  lng: number | null;
  city?: string;
}): GeoRegion {
  const staged = staging.find(s => s.id === c.id);
  const r = (staged?.region ?? '').toLowerCase();
  if (r.includes('flanders')) {
    return 'flanders';
  }
  if (r.includes('wallonia')) {
    return 'wallonia';
  }
  if (r.includes('brussels')) {
    return 'brussels';
  }
  const lat = c.lat!;
  const lng = c.lng!;
  if (!inBounds(lat, lng, BE_BOX)) {
    return 'outlier';
  }
  const city = (c.city ?? '').toLowerCase();
  const brusselsCities =
    /brussels|bruxelles|brussel|ixelles|etterbeek|schaerbeek|anderlecht|uccle|jette|molenbeek|saint-gilles|sint-gillis|evere|koekelberg|woluwe|forest|vorst|berchem-ste|ganshoren|auderghem/;
  if (brusselsCities.test(city) || (lat >= 50.78 && lat <= 50.92 && lng >= 4.25 && lng <= 4.5)) {
    return 'brussels';
  }
  // Rough linguistic border ~50.7–50.8; east Wallonia uses higher lng
  if (lat < 50.75 || /liège|liege|namur|mons|charleroi|tournai|wavre|seraing|verviers|arlon|bastogne/.test(city)) {
    return 'wallonia';
  }
  return 'flanders';
}

/** Neighbor micro-boxes — reject NL / FR / DE / LU pins. */
function foreignNeighborHint(
  lat: number,
  lng: number,
  city?: string,
  name?: string,
  address?: string,
): string | null {
  const blob = `${city ?? ''} ${name ?? ''} ${address ?? ''}`.toLowerCase();
  if (/\bluxembourg\b|\bluxemburg\b/.test(blob) && !/belgium|belgi|belgique/.test(blob)) {
    return 'LU_name';
  }
  if (/\bnetherlands\b|\bnederland\b|\bholland\b/.test(blob) && !/belgium|belgi/.test(blob)) {
    return 'NL_name';
  }
  // Luxembourg City micro-box
  if (lat >= 49.55 && lat <= 49.7 && lng >= 6.05 && lng <= 6.2) {
    return 'LU_geo';
  }
  // South NL (Maastricht / Eindhoven fringe) north of BE
  if (lat > 51.52 && lng >= 4.3 && lng <= 6.0) {
    return 'NL_geo';
  }
  // North France (Lille / Valenciennes fringe) south of BE
  if (lat < 49.48 && lng >= 2.5 && lng <= 4.6) {
    return 'FR_geo';
  }
  // Aachen / DE east of Eupen
  if (lng > 6.2 && lat >= 50.5 && lat <= 51.05) {
    return 'DE_geo';
  }
  return null;
}

describe('Belgium gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const belgium = gyms.filter(g => isBelgiumCountry(g.country));
  const beCenters = catalog.filter(c => isBelgiumCountry(c.country));

  // ─── 1. Catalog integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Belgium = 363 centers', () => {
      expect(beCenters.length).toBe(363);
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

    it('all BE IDs use be_* prefix', () => {
      for (const c of beCenters) {
        expect(c.id).toMatch(/^be_/);
      }
    });

    it('GYM_ID_PREFIX.belgium is be_', () => {
      expect(GYM_ID_PREFIX.belgium).toBe('be_');
    });

    it('all BE centers have country="Belgium"', () => {
      for (const c of beCenters) {
        expect(c.country).toBe('Belgium');
      }
    });

    it('all BE centers are active', () => {
      for (const c of beCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all BE centers have name, brand, address, postal_code, city', () => {
      for (const c of beCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all BE centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of beCenters) {
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat !== 0 || c.lng !== 0).toBe(true);
      }
    });

    it('unique IDs across entire catalog', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('no bel_/bg_ prefixes in production', () => {
      expect(catalog.filter(c => c.id.startsWith('bel_')).length).toBe(0);
      expect(catalog.filter(c => c.id.startsWith('bg_')).length).toBe(0);
    });
  });

  // ─── 2. Brand breakdown ─────────────────────────────────────────
  describe('2. Brand breakdown', () => {
    const expected: Record<string, number> = {
      'Basic-Fit': 236,
      JIMS: 84,
      Sportoase: 11,
      'Anytime Fitness': 9,
      'i-fitness': 8,
      'LAGO Club': 8,
      Aspria: 2,
      'David Lloyd': 2,
      'Fit-Out': 2,
      'Snap Fitness': 1,
    };

    it.each(Object.entries(expected))('%s = %d', (brand, count) => {
      expect(beCenters.filter(c => c.brand === brand).length).toBe(count);
    });

    it('brand total = 363', () => {
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(363);
    });
  });

  // ─── 3. Geography ──────────────────────────────────────────────
  describe('3. Geography', () => {
    const byRegion = {
      flanders: beCenters.filter(c => belgiumGeoRegion(c) === 'flanders'),
      wallonia: beCenters.filter(c => belgiumGeoRegion(c) === 'wallonia'),
      brussels: beCenters.filter(c => belgiumGeoRegion(c) === 'brussels'),
      outlier: beCenters.filter(c => belgiumGeoRegion(c) === 'outlier'),
    };

    it('Flanders = 224', () => {
      expect(byRegion.flanders.length).toBe(224);
    });
    it('Wallonia = 82', () => {
      expect(byRegion.wallonia.length).toBe(82);
    });
    it('Brussels-Capital = 57', () => {
      expect(byRegion.brussels.length).toBe(57);
    });
    it('no geographic outliers', () => {
      expect(byRegion.outlier.length).toBe(0);
    });

    it('no NL/FR/DE/LU coordinate outliers', () => {
      const suspicious = beCenters.filter(
        c => foreignNeighborHint(c.lat!, c.lng!, c.city, c.name, c.address) != null,
      );
      expect(suspicious.length).toBe(0);
    });

    it('Belgium does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Belgium')).toBe(false);
      expect(allowsInventedCoordinates('België')).toBe(false);
      expect(allowsInventedCoordinates('Belgique')).toBe(false);
    });

    it('missing Belgium coords → NaN (no Brussels fallback)', () => {
      const fake: GymCenter = {
        id: 'be_qa_missing',
        name: 'Test',
        brand: 'B',
        address: 'A',
        postal_code: '1000',
        city: 'Bruxelles',
        country: 'Belgium',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      expect(Number.isFinite(lat)).toBe(false);
      expect(Number.isFinite(lng)).toBe(false);
      expect(lat).not.toBe(50.8503);
      expect(lng).not.toBe(4.3517);
    });

    it('Sweden Stockholm fallback does not apply to Belgium', () => {
      expect(allowsInventedCoordinates('Sweden')).toBe(true);
      expect(allowsInventedCoordinates('Belgium')).toBe(false);
      const fake: GymCenter = {
        id: 'be_qa_no_stockholm',
        name: 'Test Brussels',
        brand: 'B',
        address: 'A',
        postal_code: '1000',
        city: 'Brussels',
        country: 'Belgium',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      expect(lat).not.toBe(59.3293);
      expect(lng).not.toBe(18.0686);
      expect(Number.isFinite(lat)).toBe(false);
    });
  });

  // ─── 4. Postal codes (4-digit) ──────────────────────────────────
  describe('4. Postal codes', () => {
    it('all BE postcodes are 4-digit strings matching /^\\d{4}$/', () => {
      for (const c of beCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toMatch(/^\d{4}$/);
      }
    });

    it('postcodes remain strings (not numeric coercion)', () => {
      for (const c of beCenters) {
        expect(c.postal_code).toBe(String(c.postal_code));
        expect(typeof c.postal_code).toBe('string');
      }
    });
  });

  // ─── 5. Encoding ────────────────────────────────────────────────
  describe('5. Encoding', () => {
    it('no mojibake', () => {
      const mojibake = /Ã¤|Ã¶|Ã¥|ï¿½|â€|Ã©|Ã¸|Â/;
      for (const c of beCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(mojibake);
      }
    });

    it('Belgian diacritics preserved (Liège etc.)', () => {
      expect(beCenters.some(c => c.city === 'Liège')).toBe(true);
      const withDiacritics = beCenters.filter(c =>
        /[àáâäèéêëïîôùûüçÀÁÂÄÈÉÊËÏÎÔÙÛÜÇ]/.test(`${c.name}|${c.address}|${c.city}`),
      );
      expect(withDiacritics.length).toBeGreaterThanOrEqual(10);
    });

    it('accent normalize Liège → liege', () => {
      expect(normalizeGymSearchValue('Liège')).toBe('liege');
      expect(normalizeGymSearchValue('België')).toBe('belgie');
    });
  });

  // ─── 6. Brand search ───────────────────────────────────────────
  describe('6. Brand search', () => {
    const beBrands = [
      'Basic-Fit',
      'JIMS',
      'Sportoase',
      'Anytime Fitness',
      'i-fitness',
      'LAGO Club',
      'Aspria',
      'David Lloyd',
      'Fit-Out',
      'Snap Fitness',
    ];

    it.each(beBrands)('%s returns be_* results (Brussels-biased)', brand => {
      const hits = searchGyms(brand, {limit: 100, userLat: 50.8503, userLng: 4.3517});
      const beHits = hits.filter(h => h.gym.id.startsWith('be_'));
      expect(beHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 7. Multilingual city search ───────────────────────────────
  describe('7. Multilingual city search', () => {
    const cities = [
      'Brussels',
      'Bruxelles',
      'Brussel',
      'Antwerp',
      'Antwerpen',
      'Anvers',
      'Ghent',
      'Gent',
      'Gand',
      'Liège',
      'Liege',
      'Luik',
      'Bruges',
      'Brugge',
      'Leuven',
      'Louvain',
      'Mons',
      'Charleroi',
    ];

    it.each(cities)('%s returns be_* results', city => {
      const hits = searchGyms(city, {limit: 40, userLat: 50.8503, userLng: 4.3517});
      const beHits = hits.filter(h => h.gym.id.startsWith('be_'));
      expect(beHits.length).toBeGreaterThan(0);
    });

    it('Bergen (Mons NL alias / Jims Bergen) returns be_* near Mons', () => {
      const hits = searchGyms('Bergen', {limit: 40, userLat: 50.4542, userLng: 3.9523});
      expect(hits.some(h => h.gym.id.startsWith('be_'))).toBe(true);
    });
  });

  // ─── 8. Country aliases ────────────────────────────────────────
  describe('8. Country aliases', () => {
    const aliases = ['Belgium', 'Belgique', 'België', 'Belgie', 'Belgien', 'Belgia'];

    it.each(aliases)('%s returns be_* results', q => {
      const hits = searchGyms(q, {limit: 40, userLat: 50.8503, userLng: 4.3517});
      expect(hits.filter(h => h.gym.id.startsWith('be_')).length).toBeGreaterThan(0);
    });

    it('isBelgiumCountry accepts all aliases', () => {
      for (const a of aliases) {
        expect(isBelgiumCountry(a)).toBe(true);
      }
      expect(isBelgiumCountry('be')).toBe(true);
      expect(isBelgiumCountry('BE')).toBe(true);
    });
  });

  // ─── 9. Accent / ASCII ─────────────────────────────────────────
  describe('9. Accent/ASCII', () => {
    it('Liege → Liège results', () => {
      const hits = searchGyms('Liege', {limit: 40, userLat: 50.6326, userLng: 5.5797});
      expect(hits.some(h => h.gym.city === 'Liège' && h.gym.id.startsWith('be_'))).toBe(true);
    });

    it('Belgie (ASCII) matches België country keywords', () => {
      const hits = searchGyms('Belgie', {limit: 20, userLat: 50.85, userLng: 4.35});
      expect(hits.some(h => h.gym.id.startsWith('be_'))).toBe(true);
    });
  });

  // ─── 10. Address tokens ────────────────────────────────────────
  describe('10. Address tokens Rue/Straat/Avenue', () => {
    it.each(['Rue', 'Straat', 'Avenue'] as const)(
      '%s returns be_* results (Brussels-biased)',
      token => {
        const hits = searchGyms(token, {limit: 40, userLat: 50.8503, userLng: 4.3517});
        const beHits = hits.filter(h => h.gym.id.startsWith('be_'));
        expect(beHits.length).toBeGreaterThan(0);
      },
    );
  });

  // ─── 11. Postcode search (4-digit vs FI/IT 5-digit / UK) ────────
  describe('11. Postcode search', () => {
    const bePcs = ['1000', '2000', '9000', '4000', '8000', '1050', '3000'];

    it.each(bePcs)('BE %s returns be_* results', pc => {
      const hits = searchGyms(pc, {limit: 40});
      expect(hits.some(h => h.gym.id.startsWith('be_'))).toBe(true);
    });

    it('IT 5-digit 00149 returns it_* (not BE)', () => {
      const hits = searchGyms('00149', {limit: 20});
      expect(hits.some(h => h.gym.id.startsWith('it_'))).toBe(true);
      expect(hits.filter(h => h.gym.id.startsWith('be_')).length).toBe(0);
    });

    it('IT 5-digit 20121 returns it_*', () => {
      const hits = searchGyms('20121', {limit: 20});
      expect(hits.some(h => h.gym.id.startsWith('it_'))).toBe(true);
    });

    it('UK outward SW1A returns gb_* (not BE 4-digit)', () => {
      const hits = searchGyms('SW1A', {limit: 20});
      expect(hits.some(h => h.gym.id.startsWith('gb_'))).toBe(true);
    });
  });

  // ─── 12. Basic-Fit ranking cross-country ───────────────────────
  describe('12. Basic-Fit ranking (BE vs NL/FR/DE)', () => {
    it('Basic-Fit near Brussels ranks be_* first', () => {
      const hits = searchGyms('Basic-Fit', {limit: 10, userLat: 50.8503, userLng: 4.3517});
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.gym.id).toMatch(/^be_/);
      expect(hits.slice(0, 5).every(h => h.gym.id.startsWith('be_'))).toBe(true);
    });

    it('Basic-Fit near Antwerpen ranks be_* first', () => {
      const hits = searchGyms('Basic-Fit', {limit: 10, userLat: 51.2194, userLng: 4.4025});
      expect(hits[0]!.gym.id).toMatch(/^be_/);
      expect(hits.slice(0, 5).every(h => h.gym.id.startsWith('be_'))).toBe(true);
    });

    it('Basic-Fit Amsterdam still returns nl_*', () => {
      const hits = searchGyms('Basic-Fit Amsterdam', {limit: 10});
      expect(hits.some(h => h.gym.id.startsWith('nl_'))).toBe(true);
    });

    it('Basic-Fit Paris still returns fr_*', () => {
      const hits = searchGyms('Basic-Fit Paris', {limit: 10});
      expect(hits.some(h => h.gym.id.startsWith('fr_'))).toBe(true);
    });
  });

  // ─── 13. Onboarding ────────────────────────────────────────────
  describe('13. Onboarding', () => {
    it('BE gym is selectable from active list', () => {
      expect(belgium.length).toBe(363);
    });

    it('be_* ID is valid and resolves', () => {
      const sample = belgium[0]!;
      expect(sample.id).toMatch(/^be_/);
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe(sample.name);
    });

    it('mixed-country search works (Basic-Fit)', () => {
      const hits = searchGyms('Basic-Fit', {limit: 200});
      const countries = new Set(hits.map(h => h.gym.country));
      expect(countries.size).toBeGreaterThan(1);
      // Without user location, NL/FR/ES may dominate top ranks — still expect BE in a wide window
      // or when country keyword is added.
      const withCountry = searchGyms('Basic-Fit Belgium', {limit: 40});
      expect(withCountry.some(h => h.gym.id.startsWith('be_'))).toBe(true);
      expect(hits.some(h => h.gym.id.startsWith('nl_') || h.gym.id.startsWith('fr_'))).toBe(
        true,
      );
    });

    it('popular onboarding list remains DK-centric (documented)', () => {
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

  // ─── 14. Profile/favorites ─────────────────────────────────────
  describe('14. Profile/favorites', () => {
    it('be_* resolves and shows Belgian name', () => {
      const sample = belgium[Math.floor(belgium.length / 2)]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const display = formatGymDisplayName(resolved);
      expect(display.length).toBeGreaterThan(0);
      expect(display).not.toBe('Ubekendt center');
    });

    it('no raw ID displayed', () => {
      const sample = belgium[0]!;
      const display = formatGymDisplayName(findGymById(sample.id));
      expect(display).not.toMatch(/^be_/);
    });
  });

  // ─── 15. Nearest gym ──────────────────────────────────────────
  describe('15. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Brussels', 50.8503, 4.3517],
      ['Antwerp', 51.2194, 4.4025],
      ['Ghent', 51.0543, 3.7174],
      ['Liège', 50.6326, 5.5797],
      ['Charleroi', 50.4108, 4.4446],
    ];

    it.each(coords)('nearest gym in %s is be_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, belgium);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^be_/);
    });

    it('nearest from Brussels coords returns be_* (not NL/FR/DK)', () => {
      const nearest = findNearestGym(50.8503, 4.3517, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^be_/);
    });
  });

  // ─── 16. Manual selection ─────────────────────────────────────
  describe('16. Manual selection', () => {
    it('any be_* can be selected by ID and re-resolved', () => {
      const sample = belgium[42] ?? belgium[0]!;
      const a = findGymById(sample.id);
      const b = findGymByIdRelaxed(sample.id);
      expect(a!.id).toBe(sample.id);
      expect(b!.id).toBe(sample.id);
      expect(a!.country).toBe('Belgium');
    });
  });

  // ─── 17. Dense / co-located ───────────────────────────────────
  describe('17. Dense/co-located pairs', () => {
    it('reports dense pair counts', () => {
      let p50 = 0;
      let p100 = 0;
      let p200 = 0;
      for (let i = 0; i < belgium.length; i++) {
        for (let j = i + 1; j < belgium.length; j++) {
          const d = calculateDistance(
            belgium[i]!.latitude,
            belgium[i]!.longitude,
            belgium[j]!.latitude,
            belgium[j]!.longitude,
          );
          if (d <= 50) {
            p50++;
          }
          if (d <= 100) {
            p100++;
          }
          if (d <= 200) {
            p200++;
          }
        }
      }
      expect(p50).toBe(6);
      expect(p100).toBe(8);
      expect(p200).toBe(14);
    });

    it('Ladies vs standard Basic-Fit Avenue Louise co-location kept', () => {
      const a = findGymById('be_3c27f0601a');
      const b = findGymById('be_606881804a');
      expect(a?.brand).toBe('Basic-Fit');
      expect(b?.brand).toBe('Basic-Fit');
      expect(/24\/7|Avenue Louise/i.test(a!.name)).toBe(true);
      expect(/Ladies/i.test(b!.name)).toBe(true);
      const d = calculateDistance(a!.latitude, a!.longitude, b!.latitude, b!.longitude);
      expect(d).toBeLessThanOrEqual(1);
    });

    it('Ladies vs standard Gent Ledeberg co-location kept (~37m)', () => {
      const a = findGymById('be_cea2f4b84e');
      const b = findGymById('be_b8d06f31a8');
      expect(a?.brand).toBe('Basic-Fit');
      expect(b?.brand).toBe('Basic-Fit');
      const d = calculateDistance(a!.latitude, a!.longitude, b!.latitude, b!.longitude);
      expect(d).toBeLessThan(50);
      expect(d).toBeGreaterThan(20);
    });

    it('different-brand co-locations kept (Basic-Fit ↔ JIMS / i-fitness)', () => {
      const pairs: [string, string, string, string][] = [
        ['be_c63a9718b6', 'be_ed44ed44bc', 'Basic-Fit', 'JIMS'],
        ['be_e42575b027', 'be_ad10ad34fb', 'Basic-Fit', 'i-fitness'],
        ['be_2d449eb120', 'be_5a69e6219e', 'Basic-Fit', 'JIMS'],
        ['be_e78b233afd', 'be_6c3737c9ba', 'Basic-Fit', 'JIMS'],
      ];
      for (const [idA, idB, brandA, brandB] of pairs) {
        const a = findGymById(idA);
        const b = findGymById(idB);
        expect(a?.brand).toBe(brandA);
        expect(b?.brand).toBe(brandB);
        expect(a!.id).not.toBe(b!.id);
        const d = calculateDistance(a!.latitude, a!.longitude, b!.latitude, b!.longitude);
        expect(d).toBeLessThanOrEqual(50);
      }
    });

    it('same-brand proximity <100m only Ladies pairs (2)', () => {
      const sameBrand: Array<{d: number; a: string; b: string}> = [];
      for (let i = 0; i < belgium.length; i++) {
        for (let j = i + 1; j < belgium.length; j++) {
          if (belgium[i]!.brand !== belgium[j]!.brand) {
            continue;
          }
          const d = calculateDistance(
            belgium[i]!.latitude,
            belgium[i]!.longitude,
            belgium[j]!.latitude,
            belgium[j]!.longitude,
          );
          if (d < 100) {
            sameBrand.push({d, a: belgium[i]!.id, b: belgium[j]!.id});
          }
        }
      }
      expect(sameBrand.length).toBe(2);
      const ids = new Set(sameBrand.flatMap(p => [p.a, p.b]));
      expect(ids.has('be_3c27f0601a')).toBe(true);
      expect(ids.has('be_606881804a')).toBe(true);
      expect(ids.has('be_cea2f4b84e')).toBe(true);
      expect(ids.has('be_b8d06f31a8')).toBe(true);
    });
  });

  // ─── 18. 200m check-in ────────────────────────────────────────
  describe('18. 200m check-in radius', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('BE center resolves check-in coords', () => {
      const sample = belgium[0]!;
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

  // ─── 19. Auto-checkout session ID ─────────────────────────────
  describe('19. Auto-checkout uses session gym ID', () => {
    it('geofence at gym location = none', () => {
      const sample = belgium[0]!;
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

  // ─── 20. Workout/PR ───────────────────────────────────────────
  describe('20. Workout/PR flow', () => {
    it('BE gym resolves — country irrelevant to logging', () => {
      const sample = belgium[0]!;
      expect(sample.country).toBe('Belgium');
      expect(findGymById(sample.id)).not.toBeNull();
    });
  });

  // ─── 21. History ──────────────────────────────────────────────
  describe('21. History', () => {
    it('be_* resolves to correct name, no raw ID', () => {
      const sample = belgium[10] ?? belgium[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });
  });

  // ─── 22. Feed/share ───────────────────────────────────────────
  describe('22. Feed/share', () => {
    it('BE session retains correct gym data', () => {
      const sample = belgium[5] ?? belgium[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.city).toBeTruthy();
      expect(resolved!.country).toBe('Belgium');
    });

    it('no Danish fallback', () => {
      const sample = belgium[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved!.country).not.toBe('Denmark');
    });
  });

  // ─── 23. Notifications ────────────────────────────────────────
  describe('23. Notifications', () => {
    it('be_* resolves for notification display', () => {
      const sample = belgium[20] ?? belgium[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(resolved.name).not.toBe('Unknown gym');
    });
  });

  // ─── 24. Planned sessions ─────────────────────────────────────
  describe('24. Planned sessions', () => {
    it('BE center selectable and persists', () => {
      const sample = belgium[15] ?? belgium[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(findGymById(resolved!.id)!.id).toBe(sample.id);
    });
  });

  // ─── 25. Map viewport ─────────────────────────────────────────
  describe('25. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Brussels', 50.8503, 4.3517],
      ['Antwerp', 51.2194, 4.4025],
      ['Ghent', 51.0543, 3.7174],
      ['Liège', 50.6326, 5.5797],
      ['Charleroi', 50.4108, 4.4446],
      ['Bruges', 51.2093, 3.2247],
      ['Leuven', 50.8798, 4.7005],
      ['Mons', 50.4542, 3.9523],
      ['Namur', 50.4674, 4.872],
      ['Hasselt', 50.9307, 5.3378],
    ];

    it.each(viewports)('%s viewport shows be_* pins', (_city, lat, lng) => {
      const mapCenters = belgium.map(g => ({
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
        expect(v.id).toMatch(/^be_/);
      }
    });
  });

  // ─── 26. Country labels i18n ───────────────────────────────────
  describe('26. Country labels i18n', () => {
    it('gymCountryTranslationKey returns countries.belgium', () => {
      expect(gymCountryTranslationKey('Belgium')).toBe('countries.belgium');
      expect(gymCountryTranslationKey('be')).toBe('countries.belgium');
      expect(gymCountryTranslationKey('België')).toBe('countries.belgium');
      expect(gymCountryTranslationKey('Belgique')).toBe('countries.belgium');
    });

    it('Belgium label in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.belgium')).toBe('Belgium');
      expect(tDa('countries.belgium')).toBe('Belgien');
      expect(tSv('countries.belgium')).toBe('Belgien');
      expect(tNb('countries.belgium')).toBe('Belgia');
    });

    it('gymPickerLocationLine includes Belgium', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Bruxelles', region: 'België', country: 'Belgium'},
        t,
      );
      expect(line).toContain('Bruxelles');
      expect(line).toContain('Belgium');
    });

    it('formatGymCountryLabel works for Belgium', () => {
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Belgium', t)).toBe('Belgium');
    });
  });

  // ─── 27. Staging exclusions ────────────────────────────────────
  describe('27. Staging exclusions not in production', () => {
    it('363 MERGED_INTO_CATALOG', () => {
      expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(363);
    });

    it('no NEEDS_REVIEW in production (5)', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(5);
      for (const s of nr) {
        expect(beCenters.find(c => c.id === s.id)).toBeUndefined();
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });

    it('no NEEDS_COORDINATES in production (3)', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      expect(nc.length).toBe(3);
      for (const s of nc) {
        expect(beCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('DUPLICATE staging rows not in production', () => {
      const dup = staging.filter(s => s.import_category === 'DUPLICATE');
      expect(dup.length).toBe(1);
      for (const s of dup) {
        expect(beCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });
  });

  // ─── 28. Orphan-ID safety ─────────────────────────────────────
  describe('28. Orphan-ID safety', () => {
    it('invalid be_xxx does not resolve', () => {
      expect(findGymById('be_nonexistent_xxx')).toBeNull();
    });

    it('invalid be_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('be_nonexistent_xxx');
      expect(stub.id).toBe('be_nonexistent_xxx');
      expect(stub.region).toBe('België');
      expect(stub.name).toBe('Unknown gym');
    });

    it('relaxed lookup also returns null for invalid be_*', () => {
      expect(findGymByIdRelaxed('be_nonexistent_xxx')).toBeNull();
    });

    it('unresolvedGymStub never substitutes live gym', () => {
      const stub = unresolvedGymStub('be_fake_id');
      expect(getActiveCenters()[0]?.id).not.toBe(stub.id);
      expect(stub.region).toBe('België');
      expect(Number.isFinite(stub.latitude)).toBe(false);
    });
  });

  // ─── 29. Search stress typing ──────────────────────────────────
  describe('29. Search stress typing', () => {
    const prefixes = [
      ['b', 'brussels'],
      ['ba', 'basic'],
      ['bas', 'basic'],
      ['basic', 'basic-fit'],
      ['jims', 'jims'],
      ['bru', 'brussels'],
    ] as const;

    it.each(prefixes)('"%s" returns results including be_* for path to %s', query => {
      const hits = searchGyms(query, {limit: 40, userLat: 50.8503, userLng: 4.3517});
      expect(hits.length).toBeGreaterThan(0);
      if (query.length >= 3) {
        expect(hits.some(h => h.gym.id.startsWith('be_'))).toBe(true);
      }
    });
  });

  // ─── 30. Regressions (all 10 other countries) ──────────────────
  describe('30. Regression counts & search', () => {
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
    it('IT search still works (regression ≠ completeness)', () => {
      const hits = searchGyms('FitActive Milano', {limit: 10});
      expect(hits.filter(h => h.gym.id.startsWith('it_')).length).toBeGreaterThan(0);
    });
  });

  // ─── 31. Performance / 10K headroom ───────────────────────────
  describe('31. Performance and 10K headroom', () => {
    it('search index builds in <5000ms for 10050 centers', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      const elapsed = Date.now() - start;
      expect(index.length).toBe(gyms.length);
      expect(elapsed).toBeLessThan(5000);
    });

    it('search query completes in <2000ms', () => {
      const start = Date.now();
      searchGyms('Basic-Fit Brussels', {limit: 40});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('nearest gym scan completes in <100ms', () => {
      const start = Date.now();
      findNearestGym(50.8503, 4.3517, belgium);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it('catalog crossed 10k threshold at 10050', () => {
      expect(catalog.length).toBe(10050);
      expect(catalog.length).toBeGreaterThan(10000);
      expect(catalog.length - 10000).toBe(50);
    });
  });

  // ─── 32. Known legacy risks documented ─────────────────────────
  describe('32. Known legacy risks (documented)', () => {
    it('SE still allows invented Stockholm fallback coords', () => {
      expect(allowsInventedCoordinates('Sweden')).toBe(true);
    });

    it('DK still allows invented postal approx coords', () => {
      expect(allowsInventedCoordinates('Denmark')).toBe(true);
    });

    it('Belgium never allows invented coords', () => {
      expect(allowsInventedCoordinates('Belgium')).toBe(false);
    });
  });
});
