import {rankNearbyCentres, NEARBY_CENTRES_LIST_CAP} from '@/utils/nearbyCentersRanking';
import type {DanishGym} from '@/data/danishGyms';

function gym(id: string, lat: number, lng: number): DanishGym {
  return {
    id,
    name: id,
    country: 'Denmark',
    region: 'København',
    latitude: lat,
    longitude: lng,
    _center: {
      id,
      name: id,
      brand: 'Test',
      address: '',
      postal_code: '1000',
      city: 'København',
      country: 'Denmark',
      lat,
      lng,
      is_active: true,
    },
  };
}

describe('rankNearbyCentres', () => {
  it('caps list length and excludes favorites', () => {
    const gyms = Array.from({length: 300}, (_, i) =>
      gym(`g${i}`, 55.67 + i * 0.0001, 12.56),
    );
    const result = rankNearbyCentres({
      gyms,
      excludeIds: new Set(['g0']),
      userLocation: {latitude: 55.6761, longitude: 12.5683},
      getGymStatus: () => ({isOpen: true}),
      liveByGymId: new Map(),
      getActiveUsersCount: () => 0,
      calculateDistanceMeters: () => 100,
      cap: 50,
    });
    expect(result).toHaveLength(50);
    expect(result.some(g => g.id === 'g0')).toBe(false);
  });

  it('defaults to NEARBY_CENTRES_LIST_CAP', () => {
    const gyms = Array.from({length: NEARBY_CENTRES_LIST_CAP + 50}, (_, i) =>
      gym(`g${i}`, 55.67, 12.56),
    );
    const result = rankNearbyCentres({
      gyms,
      excludeIds: new Set(),
      userLocation: null,
      getGymStatus: () => ({isOpen: true}),
      liveByGymId: new Map(),
      getActiveUsersCount: () => 0,
      calculateDistanceMeters: () => 0,
    });
    expect(result).toHaveLength(NEARBY_CENTRES_LIST_CAP);
  });
});
