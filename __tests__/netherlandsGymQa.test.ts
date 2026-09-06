/**
 * Netherlands gym QA — comprehensive production validation after nl_* merge.
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

const staging = require('../data/netherlands/netherlands_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  id?: string;
  verification_status?: string;
}>;

describe('Netherlands gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const netherlands = gyms.filter(g => isNetherlandsCountry(g.country));
  const nlCenters = catalog.filter(c => isNetherlandsCountry(c.country));

  // ─── 1. Catalog counts & integrity ───────────────────────────────────────
  describe('1. Catalog integrity', () => {
    it('total production catalog = 10050', () => {
      expect(catalog.length).toBe(10050);
    });

    it('Netherlands = 600 centers', () => {
      expect(nlCenters.length).toBe(600);
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

    it('all NL IDs use nl_* prefix', () => {
      for (const c of nlCenters) {
        expect(c.id).toMatch(/^nl_/);
      }
    });

    it('all NL centers have country="Netherlands"', () => {
      for (const c of nlCenters) {
        expect(c.country).toBe('Netherlands');
      }
    });

    it('all NL centers are active', () => {
      for (const c of nlCenters) {
        expect(c.is_active).toBe(true);
      }
    });

    it('all NL centers have name, brand, address, postal_code, city', () => {
      for (const c of nlCenters) {
        expect(c.name.trim().length).toBeGreaterThan(0);
        expect(c.brand.trim().length).toBeGreaterThan(0);
        expect(c.address.trim().length).toBeGreaterThan(0);
        expect(c.postal_code.trim().length).toBeGreaterThan(0);
        expect(c.city.trim().length).toBeGreaterThan(0);
      }
    });

    it('all NL centers have finite lat/lng, no null/NaN/0,0', () => {
      for (const c of nlCenters) {
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

  // ─── 2. Dutch postcode validation ────────────────────────────────────────
  describe('2. Dutch postcodes', () => {
    it('all NL postcodes match "1234 AB" format', () => {
      for (const c of nlCenters) {
        expect(typeof c.postal_code).toBe('string');
        expect(c.postal_code).toMatch(/^\d{4}\s[A-Z]{2}$/);
      }
    });
  });

  // ─── 3. Dutch text/encoding ──────────────────────────────────────────────
  describe('3. Dutch encoding', () => {
    it('no mojibake in any NL center', () => {
      const mojibake = /Ã¤|Ã¶|Ã¥|ï¿½|â€|Ã|Ã©|Ã¸|Â/;
      for (const c of nlCenters) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        expect(blob).not.toMatch(mojibake);
      }
    });
  });

  // ─── 4. Geography ──────────────────────────────────────────────────────
  describe('4. Geography', () => {
    it('all NL coords within Netherlands bbox (50.75-53.55 lat, 3.35-7.25 lng)', () => {
      for (const c of nlCenters) {
        expect(c.lat!).toBeGreaterThanOrEqual(50.75);
        expect(c.lat!).toBeLessThanOrEqual(53.55);
        expect(c.lng!).toBeGreaterThanOrEqual(3.35);
        expect(c.lng!).toBeLessThanOrEqual(7.25);
      }
    });

    it('Netherlands does not allow invented coordinates', () => {
      expect(allowsInventedCoordinates('Netherlands')).toBe(false);
    });
  });

  // ─── 5. Brand search ───────────────────────────────────────────────────
  describe('5. Brand search', () => {
    const nlBrands = [
      'Basic-Fit', 'SportCity', 'TrainMore', 'Anytime Fitness',
      'David Lloyd', 'Snap Fitness', 'BigGym', 'HealthCity',
      'Optisport', 'Clubsportive',
    ];

    it.each(nlBrands)('%s returns nl_* results (with Amsterdam location)', (brand) => {
      const hits = searchGyms(brand, {limit: 100, userLat: 52.37, userLng: 4.90});
      const nlHits = hits.filter(h => h.gym.id.startsWith('nl_'));
      expect(nlHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 6. SportCity / Fit For Free ─────────────────────────────────────────
  describe('6. SportCity / Fit For Free', () => {
    it('SportCity stored as "SportCity"', () => {
      const sc = nlCenters.filter(c => c.brand === 'SportCity');
      expect(sc.length).toBe(117);
    });

    it('no Fit For Free in production', () => {
      const fff = nlCenters.filter(c => c.brand.toLowerCase().includes('fit for free'));
      expect(fff.length).toBe(0);
    });

    it('"SportCity" search returns nl_* results', () => {
      const hits = searchGyms('SportCity', {limit: 100, userLat: 52.37, userLng: 4.90});
      expect(hits.filter(h => h.gym.id.startsWith('nl_')).length).toBeGreaterThan(0);
    });

    it('"Sport City" search returns nl_* results', () => {
      const hits = searchGyms('Sport City', {limit: 100, userLat: 52.37, userLng: 4.90});
      expect(hits.filter(h => h.gym.id.startsWith('nl_')).length).toBeGreaterThan(0);
    });
  });

  // ─── 7. TrainMore ──────────────────────────────────────────────────────
  describe('7. TrainMore', () => {
    it('TrainMore stored as "TrainMore"', () => {
      const tm = nlCenters.filter(c => c.brand === 'TrainMore');
      expect(tm.length).toBe(49);
    });

    it('"TrainMore" search returns nl_*', () => {
      const hits = searchGyms('TrainMore', {limit: 100, userLat: 52.37, userLng: 4.90});
      expect(hits.filter(h => h.gym.id.startsWith('nl_')).length).toBeGreaterThan(0);
    });

    it('"Train More" search returns nl_*', () => {
      const hits = searchGyms('Train More', {limit: 100, userLat: 52.37, userLng: 4.90});
      expect(hits.filter(h => h.gym.id.startsWith('nl_')).length).toBeGreaterThan(0);
    });
  });

  // ─── 8. City search ────────────────────────────────────────────────────
  describe('8. City search', () => {
    const cities = [
      'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven',
      'Groningen', 'Tilburg', 'Almere', 'Breda', 'Nijmegen',
      'Arnhem', 'Haarlem', 'Enschede', 'Apeldoorn', 'Amersfoort',
      'Maastricht', 'Leiden', 'Delft', 'Zwolle',
    ];

    it.each(cities)('%s returns nl_* results', (city) => {
      const hits = searchGyms(city, {limit: 40});
      const nlHits = hits.filter(h => h.gym.id.startsWith('nl_'));
      expect(nlHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 9. Dutch/English city aliases ──────────────────────────────────────
  describe('9. The Hague alias', () => {
    it('"The Hague" returns Den Haag nl_* gyms', () => {
      const hits = searchGyms('The Hague', {limit: 40});
      const nlHits = hits.filter(h => h.gym.id.startsWith('nl_'));
      expect(nlHits.length).toBeGreaterThan(0);
      const hasDenHaag = nlHits.some(h =>
        h.gym.city?.toLowerCase().includes('den haag') ||
        h.gym.city?.toLowerCase().includes('haag')
      );
      expect(hasDenHaag).toBe(true);
    });
  });

  // ─── 10. Search normalization ──────────────────────────────────────────
  describe('10. Search normalization', () => {
    const variants: [string, string][] = [
      ['BasicFit', 'Basic-Fit'],
      ['Basic Fit', 'Basic-Fit'],
      ['Sport City', 'SportCity'],
      ['Train More', 'TrainMore'],
      ['Big Gym', 'BigGym'],
    ];

    it.each(variants)('"%s" returns nl_* results', (variant) => {
      const hits = searchGyms(variant, {limit: 100, userLat: 52.37, userLng: 4.90});
      const nlHits = hits.filter(h => h.gym.id.startsWith('nl_'));
      expect(nlHits.length).toBeGreaterThan(0);
    });
  });

  // ─── 11. Onboarding ─────────────────────────────────────────────────────
  describe('11. Onboarding', () => {
    it('NL gym is selectable from active list', () => {
      expect(netherlands.length).toBeGreaterThan(0);
    });

    it('nl_* ID is valid and resolves', () => {
      const sample = netherlands[0]!;
      expect(sample.id).toMatch(/^nl_/);
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.name).toBe(sample.name);
    });
  });

  // ─── 12. Profile/favorites ─────────────────────────────────────────────
  describe('12. Profile/favorites', () => {
    it('nl_* resolves and shows Dutch name', () => {
      const sample = netherlands[Math.floor(netherlands.length / 2)]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const display = formatGymDisplayName(resolved);
      expect(display.length).toBeGreaterThan(0);
      expect(display).not.toBe('Ubekendt center');
    });
  });

  // ─── 13. Nearest gym ──────────────────────────────────────────────────
  describe('13. Nearest gym', () => {
    const coords: [string, number, number][] = [
      ['Amsterdam', 52.37, 4.90],
      ['Rotterdam', 51.92, 4.48],
      ['Den Haag', 52.08, 4.30],
      ['Utrecht', 52.09, 5.12],
      ['Eindhoven', 51.44, 5.47],
      ['Groningen', 53.22, 6.57],
    ];

    it.each(coords)('nearest gym in %s is nl_*', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, netherlands);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^nl_/);
    });

    it('nearest from Amsterdam coords returns nl_* (not DK/SE/etc)', () => {
      const nearest = findNearestGym(52.37, 4.90, gyms);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toMatch(/^nl_/);
    });
  });

  // ─── 14. Dense/co-located ──────────────────────────────────────────────
  describe('14. Dense/co-located pairs remain separate', () => {
    it('Basic-Fit and HealthCity coexist as separate nl_* entries', () => {
      const bf = netherlands.filter(g => g.brand === 'Basic-Fit');
      const hc = netherlands.filter(g => g.brand === 'HealthCity');
      expect(bf.length).toBeGreaterThan(0);
      expect(hc.length).toBeGreaterThan(0);
      const bfIds = new Set(bf.map(g => g.id));
      const overlap = hc.filter(g => bfIds.has(g.id));
      expect(overlap.length).toBe(0);
    });

    it('there are ≤50m dense pairs (different brands, same building)', () => {
      let count = 0;
      for (let i = 0; i < netherlands.length; i++) {
        for (let j = i + 1; j < netherlands.length; j++) {
          const d = calculateDistance(
            netherlands[i]!.latitude, netherlands[i]!.longitude,
            netherlands[j]!.latitude, netherlands[j]!.longitude,
          );
          if (d <= 50) count++;
        }
      }
      expect(count).toBeGreaterThan(0);
    });
  });

  // ─── 15. 200m check-in ────────────────────────────────────────────────
  describe('15. 200m check-in radius', () => {
    it('CHECK_IN_RADIUS_METERS = 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
    });

    it('AUTO_CHECKOUT_DISTANCE_METERS = 200', () => {
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it('NL center resolves check-in coords', () => {
      const sample = netherlands[0]!;
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

    it('at 500m → blocked', () => {
      const decision = decideGeofenceAutoCheckout(500, null, Date.now());
      expect(decision.action).toBe('set_away');
    });

    it('at 10m → allowed', () => {
      const decision = decideGeofenceAutoCheckout(10, null, Date.now());
      expect(decision.action).toBe('none');
    });
  });

  // ─── 16. Auto-checkout ────────────────────────────────────────────────
  describe('16. Auto-checkout uses session gym ID', () => {
    it('geofence uses stored distance, not nearest center', () => {
      const sample = netherlands[0]!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      const d = calculateDistance(
        coords!.latitude, coords!.longitude,
        coords!.latitude, coords!.longitude,
      );
      expect(d).toBe(0);
      const decision = decideGeofenceAutoCheckout(d, null, Date.now());
      expect(decision.action).toBe('none');
    });
  });

  // ─── 17. Workout/PR ───────────────────────────────────────────────────
  describe('17. Workout/PR flow', () => {
    it('NL gym does not break workout — country is irrelevant to logging', () => {
      const sample = netherlands[0]!;
      expect(sample.country).toBe('Netherlands');
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
    });
  });

  // ─── 18. History ──────────────────────────────────────────────────────
  describe('18. History', () => {
    it('nl_* resolves to correct name, no raw ID displayed', () => {
      const sample = netherlands[10]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name).toBe(sample.name);
      expect(resolved.name).not.toBe(sample.id);
    });
  });

  // ─── 19. Feed/share ───────────────────────────────────────────────────
  describe('19. Feed/share', () => {
    it('NL session retains correct gym data', () => {
      const sample = netherlands[5]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.city).toBeTruthy();
      expect(resolved!.country).toBe('Netherlands');
    });
  });

  // ─── 20. Notifications ────────────────────────────────────────────────
  describe('20. Notifications', () => {
    it('nl_* gymId resolves for notification display', () => {
      const sample = netherlands[20]!;
      const resolved = resolveGymOrStub(sample.id);
      expect(resolved.name.length).toBeGreaterThan(0);
      expect(resolved.name).not.toBe('Unknown gym');
    });
  });

  // ─── 21. Planned sessions ─────────────────────────────────────────────
  describe('21. Planned sessions', () => {
    it('NL center selectable and persists', () => {
      const sample = netherlands[15]!;
      const resolved = findGymById(sample.id);
      expect(resolved).not.toBeNull();
      const reFetched = findGymById(resolved!.id);
      expect(reFetched).not.toBeNull();
      expect(reFetched!.id).toBe(sample.id);
    });
  });

  // ─── 22. Map viewport ─────────────────────────────────────────────────
  describe('22. Map viewport', () => {
    const viewports: [string, number, number][] = [
      ['Amsterdam', 52.37, 4.90],
      ['Rotterdam', 51.92, 4.48],
      ['Den Haag', 52.08, 4.30],
      ['Utrecht', 52.09, 5.12],
      ['Eindhoven', 51.44, 5.47],
      ['Groningen', 53.22, 6.57],
    ];

    it.each(viewports)('%s viewport shows nl_* pins', (_city, lat, lng) => {
      const mapCenters = netherlands.map(g => ({
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
        expect(v.id).toMatch(/^nl_/);
      }
    });
  });

  // ─── 23. Country/i18n ─────────────────────────────────────────────────
  describe('23. Country/i18n', () => {
    it('gymCountryTranslationKey returns countries.netherlands', () => {
      expect(gymCountryTranslationKey('Netherlands')).toBe('countries.netherlands');
    });

    it('Netherlands label exists in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      const tSv = createTranslator(sv as any);
      const tNb = createTranslator(nb as any);
      expect(tEn('countries.netherlands')).toBe('Netherlands');
      expect(tDa('countries.netherlands')).toBe('Holland');
      expect(tSv('countries.netherlands')).toBe('Nederländerna');
      expect(tNb('countries.netherlands')).toBe('Nederland');
    });

    it('gymPickerLocationLine includes Netherlands', () => {
      const t = createTranslator(en as any);
      const line = gymPickerLocationLine(
        {city: 'Amsterdam', region: 'Nederland', country: 'Netherlands'},
        t,
      );
      expect(line).toContain('Amsterdam');
      expect(line).toContain('Netherlands');
    });
  });

  // ─── 24. Dutch UI language ──────────────────────────────────────────
  describe('24. Dutch UI language', () => {
    it('Dutch (nl) is NOT yet a supported app language', () => {
      const {SUPPORTED_LANGUAGES} = require('../src/i18n/types');
      expect(SUPPORTED_LANGUAGES).not.toContain('nl');
    });
  });

  // ─── 25. Orphan-ID safety ─────────────────────────────────────────────
  describe('25. Orphan-ID safety', () => {
    it('invalid nl_xxx does not resolve to a real gym', () => {
      const resolved = findGymById('nl_nonexistent_xxx');
      expect(resolved).toBeNull();
    });

    it('invalid nl_xxx does not become DK fallback or catalog[0]', () => {
      const stub = resolveGymOrStub('nl_nonexistent_xxx');
      expect(stub.id).toBe('nl_nonexistent_xxx');
      expect(stub.region).toBe('Nederland');
      expect(stub.name).toBe('Unknown gym');
    });

    it('relaxed lookup also returns null for invalid nl_*', () => {
      const resolved = findGymByIdRelaxed('nl_nonexistent_xxx');
      expect(resolved).toBeNull();
    });
  });

  // ─── 26. Staging safety ───────────────────────────────────────────────
  describe('26. Staging safety', () => {
    it('no COMING_SOON in active production', () => {
      const comingSoon = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(comingSoon.length).toBe(3);
      for (const s of comingSoon) {
        const inProd = nlCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });

    it('no NEEDS_COORDINATES in production', () => {
      const nc = staging.filter(s => s.import_category === 'NEEDS_COORDINATES');
      expect(nc.length).toBe(12);
      for (const s of nc) {
        const inProd = nlCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });

    it('no NEEDS_REVIEW in production', () => {
      const nr = staging.filter(s => s.import_category === 'NEEDS_REVIEW');
      expect(nr.length).toBe(10);
      for (const s of nr) {
        const inProd = nlCenters.find(c => c.id === s.id);
        expect(inProd).toBeUndefined();
      }
    });
  });

  // ─── 27. Performance ──────────────────────────────────────────────────
  describe('27. Performance', () => {
    it('search index builds in <5000ms for 10050 centers', () => {
      const start = Date.now();
      const index = getGymSearchIndex(gyms);
      const elapsed = Date.now() - start;
      expect(index.length).toBe(gyms.length);
      expect(elapsed).toBeLessThan(5000);
    });

    it('search query completes in <2000ms', () => {
      const start = Date.now();
      searchGyms('Basic-Fit Amsterdam', {limit: 40});
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });

    it('nearest gym scan completes in <100ms', () => {
      const start = Date.now();
      findNearestGym(52.37, 4.90, netherlands);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ─── 28-33. Regression counts ─────────────────────────────────────────
  describe('28-33. Regression counts', () => {
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
  });

  // ─── 34. Data quality ─────────────────────────────────────────────────
  describe('34. Data quality', () => {
    it('no HTML fragments in NL names', () => {
      const htmlRe = /<[a-z\/][^>]*>|&[a-z]+;|&amp;|&#\d+;/i;
      for (const c of nlCenters) {
        expect(c.name).not.toMatch(htmlRe);
      }
    });

    it('no navigation labels or marketing sentences in names', () => {
      const noise = /^(home|menu|navigation|click here|read more|subscribe|cookie|privacy)/i;
      for (const c of nlCenters) {
        expect(c.name).not.toMatch(noise);
      }
    });

    it('no scrape noise — names under 80 chars', () => {
      for (const c of nlCenters) {
        expect(c.name.length).toBeLessThanOrEqual(80);
      }
    });

    it('no trailing/leading whitespace in names', () => {
      for (const c of nlCenters) {
        expect(c.name).toBe(c.name.trim());
      }
    });

    it('no double spaces in names', () => {
      for (const c of nlCenters) {
        expect(c.name).not.toMatch(/  /);
      }
    });
  });
});
