import type {DanishGym} from '@/data/danishGyms';
import {selectMapCarouselGyms} from '@/utils/mapCarouselGyms';

function gym(id: string): DanishGym {
  return {
    id,
    name: `Gym ${id}`,
    brand: 'Test',
    city: 'København',
    address: 'Test 1',
    latitude: 55.67,
    longitude: 12.57,
    postalCode: '2100',
  };
}

describe('selectMapCarouselGyms', () => {
  it('shows top 5 most active when 5+ active gyms exist', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map(n => ({
      gym: gym(String(n)),
      activeUsersCount: n,
      distanceKm: n,
    }));
    const result = selectMapCarouselGyms(items);
    expect(result.map(g => g.id)).toEqual(['7', '6', '5', '4', '3']);
  });

  it('shows 3 active then 2 nearest inactive', () => {
    const items = [
      {gym: gym('a1'), activeUsersCount: 4, distanceKm: 1},
      {gym: gym('a2'), activeUsersCount: 2, distanceKm: 0.5},
      {gym: gym('a3'), activeUsersCount: 2, distanceKm: 2},
      {gym: gym('i1'), activeUsersCount: 0, distanceKm: 0.2},
      {gym: gym('i2'), activeUsersCount: 0, distanceKm: 0.4},
      {gym: gym('i3'), activeUsersCount: 0, distanceKm: 50},
    ];
    const result = selectMapCarouselGyms(items);
    expect(result.map(g => g.id)).toEqual(['a1', 'a2', 'a3', 'i1', 'i2']);
  });

  it('shows 1 active then 4 nearest inactive', () => {
    const items = [
      {gym: gym('active'), activeUsersCount: 3, distanceKm: 10},
      {gym: gym('near1'), activeUsersCount: 0, distanceKm: 0.1},
      {gym: gym('near2'), activeUsersCount: 0, distanceKm: 0.2},
      {gym: gym('near3'), activeUsersCount: 0, distanceKm: 0.3},
      {gym: gym('near4'), activeUsersCount: 0, distanceKm: 0.4},
      {gym: gym('far'), activeUsersCount: 0, distanceKm: 100},
    ];
    const result = selectMapCarouselGyms(items);
    expect(result.map(g => g.id)).toEqual([
      'active',
      'near1',
      'near2',
      'near3',
      'near4',
    ]);
  });

  it('shows 5 nearest gyms when none are active', () => {
    const items = [
      {gym: gym('far'), activeUsersCount: 0, distanceKm: 50},
      {gym: gym('n1'), activeUsersCount: 0, distanceKm: 1},
      {gym: gym('n2'), activeUsersCount: 0, distanceKm: 2},
      {gym: gym('n3'), activeUsersCount: 0, distanceKm: 3},
      {gym: gym('n4'), activeUsersCount: 0, distanceKm: 4},
      {gym: gym('n5'), activeUsersCount: 0, distanceKm: 5},
    ];
    const result = selectMapCarouselGyms(items);
    expect(result.map(g => g.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('breaks active ties by distance ascending', () => {
    const items = [
      {gym: gym('far-active'), activeUsersCount: 2, distanceKm: 5},
      {gym: gym('near-active'), activeUsersCount: 2, distanceKm: 1},
    ];
    const result = selectMapCarouselGyms(items);
    expect(result.map(g => g.id)).toEqual(['near-active', 'far-active']);
  });
});
