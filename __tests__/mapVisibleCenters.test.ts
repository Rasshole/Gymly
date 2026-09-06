import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import type {MapCenter} from '../src/data/mapCentersData';

const stockholm: MapCenter = {
  id: 'se_test',
  name: 'Test Stockholm',
  latitude: 59.33,
  longitude: 18.07,
  mapLatitude: 59.33,
  mapLongitude: 18.07,
  logoUrl: null,
  friendsActiveCount: 0,
  totalActiveCount: 0,
  address: 'Test',
  city: 'Stockholm',
  brand: 'Test',
  hasExplicitGeocode: true,
};

const copenhagen: MapCenter = {
  ...stockholm,
  id: 'dk_test',
  name: 'Test Copenhagen',
  latitude: 55.68,
  longitude: 12.57,
  mapLatitude: 55.68,
  mapLongitude: 12.57,
  city: 'København',
};

describe('filterMapCentersInRegion', () => {
  it('shows Swedish center when map is over Stockholm', () => {
    const visible = filterMapCentersInRegion([stockholm, copenhagen], {
      latitude: 59.33,
      longitude: 18.07,
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    });
    expect(visible.map(c => c.id)).toContain('se_test');
    expect(visible.map(c => c.id)).not.toContain('dk_test');
  });
});
