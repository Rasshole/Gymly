import {
  pickBrowseGyms,
  pickGlobalBrowseFallback,
  pickPreferredCountryBrowse,
} from '@/utils/pickBrowseGyms';
import {browseCountryForLanguage} from '@/utils/languageBrowseCountry';
import {rankNearbyCentres} from '@/utils/nearbyCentersRanking';
import {getActiveGyms} from '@/data/gymCatalog';
import type {DanishGym} from '@/data/danishGyms';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';
import {calculateDistance} from '@/utils/geoUtils';
import {findNearestGym} from '@/utils/nearestGym';

const ACTIVE = getActiveGyms();

describe('pickBrowseGyms', () => {
  it('returns non-empty global sample when location unknown (not Denmark-only)', () => {
    const list = pickBrowseGyms({gyms: ACTIVE, userLocation: null, cap: 49});
    expect(list.length).toBe(49);
    const countries = new Set(list.map(g => g.country));
    expect(countries.size).toBeGreaterThan(1);
    expect(list.every(g => g.country === 'Denmark')).toBe(false);
    // Not the catalog-order Denmark prefix
    expect(list.map(g => g.id)).not.toEqual(ACTIVE.slice(0, 49).map(g => g.id));
  });

  it('does not return catalog-order Denmark prefix at Berlin coords', () => {
    const list = pickBrowseGyms({
      gyms: ACTIVE,
      userLocation: {latitude: 52.52, longitude: 13.41},
      cap: 25,
    });
    expect(list.length).toBe(25);
    expect(list.some(g => g.country === 'Germany')).toBe(true);
    expect(list.every(g => g.country === 'Denmark')).toBe(false);
  });

  it('with location still returns nearest-first non-empty browse', () => {
    const loc = {latitude: 55.6761, longitude: 12.5683};
    const list = pickBrowseGyms({
      gyms: ACTIVE,
      userLocation: loc,
      cap: 30,
    });
    expect(list.length).toBe(30);
    const nearest = findNearestGym(loc.latitude, loc.longitude, ACTIVE);
    expect(list[0]?.id).toBe(nearest?.id);
    for (let i = 1; i < list.length; i++) {
      const prev = calculateDistance(
        loc.latitude,
        loc.longitude,
        list[i - 1].latitude,
        list[i - 1].longitude,
      );
      const next = calculateDistance(
        loc.latitude,
        loc.longitude,
        list[i].latitude,
        list[i].longitude,
      );
      expect(next).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe('preferred country suggestions', () => {
  it('maps Danish to Denmark and leaves English unmapped', () => {
    expect(browseCountryForLanguage('da')).toBe('Denmark');
    expect(browseCountryForLanguage('sv')).toBe('Sweden');
    expect(browseCountryForLanguage('en')).toBeNull();
  });

  it('without location, Danish suggestions are Danish and spread across cities', () => {
    const list = pickBrowseGyms({
      gyms: ACTIVE,
      userLocation: null,
      cap: 4,
      preferredCountry: 'Denmark',
    });
    expect(list).toHaveLength(4);
    expect(list.every(g => g.country === 'Denmark')).toBe(true);
    const cities = list.map(g => g.city ?? '');
    expect(new Set(cities).size).toBe(4);
    expect(cities.some(city => city.startsWith('København'))).toBe(true);
    expect(cities.some(city => city.startsWith('Aarhus'))).toBe(true);
  });

  it('location still ranks by distance when a preferred country is set', () => {
    const loc = {latitude: 52.52, longitude: 13.41};
    const list = pickBrowseGyms({
      gyms: ACTIVE,
      userLocation: loc,
      cap: 8,
      preferredCountry: 'Denmark',
    });
    expect(list.some(g => g.country === 'Germany')).toBe(true);
    expect(list.every(g => g.country === 'Denmark')).toBe(false);
  });

  it('fills from the global sample when the preferred country is too small', () => {
    const gym = (
      id: string,
      country: string,
      city: string,
    ): DanishGym => ({
      id,
      name: id,
      city,
      address: 'Street 1',
      postalCode: '1000',
      country,
      region: '',
      latitude: 55,
      longitude: 12,
      brand: 'Test',
    } as DanishGym);
    const list = pickPreferredCountryBrowse(
      [
        gym('li', 'Liechtenstein', 'Vaduz'),
        gym('dk', 'Denmark', 'København'),
        gym('se', 'Sweden', 'Stockholm'),
        gym('no', 'Norway', 'Oslo'),
      ],
      'Liechtenstein',
      new Set(),
      4,
    );
    expect(list.map(g => g.id)).toEqual(['li', 'dk', 'no', 'se']);
  });
});

describe('pickGlobalBrowseFallback', () => {
  it('round-robins countries and respects exclude + cap', () => {
    const exclude = new Set([ACTIVE[0]!.id]);
    const list = pickGlobalBrowseFallback(ACTIVE, exclude, 20);
    expect(list.length).toBe(20);
    expect(list.every(g => g.id !== ACTIVE[0]!.id)).toBe(true);
    expect(new Set(list.map(g => g.country)).size).toBeGreaterThan(1);
  });
});

describe('Edit Home Gyms search remains global', () => {
  it.each(['Berlin', 'Stockholm', 'London', 'Moscow'] as const)(
    'search resolves %s',
    q => {
      const hits = searchGyms(q, {gyms: ACTIVE, limit: 10});
      expect(hits.length).toBeGreaterThan(0);
    },
  );
});

describe('rankNearbyCentres browse regression', () => {
  function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  it('includes Swedish gyms in top cap from Copenhagen when within ranking pool', () => {
    const ranked = rankNearbyCentres({
      gyms: ACTIVE,
      excludeIds: new Set<string>(),
      userLocation: {latitude: 55.6761, longitude: 12.5683},
      getGymStatus: () => ({isOpen: true}),
      liveByGymId: new Map(),
      getActiveUsersCount: () => 0,
      calculateDistanceMeters: distanceMeters,
      cap: 300,
    });
    const countries = new Set(ranked.map((g: DanishGym) => g.country));
    expect(countries.has('Denmark')).toBe(true);
    expect(countries.has('Sweden')).toBe(true);
  });
});
