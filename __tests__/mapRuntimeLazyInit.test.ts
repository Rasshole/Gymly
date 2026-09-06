import {getMapRuntime, resetMapRuntimeForTests} from '@/data/mapRuntime';
import {buildMapCenterSpatialIndex} from '@/utils/mapCenterSpatialIndex';

jest.mock('@/data/danishGyms', () => ({
  getActiveDanishGyms: jest.fn(() => [{id: 'g1', latitude: 55, longitude: 12, _center: {}}]),
}));

jest.mock('@/data/mapCentersData', () => ({
  getBaseMapCenters: jest.fn(() => [
    {
      id: 'g1',
      latitude: 55,
      longitude: 12,
      mapLatitude: 55,
      mapLongitude: 12,
    },
  ]),
}));

describe('mapRuntime lazy init', () => {
  beforeEach(() => {
    resetMapRuntimeForTests();
    jest.clearAllMocks();
  });

  it('builds spatial index only when getMapRuntime is called', () => {
    const buildSpy = jest.spyOn(
      require('@/utils/mapCenterSpatialIndex'),
      'buildMapCenterSpatialIndex',
    );

    expect(buildSpy).not.toHaveBeenCalled();

    const runtime = getMapRuntime();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(runtime.gyms).toHaveLength(1);
    expect(runtime.gymById.get('g1')).toBeDefined();
    expect(runtime.baseCenters).toHaveLength(1);
    expect(runtime.centerIndex.buckets.size).toBeGreaterThan(0);

    getMapRuntime();
    expect(buildSpy).toHaveBeenCalledTimes(1);

    buildSpy.mockRestore();
  });

  it('returns a stable singleton across calls', () => {
    const a = getMapRuntime();
    const b = getMapRuntime();
    expect(a).toBe(b);
  });
});

describe('buildMapCenterSpatialIndex (direct)', () => {
  it('indexes centers without infinite loop', () => {
    const centers = Array.from({length: 100}, (_, i) => ({
      id: `c${i}`,
      latitude: 50 + i * 0.01,
      longitude: 10 + i * 0.01,
      mapLatitude: 50 + i * 0.01,
      mapLongitude: 10 + i * 0.01,
    }));
    const index = buildMapCenterSpatialIndex(centers);
    expect(index.buckets.size).toBeGreaterThan(0);
  });
});
