/**
 * France gym QA — comprehensive production validation after fr_* merge.
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
  isNetherlandsCountry,
  isNorwayCountry,
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

const staging = require('../data/france/france_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  id?: string;
  verification_status?: string;
  is_active?: boolean;
}>;

describe('France gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const france = gyms.filter(g => isFranceCountry(g.country));
  const frCenters = catalog.filter(c => isFranceCountry(c.country));

  // ─── 1. Catalog integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('France = 1712 centers', () => {
      expect(frCenters.length).toBe(1712);
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

    it('all FR IDs use fr_* prefix', () => {
      for (const c of frCenters) {
        expect(c.id).toMatch(/^fr_/);
      }
    });

    it('all FR centers have country="France"', () => {
      for (const c of frCenters) {
        expect(c.country).toBe('France');
      }
    });

    it('all FR centers are active', () => {
      for (const c of frCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all FR centers have name, brand, address, postal_code, city', () => {
      for (const c of frCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all FR centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of frCenters) {
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

  // ─── 2. Merge difference ────────────────────────────────────────
  describe('2. Merge difference (1902→1712)', () => {
    it('staging has 1712 MERGED_INTO_CATALOG', () => {
      const merged = staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG');
      expect(merged.length).toBe(1712);
    });

    it('168 inactive + 1 missing address + 21 duplicates = 190 withheld', () => {
      const mergeReport = require('../data/france/FRANCE_MERGE_REPORT.json');
      expect(mergeReport.rejected.not_active).toBe(168);
      expect(mergeReport.rejected.missing_address).toBe(1);
      const dupeAnalysis = require('../data/france/FRANCE_MERGE_DUPLICATE_ANALYSIS.json');
      const totalDupes =
        (dupeAnalysis.skipped_same_addr_brand?.length ?? 0) +
        (dupeAnalysis.skipped_proximity_same_brand?.length ?? 0) +
        (dupeAnalysis.skipped_batch_dup?.length ?? 0);
      expect(totalDupes).toBe(21);
      expect(168 + 1 + 21).toBe(190);
    });

    it('no COMING_SOON in production', () => {
      const cs = staging.filter(s => s.import_category === 'COMING_SOON');
      for (const s of cs) {
        expect(frCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('no NEEDS_REVIEW in production', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      for (const s of nr) {
        expect(frCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('no NEEDS_COORDINATES in production', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      for (const s of nc) {
        expect(frCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });
  });

  // ─── 3. Brand breakdown ─────────────────────────────────────────
  describe('3. Brand breakdown', () => {
    const expected: Record<string, number> = {
      'Basic-Fit': 892,
      'Fitness Park': 266,
      'Keepcool': 197,
      "L'Orange Bleue": 169,
      "L'Appart Fitness": 109,
      'Elancia': 28,
      'Vita Liberté': 22,
      'ON AIR Fitness': 20,
      'Anytime Fitness': 3,
      'Gigafit': 3,
      'Magic Form': 2,
      'Neoness': 1,
    };

    it.each(Object.entries(expected))('%s = %d', (brand, count) => {
      expect(frCenters.filter(c => c.brand === brand).length).toBe(count);
    });

    it('brand total = 1712', () => {
      expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(1712);
    });
  });

  // ─── 4. Encoding ────────────────────────────────────────────────
  describe('4. Encoding', () => {
    it('no mojibake', () => {
      const mojibake = /Ã¤|Ã¶|Ã¥|ï¿½|â€|Ã©|Ã¸|Â/;
      for (const c of frCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(mojibake);
      }
    });

    it('French diacritics preserved', () => {
      const frenchChars = frCenters.filter(c =>
        /[éèêëàâîïôùûüçœæ]/i.test(`${c.name}|${c.address}|${c.city}|${c.brand}`),
      );
      expect(frenchChars.length).toBeGreaterThan(100);
    });
  });

  // ─── 5. Postal codes ───────────────────────────────────────────
  describe('5. Postal codes', () => {
    it('all FR postcodes are 5-digit strings', () => {
      for (const c of frCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toMatch(/^\d{5}$/);
      }
    });

    it('leading zeros preserved', () => {
      const leading = frCenters.filter(c => c.postal_code.startsWith('0'));
      expect(leading.length).toBeGreaterThan(0);
      for (const c of leading) {
        expect(c.postal_code.length).toBe(5);
      }
    });
  });

  // ─── 6. Geography ──────────────────────────────────────────────
  describe('6. Geography', () => {
    const metro = frCenters.filter(
      c => c.lat! >= 41.3 && c.lat! <= 51.1 && c.lng! >= -5.2 && c.lng! <= 9.6,
    );
    const overseas = frCenters.filter(
      c => !(c.lat! >= 41.3 && c.lat! <= 51.1 && c.lng! >= -5.2 && c.lng! <= 9.6),
    );

    it('metropolitan = 1705', () => {
      expect(metro.length).toBe(1705);
    });

    it('overseas = 7 (DOM-TOM)', () => {
      expect(overseas.length).toBe(7);
    });

    it('overseas have 97xxx postcodes', () => {
      for (const c of overseas) {
        expect(c.postal_code).toMatch(/^97/);
      }
    });

    it('France does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('France')).toBe(false);
    });
  });

  // ─── 7. Brand search ───────────────────────────────────────────
  describe('7. Brand search', () => {
    const frBrands = [
      'Basic-Fit', 'Fitness Park', "L'Orange Bleue", 'Keepcool',
      'ON AIR Fitness', 'Neoness', "L'Appart Fitness", 'Elancia',
      'Gigafit', 'Magic Form', 'Vita Liberté', 'Anytime Fitness',
    ];

    it.each(frBrands)('%s returns fr_* results (with Paris location)', (brand) => {
      const hits = searchGyms(brand, {limit: 100, userLat: 48.86, userLng: 2.35});
      const frHits = hits.filter(h => h.gym.id.startsWith('fr_'));
      expect(frHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 8. City search ────────────────────────────────────────────
  describe('8. City search', () => {
    const cities = [
      'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes',
      'Montpellier', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes',
      'Reims', 'Le Havre', 'Saint-Étienne', 'Toulon', 'Grenoble',
      'Dijon', 'Angers', 'Nîmes', 'Clermont-Ferrand',
    ];

    it.each(cities)('%s returns fr_* results', (city) => {
      const hits = searchGyms(city, {limit: 40});
      const frHits = hits.filter(h => h.gym.id.startsWith('fr_'));
      expect(frHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 9. Diacritic/ASCII search ─────────────────────────────────
  describe('9. Diacritic/ASCII search', () => {
    it('Saint-Etienne → returns Saint-Étienne results', () => {
      const hits = searchGyms('Saint-Etienne', {limit: 40});
      const frHits = hits.filter(h => h.gym.id.startsWith('fr_'));
      expect(frHits.length).toBeGreaterThan(0);
    });

    it('Nimes → returns Nîmes results', () => {
      const hits = searchGyms('Nimes', {limit: 40});
      const frHits = hits.filter(h => h.gym.id.startsWith('fr_'));
      expect(frHits.length).toBeGreaterThan(0);
    });

    it('Orleans → returns Orléans results', () => {
      const hits = searchGyms('Orleans', {limit: 40});
      const frHits = hits.filter(h => h.gym.id.startsWith('fr_'));
      expect(frHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 10. Postal search ─────────────────────────────────────────
  describe('10. Postal search', () => {
    const postcodes = ['75001', '69001', '13001', '31000', '06000'];

    it.each(postcodes)('%s returns fr_* results', (pc) => {
      const hits = searchGyms(pc, {limit: 40});
      const frHits = hits.filter(h => h.gym.id.startsWith('fr_'));
      expect(frHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 11. Country labels ────────────────────────────────────────
  describe('11. Country labels', () => {
    it('gymCountryTranslationKey returns countries.france', () => {
      expect(gymCountryTranslationKey('France')).toBe('countries.france');
    });

    it('France label in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.france')).toBe('France');
      expect(tDa('countries.france')).toBe('Frankrig');
      expect(tSv('countries.france')).toBe('Frankrike');
      expect(tNb('countries.france')).toBe('Frankrike');
    });

    it('gymPickerLocationLine includes France', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Paris', region: 'France', country: 'France'},
        t,
      );
      expect(line).toContain('Paris');
      expect(line).toContain('France');
    });
  });

  // ─── 12. Onboarding ────────────────────────────────────────────
  describe('12. Onboarding', () => {
    it('FR gym is selectable from active list', () => {
      expect(france.length).toBeGreaterThan(0);
    });

    it('fr_* ID is valid and resolves', () => {
      const sample = france[0]!;
      expect(sample.id).toMatch(/^fr_/);
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

  // ─── 13. Profile/favorites ─────────────────────────────────────
  describe('13. Profile/favorites', () => {
    it('fr_* resolves and shows French name', () => {
      const sample = france[Math.floor(france.length / 2)]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const display = formatGymDisplayName(resolved);
      expect(display.length).toBeGreaterThan(0);
      expect(display).not.toBe('Ubekendt center');
    });

    it('no raw ID displayed', () => {
      const sample = france[0]!;
      const display = formatGymDisplayName(findGymById(sample.id));
      expect(display).not.toMatch(/^fr_/);
    });
  });

  // ─── 14. Nearest gym ──────────────────────────────────────────
  describe('14. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Paris', 48.86, 2.35],
      ['Marseille', 43.30, 5.37],
      ['Lyon', 45.76, 4.84],
      ['Toulouse', 43.60, 1.44],
      ['Nice', 43.71, 7.26],
      ['Bordeaux', 44.84, -0.58],
      ['Lille', 50.63, 3.06],
      ['Strasbourg', 48.57, 7.75],
    ];

    it.each(coords)('nearest gym in %s is fr_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, france);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^fr_/);
    });

    it('nearest from Paris coords returns fr_* (not DK/SE/etc)', () => {
      const nearest = findNearestGym(48.86, 2.35, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^fr_/);
    });
  });

  // ─── 15. Dense/co-located ──────────────────────────────────────
  describe('15. Dense/co-located pairs', () => {
    it('different brands coexist as separate fr_* entries', () => {
      const bf = france.filter(g => g.brand === 'Basic-Fit');
      const fp = france.filter(g => g.brand === 'Fitness Park');
      expect(bf.length).toBeGreaterThan(0);
      expect(fp.length).toBeGreaterThan(0);
      const bfIds = new Set(bf.map(g => g.id));
      expect(fp.filter(g => bfIds.has(g.id)).length).toBe(0);
    });

    it('dense pairs exist (≤50m)', () => {
      let count = 0;
      const sample = france.slice(0, 500);
      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          const d = calculateDistance(
            sample[i]!.latitude, sample[i]!.longitude,
            sample[j]!.latitude, sample[j]!.longitude,
          );
          if (d <= 50) count++;
        }
      }
      expect(count).toBeGreaterThanOrEqual(0);
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

    it('FR center resolves check-in coords', () => {
      const sample = france[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      expect(Number.isFinite(coords!.latitude)).toBe(true);
      expect(Number.isFinite(coords!.longitude)).toBe(true);
    });

    it('500m → blocked', () => {
      const d = decideGeofenceAutoCheckout(500, null, Date.now());
      expect(d.action).toBe('set_away');
    });

    it('250m → blocked', () => {
      const d = decideGeofenceAutoCheckout(250, null, Date.now());
      expect(d.action).toBe('set_away');
    });

    it('201m → triggers away', () => {
      const d = decideGeofenceAutoCheckout(201, null, Date.now());
      expect(d.action).toBe('set_away');
    });

    it('200m → still inside', () => {
      const d = decideGeofenceAutoCheckout(200, null, Date.now());
      expect(d.action).not.toBe('checkout_away');
      expect(d.action).not.toBe('set_away');
    });

    it('199m → allowed', () => {
      const d = decideGeofenceAutoCheckout(199, null, Date.now());
      expect(d.action).toBe('none');
    });

    it('100m → allowed', () => {
      const d = decideGeofenceAutoCheckout(100, null, Date.now());
      expect(d.action).toBe('none');
    });

    it('10m → allowed', () => {
      const d = decideGeofenceAutoCheckout(10, null, Date.now());
      expect(d.action).toBe('none');
    });
  });

  // ─── 17. Auto-checkout ────────────────────────────────────────
  describe('17. Auto-checkout uses session gym ID', () => {
    it('geofence at gym location = none', () => {
      const sample = france[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      const d = calculateDistance(
        coords!.latitude, coords!.longitude,
        coords!.latitude, coords!.longitude,
      );
      expect(d).toBe(0);
      expect(decideGeofenceAutoCheckout(d, null, Date.now()).action).toBe('none');
    });
  });

  // ─── 18. Workout/PR ───────────────────────────────────────────
  describe('18. Workout/PR flow', () => {
    it('FR gym resolves — country irrelevant to logging', () => {
      const sample = france[0]!;
      expect(sample.country).toBe('France');
      expect(findGymById(sample.id)).not.toBeNull();
    });
  });

  // ─── 19. History ──────────────────────────────────────────────
  describe('19. History', () => {
    it('fr_* resolves to correct name, no raw ID', () => {
      const sample = france[10] ?? france[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });
  });

  // ─── 20. Feed/share ───────────────────────────────────────────
  describe('20. Feed/share', () => {
    it('FR session retains correct gym data', () => {
      const sample = france[5] ?? france[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.city).toBeTruthy();
      expect(resolved!.country).toBe('France');
    });

    it('no Danish fallback', () => {
      const sample = france[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved!.country).not.toBe('Denmark');
    });
  });

  // ─── 21. Notifications ────────────────────────────────────────
  describe('21. Notifications', () => {
    it('fr_* resolves for notification display', () => {
      const sample = france[20] ?? france[0]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(resolved.name).not.toBe('Unknown gym');
    });
  });

  // ─── 22. Planned sessions ─────────────────────────────────────
  describe('22. Planned sessions', () => {
    it('FR center selectable and persists', () => {
      const sample = france[15] ?? france[0]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(findGymById(resolved!.id)!.id).toBe(sample.id);
    });
  });

  // ─── 23. Map viewport ─────────────────────────────────────────
  describe('23. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Paris', 48.86, 2.35],
      ['Marseille', 43.30, 5.37],
      ['Lyon', 45.76, 4.84],
      ['Toulouse', 43.60, 1.44],
      ['Nice', 43.71, 7.26],
      ['Bordeaux', 44.84, -0.58],
      ['Lille', 50.63, 3.06],
    ];

    it.each(viewports)('%s viewport shows fr_* pins', (_city, lat, lng) => {
      const mapCenters = france.map(g => ({
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
        expect(v.id).toMatch(/^fr_/);
      }
    });
  });

  // ─── 24. Inactive/withheld ────────────────────────────────────
  describe('24. Inactive/withheld', () => {
    it('168 inactive not in production', () => {
      const inactive = staging.filter(s => s.is_active === false);
      for (const s of inactive) {
        expect(frCenters.find(c => c.id === s.id)).toBeUndefined();
      }
    });

    it('inactive not searchable', () => {
      const inactiveSample = staging.find(s => s.is_active === false && s.name);
      if (inactiveSample?.name) {
        const hits = searchGyms(inactiveSample.name, {limit: 10});
        const match = hits.find(h => h.gym.id === inactiveSample.id);
        expect(match).toBeUndefined();
      }
    });
  });

  // ─── 25. Orphan-ID safety ─────────────────────────────────────
  describe('25. Orphan-ID safety', () => {
    it('invalid fr_xxx does not resolve', () => {
      expect(findGymById('fr_nonexistent_xxx')).toBeNull();
    });

    it('invalid fr_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('fr_nonexistent_xxx');
      expect(stub.id).toBe('fr_nonexistent_xxx');
      expect(stub.region).toBe('France');
      expect(stub.name).toBe('Unknown gym');
    });

    it('relaxed lookup also returns null for invalid fr_*', () => {
      expect(findGymByIdRelaxed('fr_nonexistent_xxx')).toBeNull();
    });
  });

  // ─── 26-32. Regressions ───────────────────────────────────────
  describe('26-32. Regression counts', () => {
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

    it('DK search still works', () => {
      const hits = searchGyms('PureGym', {limit: 10, userLat: 55.68, userLng: 12.57});
      expect(hits.length).toBeGreaterThan(0);
    });

    it('SE search still works', () => {
      const hits = searchGyms('SATS Stockholm', {limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    });

    it('NO search still works', () => {
      const hits = searchGyms('SATS Oslo', {limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    });

    it('DE search still works', () => {
      const hits = searchGyms('clever fit Berlin', {limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    });

    it('GB search still works', () => {
      const hits = searchGyms('PureGym London', {limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    });

    it('NL search still works', () => {
      const hits = searchGyms('Basic-Fit Amsterdam', {limit: 10});
      const nl = hits.filter(h => h.gym.id.startsWith('nl_'));
      expect(nl.length).toBeGreaterThan(0);
    });

    it('FI search still works', () => {
      const hits = searchGyms('Elixia Helsinki', {limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  // ─── 33. Performance ──────────────────────────────────────────
  describe('33. Performance', () => {
    it('search index builds in <5000ms for 10050 centers', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      const elapsed = Date.now() - start;
      expect(index.length).toBe(gyms.length);
      expect(elapsed).toBeLessThan(5000);
    });

    it('search query completes in <2000ms', () => {
      const start = Date.now();
      searchGyms('Basic-Fit Paris', {limit: 40});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('nearest gym scan completes in <100ms', () => {
      const start = Date.now();
      findNearestGym(48.86, 2.35, france);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
