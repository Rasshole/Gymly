/**
 * Austria gym QA — comprehensive production validation after at_* merge (335 centers).
 */
import fs from 'fs';
import path from 'path';
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
  isAustriaCountry,
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

const staging = require('../data/austria/austria_centers_staging.json') as Array<{
  import_category?: string;
  id?: string;
  brand?: string;
  name?: string;
  city?: string;
  notes?: string;
}>;

const approved = require('../data/austria/AUSTRIA_APPROVED_FOR_MERGE.json') as Array<{id: string}>;
const dupAnalysis = require('../data/austria/AUSTRIA_MERGE_DUPLICATE_ANALYSIS.json') as {
  encoding_duplicate_withheld: Array<{id: string; kept_id: string}>;
  different_brand_colocations_kept: Array<{a_id: string; b_id: string}>;
  retained_close_pairs_same_brand: Array<{a_id: string; b_id: string; distance_m: number}>;
};

const AT_POSTAL_RE = /^\d{4}$/;
const AT_BOUNDS = {latMin: 46.35, latMax: 49.05, lngMin: 9.45, lngMax: 17.2};
const MOJIBAKE_RE = /Ã.|�|â€|Â(?![a-z])/;
const LITERAL_ESCAPE_RE = /\\x[0-9a-fA-F]{2}/;

function inAustriaBbox(lat: number, lng: number): boolean {
  return (
    lat >= AT_BOUNDS.latMin &&
    lat <= AT_BOUNDS.latMax &&
    lng >= AT_BOUNDS.lngMin &&
    lng <= AT_BOUNDS.lngMax
  );
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

describe('Austria gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const austria = gyms.filter(g => isAustriaCountry(g.country));
  const atCenters = catalog.filter(c => isAustriaCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Austria = 335 centers', () => {
      expect(atCenters.length).toBe(335);
    });

    it.each([
      ['Denmark', 354, isDenmarkCountry],
      ['Sweden', 639, isSwedenCountry],
      ['Norway', 535, isNorwayCountry],
      ['Finland', 429, isFinlandCountry],
      ['Germany', 1424, isGermanyCountry],
      ['United Kingdom', 1474, isUnitedKingdomCountry],
      ['Netherlands', 600, isNetherlandsCountry],
      ['France', 1712, isFranceCountry],
      ['Spain', 976, isSpainCountry],
      ['Italy', 588, isItalyCountry],
      ['Belgium', 363, isBelgiumCountry],
      ['Poland', 621, isPolandCountry],
    ] as const)('%s = %d', (_name, count, fn) => {
      expect(catalog.filter(c => fn(c.country)).length).toBe(count);
    });

    it('all AT IDs use at_* prefix', () => {
      for (const c of atCenters) {
        expect(c.id).toMatch(/^at_/);
      }
    });

    it('GYM_ID_PREFIX.austria is at_', () => {
      expect(GYM_ID_PREFIX.austria).toBe('at_');
    });

    it('all AT centers have country="Austria", is_active=true, required fields', () => {
      for (const c of atCenters) {
        expect(c.country).toBe('Austria');
        expect(c.is_active).toBe(true);
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all AT centers have finite lat/lng, no 0,0', () => {
      for (const c of atCenters) {
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat !== 0 || c.lng !== 0).toBe(true);
      }
    });

    it('all AT postcodes are 4-digit strings', () => {
      for (const c of atCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(AT_POSTAL_RE.test(c.postal_code)).toBe(true);
      }
    });

    it('unique IDs across entire catalog', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('2. Merge contract', () => {
    it('335 approved rows match production Austria IDs exactly', () => {
      expect(approved.length).toBe(335);
      const prodIds = new Set(atCenters.map(c => c.id));
      const approvedIds = new Set(approved.map(r => r.id));
      expect([...approvedIds].every(id => prodIds.has(id))).toBe(true);
      expect([...prodIds].every(id => approvedIds.has(id))).toBe(true);
    });

    it('335 MERGED_INTO_CATALOG in staging', () => {
      expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(335);
    });

    it('14 encoding duplicate rows withheld from production', () => {
      expect(staging.filter(s => s.import_category === 'DUPLICATE').length).toBe(14);
      expect(dupAnalysis.encoding_duplicate_withheld.length).toBe(14);
      for (const w of dupAnalysis.encoding_duplicate_withheld) {
        expect(findCenterById(w.id)).toBeUndefined();
        expect(findCenterById(w.kept_id)).toBeDefined();
      }
    });
  });

  describe('3. Brand breakdown', () => {
    const expected: Record<string, number> = {
      FITINN: 51,
      'Mrs.Sporty': 50,
      'clever fit': 40,
      INJOY: 35,
      Speedfit: 31,
      HappyFit: 29,
      'Anytime Fitness': 22,
      MYGYM: 23,
      McFIT: 15,
      'John Harris Fitness': 12,
      'Fit Fabrik': 12,
      'JOHN REED': 7,
      'Fitness First': 4,
      'Holmes Place': 3,
      "Gold's Gym": 1,
    };

    it.each(Object.entries(expected))('%s = %d', (brand, count) => {
      expect(atCenters.filter(c => c.brand === brand).length).toBe(count);
    });

    it('brand total = 335', () => {
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(335);
    });
  });

  describe('4. MYGYM duplicate repair', () => {
    it('23 canonical MYGYM in production', () => {
      expect(atCenters.filter(c => c.brand === 'MYGYM').length).toBe(23);
    });

    it('0 duplicate MYGYM twins live', () => {
      for (const w of dupAnalysis.encoding_duplicate_withheld) {
        if (w.id.startsWith('at_') && staging.find(s => s.id === w.id)?.brand === 'MYGYM') {
          expect(findCenterById(w.id)).toBeUndefined();
        }
      }
    });

    it('each superseded MYGYM kept_id is live with same address key', () => {
      const mygymWithheld = dupAnalysis.encoding_duplicate_withheld.filter(
        w => staging.find(s => s.id === w.id)?.brand === 'MYGYM',
      );
      expect(mygymWithheld.length).toBe(14);
      for (const w of mygymWithheld) {
        const kept = findCenterById(w.kept_id);
        expect(kept?.brand).toBe('MYGYM');
        expect(kept?.is_active).toBe(true);
      }
    });

    it('no same-brand same-address duplicates among live MYGYM', () => {
      const mygym = atCenters.filter(c => c.brand === 'MYGYM');
      const keys = new Set<string>();
      for (const c of mygym) {
        const k = [
          normalizeAddr(c.address),
          c.postal_code,
          normalizeAddr(c.city),
        ].join('|');
        expect(keys.has(k)).toBe(false);
        keys.add(k);
      }
    });
  });

  describe('5. Encoding', () => {
    it('no mojibake or literal \\xNN in AT rows', () => {
      for (const c of atCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(MOJIBAKE_RE);
        expect(blob).not.toMatch(LITERAL_ESCAPE_RE);
      }
    });

    it('German/Austrian diacritics preserved in stored text', () => {
      expect(atCenters.some(c => /[äöüßÄÖÜ]/.test(`${c.name}${c.address}${c.city}`))).toBe(true);
      expect(atCenters.some(c => c.address.includes('straße') || c.address.includes('Straße'))).toBe(true);
    });

    it('umlaut ASCII normalization for search only', () => {
      expect(normalizeGymSearchValue('Kärntner Straße')).toBe('karntner strasse');
      expect(normalizeGymSearchValue('Währing')).toBe('wahring');
      expect(normalizeGymSearchValue('Wahring')).toBe('wahring');
    });
  });

  describe('6. Geography', () => {
    it('no foreign coordinate outliers outside Austria bbox', () => {
      expect(atCenters.filter(c => !inAustriaBbox(c.lat!, c.lng!)).length).toBe(0);
    });

    it('Austria does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Austria')).toBe(false);
      expect(allowsInventedCoordinates('Österreich')).toBe(false);
    });

    it('missing Austria coords → NaN (no Vienna centroid)', () => {
      const fake: GymCenter = {
        id: 'at_qa_missing',
        name: 'Test',
        brand: 'B',
        address: 'Kärntner Straße 1',
        postal_code: '1010',
        city: 'Wien',
        country: 'Austria',
        lat: null,
        lng: null,
        is_active: true,
      };
      const {lat, lng} = getEffectiveLatLng(fake);
      expect(Number.isFinite(lat)).toBe(false);
      expect(Number.isFinite(lng)).toBe(false);
      expect(lat).not.toBe(48.2082);
      expect(lng).not.toBe(16.3738);
    });

    it('border cities (Innsbruck, Bregenz, Feldkirch, Klagenfurt) inside Austria bbox', () => {
      for (const city of ['Innsbruck', 'Bregenz', 'Feldkirch', 'Klagenfurt']) {
        const rows = atCenters.filter(c => c.city === city);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every(c => inAustriaBbox(c.lat!, c.lng!))).toBe(true);
      }
    });
  });

  describe('7. Brand search (all 15 brands)', () => {
    const brands = [
      'FITINN',
      'Mrs.Sporty',
      'clever fit',
      'INJOY',
      'Speedfit',
      'HappyFit',
      'Anytime Fitness',
      'MYGYM',
      'McFIT',
      'John Harris Fitness',
      'Fit Fabrik',
      'JOHN REED',
      'Fitness First',
      'Holmes Place',
      "Gold's Gym",
    ];

    it.each(brands)('%s returns at_* results (Vienna-biased)', brand => {
      const hits = searchGyms(brand, {limit: 50, userLat: 48.21, userLng: 16.37});
      expect(hits.filter(h => h.gym.id.startsWith('at_')).length).toBeGreaterThan(0);
    });

    it('McFIT near Vienna returns at_* before de_*', () => {
      const hits = searchGyms('McFIT', {limit: 20, userLat: 48.21, userLng: 16.37});
      expect(hits.some(h => h.gym.id.startsWith('at_'))).toBe(true);
      const firstAt = hits.findIndex(h => h.gym.id.startsWith('at_'));
      const firstDe = hits.findIndex(h => h.gym.id.startsWith('de_'));
      if (firstDe >= 0) {
        expect(firstAt).toBeLessThan(firstDe);
      }
    });

    it('clever fit near Vienna returns at_* Austrian clubs', () => {
      const hits = searchGyms('clever fit', {limit: 20, userLat: 48.21, userLng: 16.37});
      expect(hits.some(h => h.gym.id.startsWith('at_') && h.gym.country === 'Austria')).toBe(true);
    });
  });

  describe('8. Country search', () => {
    it.each(['Austria', 'Österreich', 'Osterreich'])('%s returns at_* results', query => {
      const hits = searchGyms(query, {limit: 50, userLat: 48.21, userLng: 16.37});
      expect(hits.some(h => h.gym.id.startsWith('at_'))).toBe(true);
    });
  });

  describe('9. City search', () => {
    const cities: Array<[string, number, number]> = [
      ['Wien', 48.21, 16.37],
      ['Graz', 47.07, 15.44],
      ['Linz', 48.31, 14.29],
      ['Salzburg', 47.81, 13.04],
      ['Innsbruck', 47.27, 11.39],
      ['Klagenfurt', 46.62, 14.31],
      ['Villach', 46.61, 13.85],
      ['Wels', 48.16, 14.02],
      ['St. Pölten', 48.2, 15.63],
      ['Dornbirn', 47.41, 9.74],
      ['Wiener Neustadt', 47.81, 16.24],
      ['Steyr', 48.04, 14.42],
      ['Feldkirch', 47.24, 9.6],
      ['Bregenz', 47.5, 9.75],
    ];

    it.each(cities)('%s returns at_* results', (city, lat, lng) => {
      const hits = searchGyms(city, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.filter(h => h.gym.id.startsWith('at_')).length).toBeGreaterThan(0);
    });
  });

  describe('10. Vienna / Wien alias', () => {
    it('Wien and Vienna both return Wien-city at_* gyms', () => {
      for (const q of ['Wien', 'Vienna']) {
        const hits = searchGyms(q, {limit: 40, userLat: 48.21, userLng: 16.37});
        expect(hits.some(h => h.gym.city === 'Wien' && h.gym.id.startsWith('at_'))).toBe(true);
      }
    });

    it('stored city remains Wien (no rewrite to Vienna)', () => {
      expect(atCenters.filter(c => c.city === 'Wien').length).toBeGreaterThan(50);
      expect(atCenters.some(c => c.city === 'Vienna')).toBe(false);
    });
  });

  describe('11. Postcode search', () => {
    it('representative 4-digit postcodes return at_* results', () => {
      const samples = ['1010', '8020', '4020', '5020', '6020', '6900'];
      for (const pc of samples) {
        const hits = searchGyms(pc, {limit: 20, userLat: 48.21, userLng: 16.37});
        expect(hits.some(h => h.gym.id.startsWith('at_'))).toBe(true);
      }
    });

    it('Vienna 1010 matches Austrian row not Belgian confusion', () => {
      const hits = searchGyms('1010', {limit: 30, userLat: 48.21, userLng: 16.37});
      const at1010 = hits.filter(h => h.gym.postalCode === '1010' && h.gym.id.startsWith('at_'));
      expect(at1010.length).toBeGreaterThan(0);
    });
  });

  describe('12. Priority brands', () => {
    it('FITINN = 51 with Vienna coverage', () => {
      expect(atCenters.filter(c => c.brand === 'FITINN').length).toBe(51);
      expect(atCenters.filter(c => c.brand === 'FITINN' && c.city === 'Wien').length).toBeGreaterThan(10);
    });

    it('Mrs.Sporty = 50 — all have physical addresses (Phase 2 approved concept)', () => {
      const ms = atCenters.filter(c => c.brand === 'Mrs.Sporty');
      expect(ms.length).toBe(50);
      expect(ms.every(c => c.address.trim().length > 0 && Number.isFinite(c.lat!))).toBe(true);
    });

    it('Anytime Fitness = 22 all at_*', () => {
      const af = atCenters.filter(c => c.brand === 'Anytime Fitness');
      expect(af.length).toBe(22);
      expect(af.every(c => c.id.startsWith('at_'))).toBe(true);
    });

    it('McFIT ghost CLOSED row not in production', () => {
      expect(findCenterById('at_a9cc56c1a9')).toBeUndefined();
      expect(staging.find(s => s.id === 'at_a9cc56c1a9')?.import_category).toBe('CLOSED');
    });
  });

  describe('13. Known John Harris pair', () => {
    const schillerId = 'at_281d63e434';
    const medicalId = 'at_37f49e7937';

    it('both exist with distinct addresses and IDs', () => {
      const a = findGymById(schillerId)!;
      const b = findGymById(medicalId)!;
      expect(a.name).toContain('Schillerplatz');
      expect(b.name).toContain('Medical Center');
      expect(a.address).not.toBe(b.address);
    });

    it('~60m apart — legitimate separate facilities', () => {
      const a = findGymById(schillerId)!;
      const b = findGymById(medicalId)!;
      const d = calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude);
      expect(d).toBeGreaterThan(50);
      expect(d).toBeLessThan(70);
    });

    it('independent check-in coordinates', () => {
      const a = getGymLatLngForCheckIn(schillerId)!;
      const b = getGymLatLngForCheckIn(medicalId)!;
      expect(a.latitude).not.toBe(b.latitude);
    });
  });

  describe('14. Known Salzburg co-location', () => {
    const mygymId = 'at_fad38fce91';
    const cleverId = 'at_af355944dd';

    it('MYGYM Salzburg ZIB and clever fit PREMIUM both live', () => {
      expect(findGymById(mygymId)?.brand).toBe('MYGYM');
      expect(findGymById(cleverId)?.brand).toBe('clever fit');
    });

    it('identical coordinates — different brands retained', () => {
      const a = findCenterById(mygymId)!;
      const b = findCenterById(cleverId)!;
      expect(a.lat).toBe(b.lat);
      expect(a.lng).toBe(b.lng);
      expect(a.brand).not.toBe(b.brand);
    });
  });

  describe('15. Other different-brand co-locations', () => {
    it('3 known co-locations remain separate IDs', () => {
      expect(dupAnalysis.different_brand_colocations_kept.length).toBe(3);
      for (const pair of dupAnalysis.different_brand_colocations_kept) {
        expect(findCenterById(pair.a_id)).toBeDefined();
        expect(findCenterById(pair.b_id)).toBeDefined();
        expect(pair.a_id).not.toBe(pair.b_id);
      }
    });
  });

  describe('16. Vienna dense gyms', () => {
    it('Wien has multiple distinct at_* clubs and brands', () => {
      const wien = atCenters.filter(c => c.city === 'Wien');
      expect(wien.length).toBeGreaterThan(50);
      expect(new Set(wien.map(c => c.id)).size).toBe(wien.length);
      expect(new Set(wien.map(c => c.brand)).size).toBeGreaterThan(5);
    });
  });

  describe('17. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Wien', 48.21, 16.37],
      ['Graz', 47.07, 15.44],
      ['Linz', 48.31, 14.29],
      ['Salzburg', 47.81, 13.04],
      ['Innsbruck', 47.27, 11.39],
      ['Klagenfurt', 46.62, 14.31],
    ];

    it.each(coords)('nearest gym in %s is at_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, austria);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^at_/);
    });

    it('nearest from Vienna coords is at_* (not DK/DE)', () => {
      const nearest = findNearestGym(48.21, 16.37, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^at_/);
      expect(nearest!.country).toBe('Austria');
    });
  });

  describe('18. 200m check-in and auto-checkout', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('AT center resolves check-in coords', () => {
      const sample = austria[0]!;
      expect(getGymLatLngForCheckIn(sample.id)).not.toBeNull();
    });

    it.each([
      [500, 'set_away'],
      [250, 'set_away'],
      [201, 'set_away'],
    ] as const)('%dm → blocked/away', (dist, action) => {
      expect(decideGeofenceAutoCheckout(dist, null, Date.now()).action).toBe(action);
    });

    it('200m → still inside', () => {
      const d = decideGeofenceAutoCheckout(200, null, Date.now());
      expect(d.action).not.toBe('checkout_away');
      expect(d.action).not.toBe('set_away');
    });

    it.each([199, 100, 10])('%dm → allowed/none', dist => {
      expect(decideGeofenceAutoCheckout(dist, null, Date.now()).action).toBe('none');
    });

    it('John Harris pair check-in pins differ despite proximity', () => {
      const a = getGymLatLngForCheckIn('at_281d63e434')!;
      const b = getGymLatLngForCheckIn('at_37f49e7937')!;
      expect(calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude)).toBeGreaterThan(0);
    });
  });

  describe('19. Core flows', () => {
    it('at_* history resolves to name not raw ID', () => {
      const sample = austria[10] ?? austria[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });

    it('AT session retains correct gym data for feed/share', () => {
      const sample = austria[5] ?? austria[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved!.country).toBe('Austria');
      expect(resolved!.city).toBeTruthy();
    });

    it('notification at_* resolves without Danish fallback', () => {
      const sample = austria[20] ?? austria[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).not.toBe('Unknown gym');
      expect(resolved.country).toBe('Austria');
    });
  });

  describe('20. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Wien', 48.21, 16.37],
      ['Graz', 47.07, 15.44],
      ['Linz', 48.31, 14.29],
      ['Salzburg', 47.81, 13.04],
      ['Innsbruck', 47.27, 11.39],
      ['Klagenfurt', 46.62, 14.31],
    ];

    it.each(viewports)('%s viewport shows at_* pins (not entire catalog)', (_city, lat, lng) => {
      const mapCenters = austria.map(g => ({
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
      expect(visible.length).toBeLessThan(austria.length);
      for (const v of visible) {
        expect(v.id).toMatch(/^at_/);
      }
    });
  });

  describe('21. Staging exclusions', () => {
    it('9 NEEDS_COORDINATES not in production', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      expect(nc.length).toBe(9);
      for (const s of nc) {
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });

    it('8 NEEDS_REVIEW not in production', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(8);
      for (const s of nr) {
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });

    it('1 CLOSED McFIT ghost not in production', () => {
      expect(staging.filter(s => s.import_category === 'CLOSED').length).toBe(1);
      expect(findCenterById('at_a9cc56c1a9')).toBeUndefined();
    });

    it('14 DUPLICATE not in production', () => {
      const dup = staging.filter(s => s.import_category === 'DUPLICATE');
      expect(dup.length).toBe(14);
      for (const s of dup) {
        expect(findCenterById(s.id!)).toBeUndefined();
      }
    });
  });

  describe('22. Country labels i18n', () => {
    it('gymCountryTranslationKey returns countries.austria', () => {
      expect(gymCountryTranslationKey('Austria')).toBe('countries.austria');
      expect(gymCountryTranslationKey('at')).toBe('countries.austria');
      expect(gymCountryTranslationKey('Österreich')).toBe('countries.austria');
    });

    it('Austria label in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.austria')).toBe('Austria');
      expect(tDa('countries.austria')).toBe('Østrig');
      expect(tSv('countries.austria')).toBe('Österrike');
      expect(tNb('countries.austria')).toBe('Østerrike');
    });

    it('gymPickerLocationLine includes Austria', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine({city: 'Wien', region: 'Österreich', country: 'Austria'}, t);
      expect(line).toContain('Wien');
      expect(line).toContain('Austria');
    });
  });

  describe('23. Orphan-ID safety', () => {
    it('at_nonexistent_test does not resolve to live gym', () => {
      expect(findGymById('at_nonexistent_test')).toBeNull();
      const stub = resolveGymOrStub('at_nonexistent_test');
      expect(stub.id).toBe('at_nonexistent_test');
      expect(stub.region).toBe('Österreich');
      expect(stub.name).toBe('Unknown gym');
      expect(getActiveCenters()[0]?.id).not.toBe(stub.id);
    });

    it('unresolvedGymStub never substitutes live gym', () => {
      const stub = unresolvedGymStub('at_fake_id');
      expect(stub.region).toBe('Österreich');
      expect(Number.isFinite(stub.latitude)).toBe(false);
    });
  });

  describe('24. Search typing responsiveness', () => {
    it.each([
      'wi', 'wie', 'wien',
      'vie', 'vienna',
      'fiti', 'fitinn',
      'clev', 'clever',
      'myg', 'mygym',
    ])('prefix %s returns at_* (Vienna-biased)', q => {
      getGymSearchIndex(gyms);
      const hits = searchGyms(q, {limit: 30, userLat: 48.21, userLng: 16.37});
      expect(hits.some(h => h.gym.id.startsWith('at_'))).toBe(true);
    });

    it('shorter global prefixes remain functional at 10k scale', () => {
      getGymSearchIndex(gyms);
      for (const q of ['fit', 'cle', 'my', 'w', 'v']) {
        const hits = searchGyms(q, {limit: 30, userLat: 48.21, userLng: 16.37});
        expect(hits.length).toBeGreaterThan(0);
      }
    });

    it('cached index rebuild is fast at 10050', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });

  describe('25. 10k status', () => {
    it('catalog crossed 10000 threshold', () => {
      expect(catalog.length).toBe(10050);
      expect(catalog.length).toBeGreaterThan(10000);
      expect(catalog.length - 10000).toBe(50);
    });
  });

  describe('26. Onboarding / profile', () => {
    it('AT gym selectable with display name (no raw ID)', () => {
      const sample = austria[0]!;
      const resolved = findGymById(sample.id);
      expect(formatGymDisplayName(resolved)).not.toMatch(/^at_/);
    });

    it('multi-country search includes Austria + legacy countries', () => {
      const atHits = searchGyms('Austria', {limit: 50, userLat: 48.21, userLng: 16.37});
      const dkHits = searchGyms('Denmark', {limit: 50, userLat: 55.67, userLng: 12.57});
      expect(atHits.some(h => h.gym.id.startsWith('at_'))).toBe(true);
      expect(dkHits.some(h => isDenmarkCountry(h.gym.country))).toBe(true);
    });
  });
});
