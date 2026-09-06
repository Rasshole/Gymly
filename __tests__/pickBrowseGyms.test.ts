import {pickBrowseGyms} from '@/utils/pickBrowseGyms';
import {rankNearbyCentres} from '@/utils/nearbyCentersRanking';
import {getActiveGyms} from '@/data/gymCatalog';
import type {DanishGym} from '@/data/danishGyms';

const ACTIVE = getActiveGyms();

describe('pickBrowseGyms', () => {
  it('returns empty when location unknown (forces search)', () => {
    expect(pickBrowseGyms({gyms: ACTIVE, userLocation: null})).toEqual([]);
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
