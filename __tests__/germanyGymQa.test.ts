import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms} from '../src/data/danishGyms';
import {
  ALL_GYM_CENTERS,
  findCenterById,
  getActiveCenters,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  isDenmarkCountry,
  isGermanyCountry,
  isNorwayCountry,
  isSwedenCountry,
} from '../src/utils/gymCountry';
import {
  formatGymCountryLabel,
  gymCountryTranslationKey,
  gymPickerLocationLine,
} from '../src/utils/gymCountryLabel';
import {findGymById, findGymByIdRelaxed, formatGymDisplayName} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import {gymSearchMatchesTokens} from '../src/utils/gymSearch';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';

describe('Germany gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const germany = gyms.filter(g => isGermanyCountry(g.country));
  const denmark = gyms.filter(g => isDenmarkCountry(g.country));
  const sweden = gyms.filter(g => isSwedenCountry(g.country));
  const norway = gyms.filter(g => isNorwayCountry(g.country));

  it('loads expected catalog counts', () => {
    expect(catalog.length).toBe(10050);
    expect(catalog.filter(c => isDenmarkCountry(c.country)).length).toBe(354);
    expect(catalog.filter(c => isSwedenCountry(c.country)).length).toBe(639);
    expect(catalog.filter(c => isNorwayCountry(c.country)).length).toBe(535);
    expect(catalog.filter(c => isGermanyCountry(c.country)).length).toBe(1424);
    expect(catalog.filter(c => c.country === 'United Kingdom').length).toBe(1474);

    expect(germany.length).toBe(1424);
    // DK: 354 total, 4 coming-soon excluded from active list
    expect(denmark.length).toBe(350);
    expect(sweden.length).toBe(639);
    expect(norway.length).toBe(535);
  });

  it('has unique IDs and valid Germany rows', () => {
    const ids = catalog.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(germany.every(g => g.id.startsWith('de_'))).toBe(true);
    expect(germany.every(g => g.country === 'Germany')).toBe(true);
    expect(germany.every(g => g.region === 'Tyskland')).toBe(true);
    expect(germany.every(g => g._center.is_active === true)).toBe(true);
    expect(
      germany.every(
        g =>
          Number.isFinite(g.latitude) &&
          Number.isFinite(g.longitude) &&
          !(g.latitude === 0 && g.longitude === 0),
      ),
    ).toBe(true);
  });

  it('preserves German characters without mojibake', () => {
    const blob = germany
      .map(g => [g.name, g.city ?? '', g.address ?? ''].join(' '))
      .join('\n');
    expect(blob).toMatch(/ä/);
    expect(blob).toMatch(/ö/);
    expect(blob).toMatch(/ü/);
    expect(blob).toMatch(/ß/);
    expect(blob).toMatch(/Ä|Ö|Ü/);
    expect(blob).not.toMatch(/Ã¤|Ã¶|Ã¼|ÃŸ|�|\uFFFD/);
    expect(germany.some(g => (g.city ?? '').includes('München'))).toBe(true);
    expect(germany.some(g => (g.city ?? '') === 'Munchen')).toBe(false);
  });

  it('recognizes Germany country helpers', () => {
    expect(isGermanyCountry('Germany')).toBe(true);
    expect(isGermanyCountry('germany')).toBe(true);
    expect(isGermanyCountry('DE')).toBe(true);
    expect(isGermanyCountry('Deutschland')).toBe(true);
    expect(isGermanyCountry('Tyskland')).toBe(true);
    expect(isGermanyCountry('Denmark')).toBe(false);
  });

  it('findGymById resolves de_* ids and never displays the raw id', () => {
    const sample = germany.find(g => g.city === 'München') ?? germany[0]!;
    expect(findGymById(sample.id)?.id).toBe(sample.id);
    expect(findGymByIdRelaxed(sample.id.toUpperCase())?.id).toBe(sample.id);
    const name = formatGymDisplayName(sample);
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/^de_/i);
    expect(name).not.toBe(sample.id);
  });

  it('getEffectiveLatLng never invents Germany coordinates', () => {
    const withCoords = findCenterById(germany[0]!.id)!;
    const real = getEffectiveLatLng(withCoords);
    expect(Number.isFinite(real.lat)).toBe(true);

    const fakeMissing = {
      ...withCoords,
      lat: null,
      lng: null,
    };
    const nan = getEffectiveLatLng(fakeMissing as typeof withCoords);
    expect(Number.isNaN(nan.lat)).toBe(true);
    expect(Number.isNaN(nan.lng)).toBe(true);
    expect(getGymLatLngForCheckIn(withCoords.id)).toEqual({
      latitude: withCoords.lat,
      longitude: withCoords.lng,
    });
  });

  describe('search', () => {
    const brandQueries = [
      'clever fit',
      'McFIT',
      'FitX',
      'all inclusive',
      'EASYFITNESS',
      'Kieser',
      'Fitness First',
      'INJOY',
      'Basic-Fit',
      'JOHN REED',
      'PRIME TIME',
      'VeniceBeach',
      'Pfitzenmeier',
      'ELBGYM',
      'ELEMENTS',
      "Gold's Gym",
    ];

    it.each(brandQueries)('finds German brand query: %s', q => {
      const hits = searchGyms(q, {gyms: germany, limit: 20});
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(h => isGermanyCountry(h.gym.country))).toBe(true);
    });

    it('finds major German cities', () => {
      for (const city of [
        'Berlin',
        'Hamburg',
        'München',
        'Köln',
        'Frankfurt',
        'Düsseldorf',
        'Stuttgart',
        'Leipzig',
        'Dortmund',
        'Hannover',
        'Nürnberg',
      ]) {
        const hits = searchGyms(city, {gyms: germany, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        const re = new RegExp(city.replace(/[äöüÄÖÜ]/g, '.'), 'i');
        expect(
          hits.some(h => re.test(h.gym.city ?? '') || re.test(h.gym.name)),
        ).toBe(true);
      }
    });

    it('matches ASCII queries to official umlaut cities without rewriting stored names', () => {
      const cases: Array<[string, RegExp]> = [
        ['Munchen', /münchen/i],
        ['Koln', /köln/i],
        ['Dusseldorf', /düsseldorf/i],
        ['Nurnberg', /nürnberg/i],
        ['Wurzburg', /würzburg/i],
      ];
      for (const [q, re] of cases) {
        const hits = searchGyms(q, {gyms: germany, limit: 20});
        expect(hits.some(h => re.test(h.gym.city ?? '') || re.test(h.gym.name))).toBe(
          true,
        );
      }
      expect(germany.some(g => (g.city ?? '').includes('München'))).toBe(true);
    });

    it('matches ß street names from ASCII ss queries', () => {
      expect(normalizeGymSearchValue('Straße')).toBe('strasse');
      expect(normalizeGymSearchValue('strasse')).toBe('strasse');
      const hits = searchGyms('Greifswalder Strasse', {gyms: germany, limit: 10});
      expect(
        hits.some(h => /greifswalder straße/i.test(h.gym.address ?? '')),
      ).toBe(true);
    });

    it('strips soft hyphens in all-inclusive names without changing stored text', () => {
      const sample = germany.find(g => /\u00AD/.test(g.name));
      expect(sample).toBeTruthy();
      expect(sample!.name).toMatch(/\u00AD/);
      expect(normalizeGymSearchValue(sample!.name)).not.toMatch(/\u00AD/);
      const hits = searchGyms('DEIN FITNESSSTUDIO IN ACHIM', {gyms: germany, limit: 5});
      expect(hits.some(h => /achim/i.test(h.gym.city ?? '') || /achim/i.test(h.gym.name))).toBe(
        true,
      );
    });

    it('onboarding-style token search finds Munchen and ß addresses', () => {
      const munchenHay = germany
        .filter(g => /münchen/i.test(g.city ?? ''))
        .map(g => [g.name, g.city ?? '', g.region, g.address ?? '', g.brand ?? ''].join(' '));
      expect(munchenHay.some(h => gymSearchMatchesTokens(h, 'Munchen'))).toBe(true);

      const strasseHay = germany
        .filter(g => /straße/i.test(g.address ?? ''))
        .slice(0, 20)
        .map(g => [g.name, g.city ?? '', g.address ?? ''].join(' '));
      expect(strasseHay.some(h => gymSearchMatchesTokens(h, 'strasse'))).toBe(true);
    });
  });

  describe('localization', () => {
    it('localizes Germany via existing i18n keys', () => {
      const tEn = createTranslator(en as unknown as Record<string, unknown>);
      const tDa = createTranslator(da as unknown as Record<string, unknown>);
      expect(gymCountryTranslationKey('Germany')).toBe('countries.germany');
      expect(formatGymCountryLabel('Germany', tEn)).toBe('Germany');
      expect(formatGymCountryLabel('Germany', tDa)).toBe('Tyskland');
      const sample = germany[0]!;
      expect(gymPickerLocationLine(sample, tEn)).toContain('Germany');
      expect(gymPickerLocationLine(sample, tEn)).not.toContain('Tyskland');
      expect(gymPickerLocationLine(sample, tDa)).toContain('Tyskland');
    });
  });

  describe('dense nearby centers vs explicit selection', () => {
    const a = germany.find(g => g.id === 'de_47c99d8554');
    const b = germany.find(g => g.id === 'de_46c4ac4565');

    it('keeps München-Mitte neighbours as separate selectable gyms', () => {
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a!.id).not.toBe(b!.id);
      const d = calculateDistance(a!.latitude, a!.longitude, b!.latitude, b!.longitude);
      expect(d).toBeLessThan(50);
      const selected = a!;
      const nearest = b!;
      const activeGymId = selected.id;
      expect(activeGymId).toBe(a!.id);
      expect(activeGymId).not.toBe(nearest.id);
      expect(findGymById(activeGymId)?.id).toBe(a!.id);
    });

    it('map jitter keeps nearby German pins independently selectable', () => {
      const gymA = a!;
      const gymB = b!;
      const ma = getMarkerMapCoordinate(gymA.id, gymA.latitude, gymA.longitude);
      const mb = getMarkerMapCoordinate(gymB.id, gymB.latitude, gymB.longitude);
      expect(ma.latitude === mb.latitude && ma.longitude === mb.longitude).toBe(false);
    });
  });

  describe('200 m check-in + auto-checkout boundary', () => {
    const gym = germany.find(g => g.city === 'Berlin') ?? germany[0]!;

    function offsetNorth(lat: number, lng: number, meters: number) {
      const dLat = meters / 111_320;
      return {latitude: lat + dLat, longitude: lng};
    }

    it('uses inclusive <= 200 for check-in eligibility', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

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
        const pos = offsetNorth(gym.latitude, gym.longitude, meters);
        const d = calculateDistance(pos.latitude, pos.longitude, gym.latitude, gym.longitude);
        expect(Math.abs(d - meters)).toBeLessThan(2);
        const within = d <= CHECK_IN_RADIUS_METERS;
        expect(within).toBe(allowed);
      }
    });

    it('auto-checkout treats exactly 200 m as inside', () => {
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('check-in distance uses selected German gym coords, not a DK/SE fallback', () => {
      const coords = getGymLatLngForCheckIn(gym.id)!;
      expect(coords.latitude).toBe(gym.latitude);
      expect(coords.longitude).toBe(gym.longitude);
      expect(coords.latitude).not.toBe(59.33);
      expect(coords.longitude).not.toBe(18.07);
      expect(coords.latitude).toBeGreaterThan(47);
      expect(coords.latitude).toBeLessThan(55.2);
    });
  });

  describe('nearest gym', () => {
    it('nearest from a German gym coordinate is a German gym', () => {
      const origin = germany.find(g => g.city === 'Berlin') ?? germany[0]!;
      let best = gyms[0]!;
      let bestD = Infinity;
      for (const g of gyms) {
        const d = calculateDistance(
          origin.latitude,
          origin.longitude,
          g.latitude,
          g.longitude,
        );
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      expect(best.id).toBe(origin.id);
      expect(isGermanyCountry(best.country)).toBe(true);
      expect(best.id.startsWith('de_')).toBe(true);
      expect(bestD).toBe(0);
    });
  });

  describe('map viewport', () => {
    function toMapCenters() {
      return getActiveCenters()
        .filter(
          c =>
            c.lat != null &&
            c.lng != null &&
            Number.isFinite(c.lat) &&
            Number.isFinite(c.lng),
        )
        .map(c => ({
          id: c.id,
          name: c.name,
          latitude: c.lat as number,
          longitude: c.lng as number,
          mapLatitude: c.lat as number,
          mapLongitude: c.lng as number,
          logoUrl: null,
          friendsActiveCount: 0,
          totalActiveCount: 0,
          address: c.address,
          city: c.city,
          brand: c.brand,
          hasExplicitGeocode: true,
          country: c.country,
        }));
    }

    it.each([
      ['Berlin', 52.52, 13.405],
      ['Hamburg', 53.55, 9.99],
      ['München', 48.14, 11.58],
      ['Köln', 50.94, 6.96],
      ['Frankfurt', 50.11, 8.68],
    ] as const)('shows German pins in %s and not DK/SE/NO', (_city, lat, lng) => {
      const visible = filterMapCentersInRegion(toMapCenters() as any, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      });
      expect(visible.some(c => c.id.startsWith('de_'))).toBe(true);
      expect(visible.every(c => c.id.startsWith('de_'))).toBe(true);
    });
  });

  describe('Denmark / Sweden / Norway regression', () => {
    it('still finds Danish, Swedish and Norwegian gyms', () => {
      const dkHits = searchGyms('SATS København', {gyms, limit: 10});
      expect(dkHits.some(h => isDenmarkCountry(h.gym.country))).toBe(true);

      const seHits = searchGyms('Nordic Wellness Stockholm', {gyms, limit: 10});
      expect(seHits.some(h => isSwedenCountry(h.gym.country))).toBe(true);

      const noHits = searchGyms('SATS Oslo', {gyms, limit: 10});
      expect(noHits.some(h => isNorwayCountry(h.gym.country))).toBe(true);
    });

    it('keeps DK/SE/NO active counts unchanged', () => {
      expect(denmark.length).toBe(350);
      expect(sweden.length).toBe(639);
      expect(norway.length).toBe(535);
    });
  });

  describe('performance', () => {
    it('search index and representative queries stay responsive at 4426 centers', () => {
      const t0 = Date.now();
      const index = getGymSearchIndex(gyms);
      const buildMs = Date.now() - t0;
      expect(index.length).toBe(gyms.length);
      expect(buildMs).toBeLessThan(2500);

      const tCache = Date.now();
      const again = getGymSearchIndex(gyms);
      expect(again).toBe(index);
      expect(Date.now() - tCache).toBeLessThan(20);

      const queries = [
        'McFIT',
        'Munchen',
        'Berlin',
        'clever fit',
        'SATS København',
        'Nordic Wellness',
        'Oslo',
        'PureGym London',
      ];
      const t1 = Date.now();
      for (const q of queries) {
        const hits = searchGyms(q, {gyms, limit: 15});
        expect(hits.length).toBeGreaterThan(0);
      }
      const searchMs = Date.now() - t1;
      expect(searchMs).toBeLessThan(8000);
    });
  });
});
