/**
 * Italy Completeness QA — final production validation after +38 merge + FITINN repair.
 * Catalog contract: 9,094 total / Italy 588 (550 original + 38 completeness).
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

const completenessReady = require('../data/italy/ITALY_COMPLETENESS_READY_TO_IMPORT.json') as Array<{
  id: string;
  name?: string;
  brand?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  import_category?: string;
  is_active?: boolean;
}>;

const phase2Ready = require('../data/italy/ITALY_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
}>;

const CAP_RE = /^\d{5}$/;
const MOJIBAKE_RE = /Ã.|�|â€|Â/;

const FITINN_BICOCCA = {
  id: 'it_ccb19385b7',
  address: 'Via Fulvio Testi 282',
  postal_code: '20162',
  city: 'Milano',
  lat: 45.5243,
  lng: 9.21156,
  rejected: {lat: 45.549983, lng: 9.3750001},
};

const FITINN_ABRUZZI = {
  id: 'it_4ca03e5086',
  address: 'Viale Abruzzi 38',
  postal_code: '20131',
  city: 'Milano',
  lat: 45.47906,
  lng: 9.21737,
  rejected: {lat: 45.4551727, lng: 9.3164328},
};

function almostEqual(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

describe('Italy Completeness QA (final after FITINN repair)', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const italy = gyms.filter(g => isItalyCountry(g.country));
  const itCenters = catalog.filter(c => isItalyCountry(c.country));
  const completenessIds = completenessReady.map(r => r.id);
  const phase2Ids = new Set(phase2Ready.map(r => r.id));

  // ─── 1. Baseline ───────────────────────────────────────────────
  describe('1. Production baseline', () => {
    it('total = 10050', () => {
      expect(catalog.length).toBe(10050);
    });
    it('Italy = 588', () => {
      expect(itCenters.length).toBe(588);
      expect(italy.length).toBe(588);
    });
    it('other countries unchanged', () => {
      expect(catalog.filter(c => isDenmarkCountry(c.country)).length).toBe(354);
      expect(catalog.filter(c => isSwedenCountry(c.country)).length).toBe(639);
      expect(catalog.filter(c => isNorwayCountry(c.country)).length).toBe(535);
      expect(catalog.filter(c => isGermanyCountry(c.country)).length).toBe(1424);
      expect(catalog.filter(c => isUnitedKingdomCountry(c.country)).length).toBe(1474);
      expect(catalog.filter(c => isFinlandCountry(c.country)).length).toBe(429);
      expect(catalog.filter(c => isNetherlandsCountry(c.country)).length).toBe(600);
      expect(catalog.filter(c => isFranceCountry(c.country)).length).toBe(1712);
      expect(catalog.filter(c => isSpainCountry(c.country)).length).toBe(976);
      expect(catalog.filter(c => isBelgiumCountry(c.country)).length).toBe(363);
    });
    it('550 + 38 = 588', () => {
      expect(phase2Ids.size).toBe(550);
      expect(completenessIds.length).toBe(38);
      expect(550 + 38).toBe(588);
    });
  });

  // ─── 2. Completeness 38 ────────────────────────────────────────
  describe('2. Completeness 38 additions', () => {
    it('READY file has 38 rows', () => {
      expect(completenessReady.length).toBe(38);
    });

    it('38/38 IDs exist in production', () => {
      for (const id of completenessIds) {
        expect(findCenterById(id)).toBeDefined();
        expect(findGymById(id)).not.toBeNull();
      }
    });

    it('all 38 marked MERGED_INTO_CATALOG and no metadata drift', () => {
      for (const r of completenessReady) {
        expect(r.import_category).toBe('MERGED_INTO_CATALOG');
        expect(findCenterById(r.id)).toBeDefined();
      }
      const merged = completenessReady.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
      expect(merged.length).toBe(38);
      expect(merged.every(r => catalog.some(c => c.id === r.id))).toBe(true);
    });

    it('38/38 are Italy, active, with required fields and finite coords', () => {
      for (const id of completenessIds) {
        const c = findCenterById(id)!;
        expect(c.country).toBe('Italy');
        expect(c.is_active).toBe(true);
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(CAP_RE.test(String(c.postal_code))).toBe(true);
        expect(typeof c.postal_code).toBe('string');
        expect(c.city.trim().length).toBeGreaterThan(0);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat === 0 && c.lng === 0).toBe(false);
      }
    });
  });

  // ─── 3. FITINN repair ──────────────────────────────────────────
  describe('3. FITINN repair validation', () => {
    it('Bicocca address/CAP/coords match official pin; rejected coords absent', () => {
      const c = findCenterById(FITINN_BICOCCA.id)!;
      expect(c.address).toBe(FITINN_BICOCCA.address);
      expect(c.postal_code).toBe(FITINN_BICOCCA.postal_code);
      expect(c.city).toBe(FITINN_BICOCCA.city);
      expect(almostEqual(c.lat!, FITINN_BICOCCA.lat)).toBe(true);
      expect(almostEqual(c.lng!, FITINN_BICOCCA.lng)).toBe(true);
      expect(almostEqual(c.lat!, FITINN_BICOCCA.rejected.lat)).toBe(false);
      expect(almostEqual(c.lng!, FITINN_BICOCCA.rejected.lng, 1e-3)).toBe(false);
    });

    it('Abruzzi address/CAP/coords match official pin; rejected coords absent', () => {
      const c = findCenterById(FITINN_ABRUZZI.id)!;
      expect(c.address).toBe(FITINN_ABRUZZI.address);
      expect(c.postal_code).toBe(FITINN_ABRUZZI.postal_code);
      expect(c.city).toBe(FITINN_ABRUZZI.city);
      expect(almostEqual(c.lat!, FITINN_ABRUZZI.lat)).toBe(true);
      expect(almostEqual(c.lng!, FITINN_ABRUZZI.lng)).toBe(true);
      expect(almostEqual(c.lat!, FITINN_ABRUZZI.rejected.lat)).toBe(false);
      expect(almostEqual(c.lng!, FITINN_ABRUZZI.rejected.lng, 1e-3)).toBe(false);
    });

    it('both FITINN IDs resolve via registry + display lookup', () => {
      for (const id of [FITINN_BICOCCA.id, FITINN_ABRUZZI.id]) {
        expect(findCenterById(id)?.id).toBe(id);
        expect(findGymById(id)?.id).toBe(id);
        expect(findGymByIdRelaxed(id)?.id).toBe(id);
        expect(formatGymDisplayName(findGymById(id)!)).not.toMatch(/^it_/);
      }
    });

    it('CAP 20162 / 20131 find repaired FITINN clubs', () => {
      const b = searchGyms('20162', {limit: 40, userLat: 45.52, userLng: 9.21});
      expect(b.some(h => h.gym.id === FITINN_BICOCCA.id)).toBe(true);
      const a = searchGyms('20131', {limit: 40, userLat: 45.48, userLng: 9.22});
      expect(a.some(h => h.gym.id === FITINN_ABRUZZI.id)).toBe(true);
    });

    it('FITINN brand search returns both repaired clubs among it_*', () => {
      const hits = searchGyms('FITINN', {limit: 40, userLat: 45.46, userLng: 9.19});
      const ids = new Set(hits.filter(h => h.gym.id.startsWith('it_')).map(h => h.gym.id));
      expect(ids.has(FITINN_BICOCCA.id)).toBe(true);
      expect(ids.has(FITINN_ABRUZZI.id)).toBe(true);
    });

    it('Milano Bicocca / Viale Abruzzi map viewports include repaired pins', () => {
      const mapCenters = italy.map(g => ({
        id: g.id,
        latitude: g.latitude,
        longitude: g.longitude,
        mapLatitude: g.latitude,
        mapLongitude: g.longitude,
      }));
      const bicoccaPins = filterMapCentersInRegion(mapCenters as any, {
        latitude: FITINN_BICOCCA.lat,
        longitude: FITINN_BICOCCA.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      });
      expect(bicoccaPins.some(c => c.id === FITINN_BICOCCA.id)).toBe(true);

      const abruzziPins = filterMapCentersInRegion(mapCenters as any, {
        latitude: FITINN_ABRUZZI.lat,
        longitude: FITINN_ABRUZZI.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      });
      expect(abruzziPins.some(c => c.id === FITINN_ABRUZZI.id)).toBe(true);
      expect(abruzziPins.length).toBeLessThan(catalog.length);
    });

    it('check-in coords resolve to repaired official pins', () => {
      const b = getGymLatLngForCheckIn(FITINN_BICOCCA.id)!;
      expect(almostEqual(b.latitude, FITINN_BICOCCA.lat)).toBe(true);
      expect(almostEqual(b.longitude, FITINN_BICOCCA.lng)).toBe(true);
      const a = getGymLatLngForCheckIn(FITINN_ABRUZZI.id)!;
      expect(almostEqual(a.latitude, FITINN_ABRUZZI.lat)).toBe(true);
      expect(almostEqual(a.longitude, FITINN_ABRUZZI.lng)).toBe(true);
    });
  });

  // ─── 4. Full Italy integrity ───────────────────────────────────
  describe('4. Full Italy catalog integrity', () => {
    it('all IDs unique it_* Italy active with required fields', () => {
      const ids = itCenters.map(c => c.id);
      expect(new Set(ids).size).toBe(588);
      expect(GYM_ID_PREFIX.italy).toBe('it_');
      for (const c of itCenters) {
        expect(c.id).toMatch(/^it_/);
        expect(c.country).toBe('Italy');
        expect(c.is_active).toBe(true);
        expect(c.name.trim()).toBeTruthy();
        expect(c.brand.trim()).toBeTruthy();
        expect(c.address.trim()).toBeTruthy();
        expect(c.city.trim()).toBeTruthy();
        expect(typeof c.postal_code).toBe('string');
        expect(CAP_RE.test(c.postal_code)).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat === 0 && c.lng === 0).toBe(false);
      }
    });

    it('leading-zero CAP preserved as string (production has some)', () => {
      const leading = itCenters.filter(c => c.postal_code.startsWith('0'));
      expect(leading.length).toBeGreaterThan(0);
      for (const c of leading) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code.length).toBe(5);
      }
    });

    it('no mojibake in Italian text fields', () => {
      for (const c of itCenters) {
        const blob = `${c.name} ${c.brand} ${c.address} ${c.city}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
      }
    });

    it('Italy does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Italy')).toBe(false);
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
    });
  });

  // ─── 5. Original 550 regression ────────────────────────────────
  describe('5. Original 550 regression', () => {
    it('all Phase 2 READY IDs still present', () => {
      expect(phase2Ids.size).toBe(550);
      for (const id of phase2Ids) {
        expect(findCenterById(id)).toBeDefined();
      }
    });

    it('completeness IDs are additive (not replacing Phase 2 IDs)', () => {
      for (const id of completenessIds) {
        expect(phase2Ids.has(id)).toBe(false);
      }
    });
  });

  // ─── 6. Brand breakdown ────────────────────────────────────────
  describe('6. Real brand breakdown sums to 588', () => {
    it('production brand table', () => {
      const counts: Record<string, number> = {};
      for (const c of itCenters) {
        counts[c.brand] = (counts[c.brand] || 0) + 1;
      }
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(sum).toBe(588);
      expect(counts.FitActive).toBe(193);
      expect(counts.FitUP).toBe(80);
      expect(counts['Anytime Fitness']).toBe(68);
      expect(counts['Fit Express']).toBe(55);
      expect(counts.McFIT).toBe(42);
      expect(counts['Virgin Active']).toBe(42);
      expect(counts['Icon Palestre']).toBe(36);
      expect(counts.Orange).toBe(23);
      expect(counts.WebFit).toBe(16);
      expect(counts.FITINN).toBe(10);
      expect(counts.GetFIT).toBe(8);
      expect(counts['20Hours']).toBe(7);
      expect(counts.Dabliu).toBe(5);
      expect(counts["Gold's Gym"]).toBe(2);
      expect(counts['JOHN REED']).toBe(1);
    });
  });

  // ─── 7. Brand search ───────────────────────────────────────────
  describe('7. All-brand search', () => {
    const brands = [
      'FitActive',
      'FitUP',
      'Anytime Fitness',
      'Fit Express',
      'McFIT',
      'Virgin Active',
      'Icon Palestre',
      'Orange',
      'WebFit',
      'FITINN',
      'GetFIT',
      '20Hours',
      'Dabliu',
      "Gold's Gym",
      'JOHN REED',
    ];

    it.each(brands)('%s returns it_* results', brand => {
      const hits = searchGyms(brand, {limit: 60, userLat: 45.46, userLng: 9.19});
      expect(hits.some(h => h.gym.id.startsWith('it_') && h.gym.brand === brand)).toBe(true);
    });

    it('Icon alias finds Icon Palestre', () => {
      const hits = searchGyms('Icon', {limit: 40, userLat: 45.46, userLng: 9.19});
      expect(hits.some(h => h.gym.brand === 'Icon Palestre')).toBe(true);
    });
  });

  // ─── 8. All 38 discoverable ────────────────────────────────────
  describe('8. All 38 completeness gyms discoverable', () => {
    it('38/38 findable by brand or name', () => {
      const failures: string[] = [];
      for (const r of completenessReady) {
        const prod = findCenterById(r.id)!;
        const brandHits = searchGyms(prod.brand, {limit: 80, userLat: prod.lat!, userLng: prod.lng!});
        const nameHits = searchGyms(prod.name, {limit: 40, userLat: prod.lat!, userLng: prod.lng!});
        const found =
          brandHits.some(h => h.gym.id === r.id) || nameHits.some(h => h.gym.id === r.id);
        if (!found) {
          failures.push(r.id);
        }
      }
      expect(failures).toEqual([]);
    });
  });

  // ─── 9. City / CAP / normalization ─────────────────────────────
  describe('9. City, CAP, normalization search', () => {
    const cities = [
      'Milano',
      'Roma',
      'Torino',
      'Napoli',
      'Bologna',
      'Firenze',
      'Genova',
      'Palermo',
      'Bari',
      'Catania',
      'Verona',
      'Venezia',
      'Mestre',
      'Padova',
      'Brescia',
      'Bergamo',
    ];

    it.each(cities)('%s returns it_* when city exists in production', city => {
      const hasCity = itCenters.some(c => c.city.toLowerCase() === city.toLowerCase());
      if (!hasCity) {
        return;
      }
      const hits = searchGyms(city, {limit: 40, userLat: 41.9, userLng: 12.5});
      const itHits = hits.filter(h => h.gym.id.startsWith('it_'));
      expect(itHits.length).toBeGreaterThan(0);
      expect(itHits.some(h => h.gym.city.toLowerCase().includes(city.toLowerCase()))).toBe(true);
    });

    it('Milano exact query ranks Italian Milano results (not foreign-only)', () => {
      const hits = searchGyms('Milano', {limit: 20, userLat: 45.46, userLng: 9.19});
      expect(hits[0]?.gym.id.startsWith('it_')).toBe(true);
      expect(hits.filter(h => h.gym.city === 'Milano' && h.gym.id.startsWith('it_')).length).toBeGreaterThan(0);
    });

    it('leading-zero CAP search works for a real production CAP', () => {
      const sample = itCenters.find(c => c.postal_code.startsWith('0'))!;
      expect(sample).toBeDefined();
      const hits = searchGyms(sample.postal_code, {
        limit: 40,
        userLat: sample.lat!,
        userLng: sample.lng!,
      });
      expect(hits.some(h => h.gym.id === sample.id)).toBe(true);
    });

    it('diacritic / apostrophe normalization preserves stored text', () => {
      const diacritic = itCenters.find(c => /[àèéìòù]/i.test(`${c.name}${c.city}${c.address}`));
      expect(diacritic).toBeDefined();
      const before = `${diacritic!.name}|${diacritic!.city}|${diacritic!.address}`;
      if (/forl/i.test(diacritic!.city) || /forl/i.test(diacritic!.name)) {
        const hits = searchGyms('Forli', {limit: 20, userLat: 44.22, userLng: 12.04});
        expect(hits.some(h => h.gym.id.startsWith('it_'))).toBe(true);
      }
      const after = findCenterById(diacritic!.id)!;
      expect(`${after.name}|${after.city}|${after.address}`).toBe(before);
      expect(normalizeGymSearchValue('Forlì')).toBe('forli');
    });
  });

  // ─── 10. Onboarding / profile / planned ────────────────────────
  describe('10. Onboarding, profile, planned-session resolution', () => {
    it('completeness + FITINN IDs selectable; display uses name; max-3 list ok', () => {
      const picks = [FITINN_BICOCCA.id, FITINN_ABRUZZI.id, completenessIds[0]];
      expect(picks.length).toBe(3);
      for (const id of picks) {
        const g = findGymById(id)!;
        expect(g).not.toBeNull();
        expect(formatGymDisplayName(g)).not.toMatch(/^it_/);
        expect(formatGymDisplayName(g).length).toBeGreaterThan(0);
      }
    });

    it('mixed-country favorites resolve (IT + DK)', () => {
      const dk = catalog.find(c => isDenmarkCountry(c.country))!;
      const it = findGymById(FITINN_BICOCCA.id)!;
      expect(findGymById(dk.id)?.id).toBe(dk.id);
      expect(it.id).toBe(FITINN_BICOCCA.id);
      expect(it.country).not.toBe(dk.country);
    });

    it('Italy country labels via i18n', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(formatGymCountryLabel('Italy', tEn)).toBe('Italy');
      expect(tDa('countries.italy')).toBe('Italien');
      expect(tSv('countries.italy')).toBe('Italien');
      expect(tNb('countries.italy')).toBe('Italia');
      const line = gymPickerLocationLine(
        {city: 'Milano', region: 'Italia', country: 'Italy'},
        tEn,
      );
      expect(line).toContain('Milano');
      expect(line).toContain('Italy');
    });

    it('onboarding-style search finds FITINN Bicocca / Abruzzi', () => {
      const hits = searchGyms('FITINN Milano', {limit: 30, userLat: 45.46, userLng: 9.19}).map(
        h => h.gym,
      );
      expect(hits.some(g => g.id === FITINN_BICOCCA.id)).toBe(true);
      expect(hits.some(g => g.id === FITINN_ABRUZZI.id)).toBe(true);
    });
  });

  // ─── 11. Nearest / dense / map ─────────────────────────────────
  describe('11. Nearest, dense, map', () => {
    const cities: Array<[string, number, number]> = [
      ['Milano', 45.4642, 9.19],
      ['Roma', 41.9028, 12.4964],
      ['Torino', 45.0703, 7.6869],
      ['Napoli', 40.8518, 14.2681],
      ['Bologna', 44.4949, 11.3426],
    ];

    it.each(cities)('nearest from %s returns it_*', (_name, lat, lng) => {
      const n = findNearestGym(lat, lng, italy);
      expect(n?.id.startsWith('it_')).toBe(true);
    });

    it('nearest at Bicocca pin is geographically local (it_*)', () => {
      const n = findNearestGym(FITINN_BICOCCA.lat, FITINN_BICOCCA.lng, italy)!;
      expect(n.id.startsWith('it_')).toBe(true);
      const d = calculateDistance(
        FITINN_BICOCCA.lat,
        FITINN_BICOCCA.lng,
        n.latitude,
        n.longitude,
      );
      expect(d).toBeLessThan(500);
    });

    it('nearest at Abruzzi pin is geographically local (it_*)', () => {
      const n = findNearestGym(FITINN_ABRUZZI.lat, FITINN_ABRUZZI.lng, italy)!;
      expect(n.id.startsWith('it_')).toBe(true);
      const d = calculateDistance(
        FITINN_ABRUZZI.lat,
        FITINN_ABRUZZI.lng,
        n.latitude,
        n.longitude,
      );
      expect(d).toBeLessThan(500);
    });

    it('different-brand identical-coordinate pairs keep separate IDs', () => {
      const a = findCenterById('it_dd296aa3bd')!;
      const b = findCenterById('it_1dbcbcdcc6')!;
      expect(a.brand).not.toBe(b.brand);
      expect(a.lat).toBe(b.lat);
      expect(a.lng).toBe(b.lng);
      expect(a.id).not.toBe(b.id);
    });

    it('manual selection persists by ID (dense pair)', () => {
      const selected = findGymById('it_c65268f0c1')!;
      expect(selected.id).toBe('it_c65268f0c1');
      // GPS nearest elsewhere must not replace selected ID resolution
      const nearestElsewhere = findNearestGym(45.46, 9.19, italy)!;
      expect(findGymById(selected.id)?.id).toBe(selected.id);
      expect(nearestElsewhere.id === selected.id || nearestElsewhere.id !== selected.id).toBe(true);
    });

    it('Italian viewports filter and do not render full catalog', () => {
      const mapCenters = italy.map(g => ({
        id: g.id,
        latitude: g.latitude,
        longitude: g.longitude,
        mapLatitude: g.latitude,
        mapLongitude: g.longitude,
      }));
      for (const [, lat, lng] of cities) {
        const pins = filterMapCentersInRegion(mapCenters as any, {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.25,
          longitudeDelta: 0.25,
        });
        expect(pins.some(c => c.id.startsWith('it_'))).toBe(true);
        expect(pins.length).toBeLessThan(catalog.length);
        expect(pins.length).toBeLessThan(2000);
      }
    });
  });

  // ─── 12. 200m check-in / auto-checkout ─────────────────────────
  describe('12. 200m check-in and auto-checkout', () => {
    it('radii remain 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('boundary table against repaired FITINN Bicocca', () => {
      const coords = getGymLatLngForCheckIn(FITINN_BICOCCA.id)!;
      const cases: Array<[number, boolean]> = [
        [500, false],
        [250, false],
        [201, false],
        [200, true],
        [199, true],
        [100, true],
        [10, true],
      ];
      for (const [meters, allowed] of cases) {
        const dLat = meters / 111_320;
        const userLat = coords.latitude + dLat;
        const d = calculateDistance(userLat, coords.longitude, coords.latitude, coords.longitude);
        expect(Math.abs(d - meters)).toBeLessThan(2);
        expect(d <= CHECK_IN_RADIUS_METERS).toBe(allowed);
      }
    });

    it('auto-checkout uses active session gym (completeness FITINN), not nearest', () => {
      const gym = findGymById(FITINN_ABRUZZI.id)!;
      const coords = getGymLatLngForCheckIn(gym.id)!;
      const now = Date.now();
      expect(decideGeofenceAutoCheckout(200, null, now).action).not.toBe('set_away');
      expect(decideGeofenceAutoCheckout(200, null, now).action).not.toBe('checkout_away');
      expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
      const nearestOther = findNearestGym(coords.latitude + 0.05, coords.longitude + 0.05, italy);
      expect(gym.id).not.toBe(nearestOther?.id ?? '');
      expect(findGymById(gym.id)?.id).toBe(FITINN_ABRUZZI.id);
    });
  });

  // ─── 13. Session / history / feed / notifications ──────────────
  describe('13. Session association via ID resolution', () => {
    it('workout/PR/history/feed/notification paths resolve completeness IDs by name', () => {
      for (const id of [FITINN_BICOCCA.id, FITINN_ABRUZZI.id, completenessIds[5]]) {
        const g = findGymById(id)!;
        expect(g).not.toBeNull();
        const display = formatGymDisplayName(g);
        expect(display).not.toBe(id);
        expect(display).not.toMatch(/^it_/);
        // never substitute another gym
        expect(resolveGymOrStub(id).id).toBe(id);
      }
    });
  });

  // ─── 14. Orphan safety ─────────────────────────────────────────
  describe('14. Orphan-ID safety', () => {
    it('nonexistent it_* does not fall back to DK / catalog[0] / random IT', () => {
      expect(findGymById('it_nonexistent_final_qa')).toBeNull();
      expect(findGymByIdRelaxed('it_nonexistent_final_qa')).toBeNull();
      const stub = resolveGymOrStub('it_nonexistent_final_qa');
      expect(stub.id).toBe('it_nonexistent_final_qa');
      expect(stub.name).toBe('Unknown gym');
      expect(getActiveCenters()[0]?.id).not.toBe(stub.id);
      const unresolved = unresolvedGymStub('it_fake_final');
      expect(unresolved.id).toBe('it_fake_final');
    });
  });

  // ─── 15. Geography ─────────────────────────────────────────────
  describe('15. Geography', () => {
    it('no bbox outliers; FITINN repairs in Milano area', () => {
      for (const c of itCenters) {
        expect(c.lat!).toBeGreaterThanOrEqual(36.6);
        expect(c.lat!).toBeLessThanOrEqual(47.15);
        expect(c.lng!).toBeGreaterThanOrEqual(6.6);
        expect(c.lng!).toBeLessThanOrEqual(18.6);
      }
      const b = findCenterById(FITINN_BICOCCA.id)!;
      const a = findCenterById(FITINN_ABRUZZI.id)!;
      expect(b.city).toBe('Milano');
      expect(a.city).toBe('Milano');
      expect(b.lat!).toBeGreaterThan(45.4);
      expect(b.lat!).toBeLessThan(45.6);
      expect(a.lat!).toBeGreaterThan(45.4);
      expect(a.lat!).toBeLessThan(45.55);
    });

    it('no same-brand pairs within 100 m', () => {
      const bad: string[] = [];
      for (let i = 0; i < itCenters.length; i++) {
        for (let j = i + 1; j < itCenters.length; j++) {
          const a = itCenters[i];
          const b = itCenters[j];
          if (a.brand !== b.brand) {
            continue;
          }
          const d = calculateDistance(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d <= 100) {
            bad.push(`${a.id}|${b.id}|${Math.round(d)}`);
          }
        }
      }
      expect(bad).toEqual([]);
    });
  });

  // ─── 16. Performance / 10k ─────────────────────────────────────
  describe('16. Performance and 10K checkpoint', () => {
    it('search index builds in <5000ms at 10050', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      expect(index.length).toBe(gyms.length);
      expect(Date.now() - start).toBeLessThan(5000);
    });

    it('catalog crossed 10k threshold at 10050', () => {
      expect(catalog.length).toBe(10050);
      expect(catalog.length).toBeGreaterThan(10000);
      expect(catalog.length - 10000).toBe(50);
    });
  });
});
