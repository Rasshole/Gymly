/**
 * Synthetic catalog scale bench — never writes to centers.json.
 *
 * Run: npm run bench:catalog
 * Not part of default `npm test`.
 */
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {getActiveGyms, type DanishGym} from '../src/data/danishGyms';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import type {MapCenter} from '../src/data/mapCentersData';
import type {GymCenter} from '../src/types/center.types';

function nowMs(): number {
  return Date.now();
}

function cloneToSize(base: DanishGym[], target: number): DanishGym[] {
  if (target <= base.length) {
    return base.slice(0, target);
  }
  const out: DanishGym[] = base.slice();
  let i = 0;
  while (out.length < target) {
    const src = base[i % base.length]!;
    const n = out.length;
    const jitter = ((n % 97) - 48) * 0.002;
    out.push({
      ...src,
      id: `syn_${n}`,
      name: `${src.name} ${n}`,
      latitude: src.latitude + jitter,
      longitude: src.longitude + jitter * 0.6,
      _center: {
        ...src._center,
        id: `syn_${n}`,
        lat: src.latitude + jitter,
        lng: src.longitude + jitter * 0.6,
      },
    });
    i += 1;
  }
  return out;
}

function toMapCenters(gyms: DanishGym[]): MapCenter[] {
  return gyms.map(gym => {
    const map = getMarkerMapCoordinate(gym.id, gym.latitude, gym.longitude);
    return {
      id: gym.id,
      name: gym.name,
      latitude: gym.latitude,
      longitude: gym.longitude,
      mapLatitude: map.latitude,
      mapLongitude: map.longitude,
      logoUrl: null,
      friendsActiveCount: 0,
      totalActiveCount: 0,
      address: gym.address,
      city: gym.city,
      brand: gym.brand,
      hasExplicitGeocode: true,
    };
  });
}

function measure(label: string, fn: () => void): number {
  const t0 = nowMs();
  fn();
  return nowMs() - t0;
}

describe('gym catalog scale benchmark (synthetic, not CI-gated)', () => {
  it('prints timings for live catalog / 5k / 10k / 25k', () => {
    const live = getActiveGyms();
    const raw = ALL_GYM_CENTERS as GymCenter[];
    const liveCount = raw.length;

    const parseLive = measure('parse-live-already-imported', () => {
      expect(liveCount).toBeGreaterThanOrEqual(2952);
      expect(live.length).toBeGreaterThan(0);
    });

    const sizes = [...new Set([
      liveCount,
      5000, 6000, 7500, 8000, 9000,
      10000, 10300, 10500, 10525, 10550, 10772, 10775, 10800,
      11000, 11025, 11050, 11275, 11500, 11525, 11550,
      12000, 12025, 12050, 12500, 12525, 13000,
      15000, 20000, 25000, 50000,
    ])].sort((a, b) => a - b);
    const rows: Array<Record<string, number | string>> = [];

    for (const size of sizes) {
      const gyms = cloneToSize(live, size);
      const payload = JSON.stringify(
        gyms.map(g => ({
          id: g.id,
          name: g.name,
          brand: g.brand,
          address: g.address,
          postal_code: g.postalCode,
          city: g.city,
          country: g.country,
          lat: g.latitude,
          lng: g.longitude,
          is_active: true,
        })),
      );

      const parseMs = measure(`parse-${size}`, () => {
        JSON.parse(payload);
      });

      const indexMs = measure(`index-${size}`, () => {
        getGymSearchIndex(gyms);
      });
      const indexCachedMs = measure(`index-cached-${size}`, () => {
        getGymSearchIndex(gyms);
      });

      const typicalMs = measure(`search-typical-${size}`, () => {
        searchGyms('McFIT Berlin', {gyms, limit: 20});
        searchGyms('SATS', {gyms, limit: 20});
        searchGyms('PureGym London', {gyms, limit: 20});
      });

      const worstMs = measure(`search-worst-${size}`, () => {
        searchGyms('fitness', {gyms, limit: 20});
        searchGyms('a', {gyms, limit: 20});
      });

      const origin = gyms[Math.floor(gyms.length / 2)]!;
      const nearestMs = measure(`nearest-${size}`, () => {
        findNearestGym(origin.latitude, origin.longitude, gyms);
      });

      const mapCenters = toMapCenters(gyms);
      const mapBuildMs = measure(`map-build-${size}`, () => {
        toMapCenters(gyms);
      });
      const berlin = {
        latitude: 52.52,
        longitude: 13.405,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      };
      const mapFilterMs = measure(`map-filter-${size}`, () => {
        filterMapCentersInRegion(mapCenters, berlin);
      });

      rows.push({
        size,
        jsonBytes: payload.length,
        parseMs,
        indexMs,
        indexCachedMs,
        typicalSearch3qMs: typicalMs,
        worstSearch2qMs: worstMs,
        nearestMs,
        mapBuildMs,
        mapFilterMs,
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          liveCatalog: raw.length,
          liveActive: live.length,
          parseLiveImportedMs: parseLive,
          rows,
        },
        null,
        2,
      ),
    );

    expect(rows.length).toBe(sizes.length);
  });
});
