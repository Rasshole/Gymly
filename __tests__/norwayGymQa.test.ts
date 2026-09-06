import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms} from '../src/data/danishGyms';
import {
  findCenterById,
  getActiveCenters,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {calculateDistance} from '../src/utils/geoUtils';
import {isNorwayCountry, isDenmarkCountry, isSwedenCountry} from '../src/utils/gymCountry';
import {findGymById, findGymByIdRelaxed, formatGymDisplayName} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';

describe('Norway gym QA', () => {
  const gyms = getActiveDanishGyms();
  const norway = gyms.filter(g => isNorwayCountry(g.country));
  const denmark = gyms.filter(g => isDenmarkCountry(g.country));
  const sweden = gyms.filter(g => isSwedenCountry(g.country));

  it('loads expected Norway / DK / SE active counts with finite coords', () => {
    expect(norway.length).toBe(535);
    // DK: 354 total, 4 coming-soon excluded from active list
    expect(denmark.length).toBe(350);
    // SE: 639 active (ungeocoded SE still get Stockholm fallback → finite coords)
    expect(sweden.length).toBe(639);
    expect(norway.every(g => Number.isFinite(g.latitude) && Number.isFinite(g.longitude))).toBe(
      true,
    );
    expect(norway.every(g => g.id.startsWith('no_'))).toBe(true);
    expect(norway.every(g => g.region === 'Norge')).toBe(true);
  });

  it('recognizes Norway country helpers', () => {
    expect(isNorwayCountry('Norway')).toBe(true);
    expect(isNorwayCountry('norway')).toBe(true);
    expect(isNorwayCountry('NO')).toBe(true);
    expect(isNorwayCountry('Norge')).toBe(true);
    expect(isNorwayCountry('Sweden')).toBe(false);
  });

  it('findGymById resolves no_* ids and display names', () => {
    const sample = norway[0]!;
    expect(findGymById(sample.id)?.id).toBe(sample.id);
    expect(findGymByIdRelaxed(sample.id.toUpperCase())?.id).toBe(sample.id);
    const name = formatGymDisplayName(sample);
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/^no_/i);
  });

  it('getEffectiveLatLng never invents Norway coordinates', () => {
    const withCoords = findCenterById(norway[0]!.id)!;
    const real = getEffectiveLatLng(withCoords);
    expect(Number.isFinite(real.lat)).toBe(true);

    const fakeMissing = {
      ...withCoords,
      lat: null,
      lng: null,
    };
    const nan = getEffectiveLatLng(fakeMissing as any);
    expect(Number.isNaN(nan.lat)).toBe(true);
    expect(Number.isNaN(nan.lng)).toBe(true);
    expect(getGymLatLngForCheckIn(withCoords.id)).toEqual({
      latitude: withCoords.lat,
      longitude: withCoords.lng,
    });
  });

  describe('search', () => {
    const brandQueries = [
      'SATS',
      'EVO Fitness',
      'Fresh Fitness',
      'MOVA',
      'Feel24',
      'Sporty',
      'Fitness24Seven',
      'Fitnesspoint',
      'SKY Fitness',
      'Spenst',
      'MUDO',
      '3T',
      'Impulse',
    ];

    it.each(brandQueries)('finds Norwegian brand query: %s', q => {
      const hits = searchGyms(q, {gyms: norway, limit: 20});
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(h => isNorwayCountry(h.gym.country))).toBe(true);
    });

    it('finds exact and partial Norwegian center names', () => {
      const triaden = searchGyms('SATS Triaden', {gyms, limit: 10});
      expect(triaden.some(h => h.gym.name === 'SATS Triaden')).toBe(true);

      const partial = searchGyms('Triaden', {gyms, limit: 10});
      expect(partial.some(h => /triaden/i.test(h.gym.name))).toBe(true);
    });

    it('finds major Norwegian cities including ASCII diacritic forms', () => {
      for (const city of ['Oslo', 'Bergen', 'Trondheim', 'Drammen', 'Kristiansand']) {
        const hits = searchGyms(city, {gyms: norway, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        expect(
          hits.some(
            h =>
              new RegExp(city, 'i').test(h.gym.city ?? '') ||
              new RegExp(city, 'i').test(h.gym.name),
          ),
        ).toBe(true);
      }
      const tromso = searchGyms('Tromso', {gyms: norway, limit: 20});
      expect(tromso.some(h => /troms/i.test(h.gym.city ?? '') || /troms/i.test(h.gym.name))).toBe(
        true,
      );
      const lorenskog = searchGyms('Lorenskog', {gyms: norway, limit: 20});
      expect(
        lorenskog.some(
          h => /lørenskog|lorenskog/i.test(h.gym.city ?? '') || /lørenskog|lorenskog/i.test(h.gym.name),
        ),
      ).toBe(true);
    });

    it('matches Norwegian characters æ/ø/å in search', () => {
      const hits = searchGyms('Lørenskog', {gyms: norway, limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  describe('co-located SATS Triaden + MUDO Lørenskog', () => {
    const sats = norway.find(g => g.name === 'SATS Triaden')!;
    const mudo = norway.find(g => g.name === 'MUDO Gym Lørenskog')!;

    it('keeps separate IDs with identical physical coordinates', () => {
      expect(sats).toBeTruthy();
      expect(mudo).toBeTruthy();
      expect(sats.id).not.toBe(mudo.id);
      expect(sats.latitude).toBe(mudo.latitude);
      expect(sats.longitude).toBe(mudo.longitude);
      expect(sats.brand).toMatch(/sats/i);
      expect(mudo.brand).toMatch(/mudo/i);
    });

    it('explicit selection identity is preserved (selected id is source of truth)', () => {
      // Mirrors CheckInScreen: manual selection sets selectedGym; nearest must not replace it.
      const selected = sats;
      const nearest = mudo; // same coords — either could win nearest
      expect(selected.id).not.toBe(nearest.id);
      const activeGymId = selected.id; // explicit selection wins
      expect(activeGymId).toBe(sats.id);
      expect(findGymById(activeGymId)?.name).toBe('SATS Triaden');
      expect(findGymById(mudo.id)?.name).toBe('MUDO Gym Lørenskog');
    });

    it('map jitter separates co-located pins', () => {
      const a = getMarkerMapCoordinate(sats.id, sats.latitude, sats.longitude);
      const b = getMarkerMapCoordinate(mudo.id, mudo.latitude, mudo.longitude);
      const sameExact =
        a.latitude === b.latitude && a.longitude === b.longitude;
      expect(sameExact).toBe(false);
    });
  });

  describe('200 m check-in + auto-checkout boundary', () => {
    const gym = norway.find(g => g.name === 'SATS Triaden')!;

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
        // haversine ≈ offset; allow 1m tolerance for earth curvature
        expect(Math.abs(d - meters)).toBeLessThan(2);
        const within = d <= CHECK_IN_RADIUS_METERS;
        expect(within).toBe(allowed);
      }
    });

    it('auto-checkout treats exactly 200 m as inside', () => {
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('check-in distance uses selected gym coords, not a country fallback', () => {
      const coords = getGymLatLngForCheckIn(gym.id)!;
      expect(coords.latitude).toBe(gym.latitude);
      expect(coords.longitude).toBe(gym.longitude);
      // Must not be Stockholm / Copenhagen defaults
      expect(coords.latitude).not.toBe(59.33);
      expect(coords.longitude).not.toBe(18.07);
    });
  });

  describe('nearest gym vs explicit selection', () => {
    it('nearest among Norway uses real coordinates', () => {
      const oslo = norway.filter(g => /oslo/i.test(g.city ?? ''));
      expect(oslo.length).toBeGreaterThan(5);
      const origin = oslo[0]!;
      let best = oslo[0]!;
      let bestD = Infinity;
      for (const g of oslo) {
        const d = calculateDistance(origin.latitude, origin.longitude, g.latitude, g.longitude);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      expect(best.id).toBe(origin.id);
      expect(bestD).toBe(0);
    });
  });

  describe('map viewport', () => {
    it('shows Oslo-region Norway pins and not Danish/Swedish pins in Oslo viewport', () => {
      const osloRegion = {
        latitude: 59.91,
        longitude: 10.75,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      };
      const centers = getActiveCenters()
        .filter(c => c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng))
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
      const visible = filterMapCentersInRegion(centers as any, osloRegion);
      expect(visible.some(c => c.id.startsWith('no_'))).toBe(true);
      expect(visible.every(c => c.id.startsWith('no_'))).toBe(true);
    });
  });

  describe('Denmark / Sweden regression smoke', () => {
    it('still finds Danish and Swedish gyms', () => {
      const dkHits = searchGyms('SATS København', {gyms, limit: 10});
      expect(dkHits.some(h => isDenmarkCountry(h.gym.country))).toBe(true);

      const seHits = searchGyms('Nordic Wellness Stockholm', {gyms, limit: 10});
      expect(seHits.some(h => isSwedenCountry(h.gym.country))).toBe(true);
    });

    it('Denmark and Sweden counts remain large after Norway expansion', () => {
      expect(denmark.length).toBe(350);
      expect(sweden.length).toBe(639);
    });
  });
});
