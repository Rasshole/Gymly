/**
 * Finland gym QA — comprehensive production validation after fi_* merge.
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
  isFinlandCountry,
  isGermanyCountry,
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
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import {findNearestGym} from '../src/utils/nearestGym';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {GymCenter} from '../src/types/center.types';

const staging = require('../data/finland/finland_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  id?: string;
  verification_status?: string;
}>;

describe('Finland gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const finland = gyms.filter(g => isFinlandCountry(g.country));
  const fiCenters = catalog.filter(c => isFinlandCountry(c.country));

  // ─── 1. Catalog counts & integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Finland = 429 centers', () => {
      expect(fiCenters.length).toBe(429);
    });

    it('all Finland IDs use fi_* prefix', () => {
      for (const c of fiCenters) {
        expect(c.id).toMatch(/^fi_/);
      }
    });

    it('all Finland centers have country="Finland"', () => {
      for (const c of fiCenters) {
        expect(c.country).toBe('Finland');
      }
    });

    it('all Finland centers are active', () => {
      for (const c of fiCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all Finland centers have name, brand, address, postal_code, city', () => {
      for (const c of fiCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all Finland centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of fiCenters) {
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

  // ─── 2. Postal codes ────────────────────────────────────────────────────
  describe('2. Postal codes', () => {
    it('all strings, all 5 chars', () => {
      for (const c of fiCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toMatch(/^\d{5}$/);
      }
    });

    it('leading zeros preserved (~193 start with 0)', () => {
      const leadingZero = fiCenters.filter(c => c.postal_code.startsWith('0'));
      expect(leadingZero.length).toBeGreaterThanOrEqual(190);
      expect(leadingZero.length).toBeLessThanOrEqual(200);
    });
  });

  // ─── 3. Finnish encoding ────────────────────────────────────────────────
  describe('3. Finnish encoding', () => {
    it('ä/ö/å preserved in names/addresses/cities', () => {
      const hasUmlaut = fiCenters.some(
        c => /[äöåÄÖÅ]/.test(c.name) || /[äöåÄÖÅ]/.test(c.address) || /[äöåÄÖÅ]/.test(c.city),
      );
      expect(hasUmlaut).toBe(true);
    });

    it('no mojibake in any Finnish center', () => {
      const mojibake = /Ã¤|Ã¶|Ã¥|ï¿½|â€|Ã|Ã©|Ã¸|Â/;
      for (const c of fiCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(mojibake);
      }
    });
  });

  // ─── 4. Geography ──────────────────────────────────────────────────────
  describe('4. Geography', () => {
    it('all coords within Finland bbox', () => {
      for (const c of fiCenters) {
        expect(c.lat!).toBeGreaterThanOrEqual(59.7);
        expect(c.lat!).toBeLessThanOrEqual(70.12);
        expect(c.lng!).toBeGreaterThanOrEqual(19.3);
        expect(c.lng!).toBeLessThanOrEqual(31.6);
      }
    });

    it('no Helsinki fallback on non-Helsinki city', () => {
      const helsinkiLat = 60.1699;
      const helsinkiLng = 24.9384;
      const nonHelsinki = fiCenters.filter(
        c => c.city.toLowerCase() !== 'helsinki',
      );
      for (const c of nonHelsinki) {
        const d = calculateDistance(c.lat!, c.lng!, helsinkiLat, helsinkiLng);
        if (d < 50) {
          // Very close to Helsinki centroid but city != Helsinki — flag
          // Allow Espoo/Vantaa metro overlap but not exact centroid match
          expect(
            Math.abs(c.lat! - helsinkiLat) > 0.001 ||
              Math.abs(c.lng! - helsinkiLng) > 0.001,
          ).toBe(true);
        }
      }
    });

    it('Finland does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Finland')).toBe(false);
    });
  });

  // ─── 5. Brand search ───────────────────────────────────────────────────
  describe('5. Brand search', () => {
    const fiBrands = [
      'EasyFit', 'ELIXIA', 'Fressi', 'Liikku', 'Forever',
      'Fitness24Seven', 'LadyLine', 'GOGO Express', 'GYM Anytime',
      'PTVGYM', 'Greenfit', 'Vocatum', 'Energy', 'Esport',
      'GOGO', 'Ole.Fit',
    ];

    it.each(fiBrands)('%s returns fi_* results (with Helsinki location)', (brand) => {
      const hits = searchGyms(brand, {limit: 100, userLat: 60.17, userLng: 24.94});
      const fiHits = hits.filter(h => h.gym.id.startsWith('fi_'));
      expect(fiHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 6. City search ────────────────────────────────────────────────────
  describe('6. City search', () => {
    const cities = [
      'Helsinki', 'Espoo', 'Vantaa', 'Tampere', 'Turku', 'Oulu',
      'Jyväskylä', 'Kuopio', 'Lahti', 'Pori', 'Vaasa', 'Joensuu',
      'Hämeenlinna', 'Seinäjoki', 'Rovaniemi',
    ];

    it.each(cities)('%s returns fi_* results', (city) => {
      const hits = searchGyms(city, {limit: 40});
      const fiHits = hits.filter(h => h.gym.id.startsWith('fi_'));
      expect(fiHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 7. ASCII/diacritic search ─────────────────────────────────────────
  describe('7. ASCII/diacritic search', () => {
    const pairs: [string, string][] = [
      ['Hameenlinna', 'Hämeenlinna'],
      ['Jyvaskyla', 'Jyväskylä'],
      ['Seinajoki', 'Seinäjoki'],
    ];

    it.each(pairs)('%s finds centers in %s', (ascii, _native) => {
      const hits = searchGyms(ascii, {limit: 40});
      const fiHits = hits.filter(h => h.gym.id.startsWith('fi_'));
      expect(fiHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 8. Brand variants ─────────────────────────────────────────────────
  describe('8. Brand variants', () => {
    const variants: [string, string][] = [
      ['Fitness 24 Seven', 'Fitness24Seven'],
      ['F24', 'Fitness24Seven'],
      ['Ole Fit', 'Ole.Fit'],
      ['GOGO', 'GOGO Express'],
      ['PTV Gym', 'PTVGYM'],
      ['Gym Anytime', 'GYM Anytime'],
    ];

    it.each(variants)('"%s" returns fi_* results (with Helsinki location)', (variant, _canonical) => {
      const hits = searchGyms(variant, {limit: 100, userLat: 60.17, userLng: 24.94});
      const fiHits = hits.filter(h => h.gym.id.startsWith('fi_'));
      expect(fiHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 9. Onboarding ─────────────────────────────────────────────────────
  describe('9. Onboarding', () => {
    it('Finnish gym is selectable from active list', () => {
      expect(finland.length).toBeGreaterThan(0);
    });

    it('fi_* ID is valid and resolves', () => {
      const sample = finland[0]!;
      expect(sample.id).toMatch(/^fi_/);
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe(sample.name);
    });
  });

  // ─── 10. Profile/favorites ─────────────────────────────────────────────
  describe('10. Profile/favorites', () => {
    it('fi_* resolves and shows Finnish name', () => {
      const sample = finland[Math.floor(finland.length / 2)]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const display = formatGymDisplayName(resolved);
      expect(display.length).toBeGreaterThan(0);
      expect(display).not.toBe('Ubekendt center');
    });
  });

  // ─── 11. Nearest gym ──────────────────────────────────────────────────
  describe('11. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Helsinki', 60.17, 24.94],
      ['Tampere', 61.50, 23.79],
      ['Oulu', 65.01, 25.47],
    ];

    it.each(coords)('nearest gym in %s is fi_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, finland);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^fi_/);
    });

    it('nearest from Helsinki coords does not return DK/SE/NO/DE/GB', () => {
      const nearest = findNearestGym(60.17, 24.94, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^fi_/);
    });
  });

  // ─── 12. Dense/co-located ──────────────────────────────────────────────
  describe('12. Dense/co-located pairs remain separate', () => {
    const coLocated: [string, string][] = [
      ['EasyFit', 'LadyLine'],   // Kouvola
      ['ELIXIA', 'Fitness24Seven'], // Hertsi
      ['Forever', 'Liikku'],     // Iso Omena
      ['LadyLine', 'PTVGYM'],   // Oulu
    ];

    it.each(coLocated)('%s / %s both exist as separate fi_* entries', (brandA, brandB) => {
      const a = finland.filter(g => g.brand?.toLowerCase().includes(brandA.toLowerCase()));
      const b = finland.filter(g => g.brand?.toLowerCase().includes(brandB.toLowerCase()));
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      // They have different IDs
      const idsA = new Set(a.map(g => g.id));
      const overlap = b.filter(g => idsA.has(g.id));
      expect(overlap.length).toBe(0);
    });
  });

  // ─── 13. 200m check-in ────────────────────────────────────────────────
  describe('13. 200m check-in radius', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('Finnish center resolves check-in coords', () => {
      const sample = finland[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      expect(Number.isFinite(coords!.latitude)).toBe(true);
      expect(Number.isFinite(coords!.longitude)).toBe(true);
    });

    it('at exactly 200m → still inside', () => {
      const decision = decideGeofenceAutoCheckout(200, null, Date.now());
      expect(decision.action).not.toBe('checkout_away');
      expect(decision.action).not.toBe('set_away');
    });

    it('at 201m → triggers away', () => {
      const decision = decideGeofenceAutoCheckout(201, null, Date.now());
      expect(decision.action).toBe('set_away');
    });
  });

  // ─── 14. Auto-checkout ────────────────────────────────────────────────
  describe('14. Auto-checkout uses session gym ID', () => {
    it('geofence uses stored distance, not nearest center', () => {
      const sample = finland[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      // Distance from same point = 0 → inside
      const d = calculateDistance(
        coords!.latitude, coords!.longitude,
        coords!.latitude, coords!.longitude,
      );
      expect(d).toBe(0);
      const decision = decideGeofenceAutoCheckout(d, null, Date.now());
      expect(decision.action).toBe('none');
    });
  });

  // ─── 15. Workout/PR ───────────────────────────────────────────────────
  describe('15. Workout/PR flow', () => {
    it('Finnish gym does not break workout — country is irrelevant to logging', () => {
      const sample = finland[0]!;
      expect(sample.country).toBe('Finland');
      // Logging only needs a valid gym id — no country gating
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
    });
  });

  // ─── 16. History ──────────────────────────────────────────────────────
  describe('16. History', () => {
    it('fi_* resolves to correct name, no raw ID displayed', () => {
      const sample = finland[10]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });
  });

  // ─── 17. Feed/share ───────────────────────────────────────────────────
  describe('17. Feed/share', () => {
    it('Finnish session retains correct gym data', () => {
      const sample = finland[5]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.city).toBeTruthy();
      expect(resolved!.country).toBe('Finland');
    });
  });

  // ─── 18. Notifications ────────────────────────────────────────────────
  describe('18. Notifications', () => {
    it('fi_* gymId resolves for notification display', () => {
      const sample = finland[20]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(resolved.name).not.toBe('Unknown gym');
    });
  });

  // ─── 19. Planned sessions ─────────────────────────────────────────────
  describe('19. Planned sessions', () => {
    it('Finnish center selectable and persists', () => {
      const sample = finland[15]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      // Simulate persist: re-resolve by ID
      const reFetched = findGymById(resolved!.id);
      expect(reFetched).not.toBeNull();
      expect(reFetched!.id).toBe(sample.id);
    });
  });

  // ─── 20. Map ──────────────────────────────────────────────────────────
  describe('20. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Helsinki', 60.17, 24.94],
      ['Tampere', 61.50, 23.79],
      ['Oulu', 65.01, 25.47],
    ];

    it.each(viewports)('%s viewport shows fi_* pins', (_city, lat, lng) => {
      const mapCenters = finland.map(g => ({
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
        expect(v.id).toMatch(/^fi_/);
      }
    });
  });

  // ─── 21. Country/i18n ─────────────────────────────────────────────────
  describe('21. Country/i18n', () => {
    it('gymCountryTranslationKey returns countries.finland', () => {
      expect(gymCountryTranslationKey('Finland')).toBe('countries.finland');
    });

    it('Finland label exists in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.finland')).toBe('Finland');
      expect(tDa('countries.finland')).toBe('Finland');
      expect(tSv('countries.finland')).toBe('Finland');
      expect(tNb('countries.finland')).toBe('Finland');
    });

    it('gymPickerLocationLine includes Finland', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Helsinki', region: 'Suomi', country: 'Finland'},
        t,
      );
      expect(line).toContain('Helsinki');
      expect(line).toContain('Finland');
    });
  });

  // ─── 22. Finnish UI language ──────────────────────────────────────────
  describe('22. Finnish UI language', () => {
    it('Finnish (fi) is NOT yet a supported app language', () => {
      // Document status — Finnish UI not available yet
      const {SUPPORTED_LANGUAGES} = require('../src/i18n/types');
      expect(SUPPORTED_LANGUAGES).not.toContain('fi');
    });
  });

  // ─── 23. Orphan-ID safety ─────────────────────────────────────────────
  describe('23. Orphan-ID safety', () => {
    it('invalid fi_xxx does not resolve to a real gym', () => {
      const resolved = findGymById('fi_nonexistent_xxx');
      expect(resolved).toBeNull();
    });

    it('invalid fi_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('fi_nonexistent_xxx');
      expect(stub.id).toBe('fi_nonexistent_xxx');
      expect(stub.region).toBe('Suomi');
      expect(stub.name).toBe('Unknown gym');
    });

    it('relaxed lookup also returns null for invalid fi_*', () => {
      const resolved = findGymByIdRelaxed('fi_nonexistent_xxx');
      expect(resolved).toBeNull();
    });
  });

  // ─── 24. Staging safety ───────────────────────────────────────────────
  describe('24. Staging safety', () => {
    it('no COMING_SOON in active production', () => {
      const comingSoon = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(comingSoon.length).toBe(27);
      for (const s of comingSoon) {
        const inProd = fiCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });

    it('no CLOSED in active production', () => {
      const closed = staging.filter(s => s.import_category === 'CLOSED');
      expect(closed.length).toBeGreaterThanOrEqual(1);
      for (const s of closed) {
        const inProd = fiCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });

    it('no NEEDS_COORDINATES in production', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      expect(nc.length).toBe(2);
      for (const s of nc) {
        const inProd = fiCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });

    it('no NEEDS_REVIEW in production', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(7);
      for (const s of nr) {
        const inProd = fiCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });
  });

  // ─── 25. Performance ──────────────────────────────────────────────────
  describe('25. Performance', () => {
    it('search index builds in <5000ms for 10050 centers', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      const elapsed = Date.now() - start;
      expect(index.length).toBe(gyms.length);
      expect(elapsed).toBeLessThan(5000);
    });

    it('search query completes in <2000ms', () => {
      const start = Date.now();
      searchGyms('EasyFit Helsinki', {limit: 40});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('nearest gym scan completes in <100ms', () => {
      const start = Date.now();
      findNearestGym(60.17, 24.94, finland);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ─── 26-30. Regression counts ─────────────────────────────────────────
  describe('26-30. Regression counts', () => {
    it('Denmark = 354', () => {
      expect(catalog.filter(c => isDenmarkCountry(c.country)).length).toBe(354);
    });
    it('Sweden = 639', () => {
      expect(catalog.filter(c => isSwedenCountry(c.country)).length).toBe(639);
    });
    it('Norway = 535', () => {
      expect(catalog.filter(c => isNorwayCountry(c.country)).length).toBe(535);
    });
    it('Germany = 1424', () => {
      expect(catalog.filter(c => isGermanyCountry(c.country)).length).toBe(1424);
    });
    it('United Kingdom = 1474', () => {
      expect(catalog.filter(c => isUnitedKingdomCountry(c.country)).length).toBe(1474);
    });
  });

  // ─── 31. Data quality ─────────────────────────────────────────────────
  describe('31. Data quality', () => {
    it('no HTML fragments in Finnish names', () => {
      const htmlRe = /<[a-z\/][^>]*>|&[a-z]+;|&amp;|&#\d+;/i;
      for (const c of fiCenters) {
        expect(c.name).not.toMatch(htmlRe);
      }
    });

    it('no navigation labels or marketing sentences in names', () => {
      const noise = /^(home|menu|navigation|click here|read more|subscribe|cookie|privacy)/i;
      for (const c of fiCenters) {
        expect(c.name).not.toMatch(noise);
      }
    });

    it('no scrape noise — names under 80 chars', () => {
      for (const c of fiCenters) {
        expect(c.name.length).toBeLessThanOrEqual(80);
      }
    });

    it('no trailing/leading whitespace in names', () => {
      for (const c of fiCenters) {
        expect(c.name).toBe(c.name.trim());
      }
    });

    it('no double spaces in names', () => {
      for (const c of fiCenters) {
        expect(c.name).not.toMatch(/  /);
      }
    });
  });
});
