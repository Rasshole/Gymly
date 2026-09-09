import {
  pickBrowseGyms,
  pickGlobalBrowseFallback,
} from '@/utils/pickBrowseGyms';
import {rankNearbyCentres} from '@/utils/nearbyCentersRanking';
import {getActiveGyms} from '@/data/gymCatalog';
import type {DanishGym} from '@/data/danishGyms';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';

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
    const list = pickBrowseGyms({
      gyms: ACTIVE,
      userLocation: {latitude: 55.6761, longitude: 12.5683},
      cap: 30,
    });
    expect(list.length).toBe(30);
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
