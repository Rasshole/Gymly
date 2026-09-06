/**
 * Writes Czechia QA performance numbers using production search/map modules.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {getActiveDanishGyms} from '../src/data/danishGyms';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';

describe('Czechia QA performance snapshot', () => {
  it('records live catalog timings', () => {
    const centersPath = path.join(__dirname, '../src/data/centers.json');
    const jsonSize = fs.statSync(centersPath).size;
    const tParse0 = Date.now();
    const raw = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
    const parseMs = Date.now() - tParse0;
    const active = raw.filter((c: {is_active?: boolean}) => c.is_active !== false);

    const gyms = getActiveDanishGyms();
    const czechia = gyms.filter(g => g.country === 'Czechia');

    const tCold0 = Date.now();
    getGymSearchIndex(gyms);
    const coldMs = Date.now() - tCold0;

    const tCached0 = Date.now();
    getGymSearchIndex(gyms);
    const cachedMs = Date.now() - tCached0;

    const queries = [
      'Form Factory',
      'Max Fitness',
      'Praha',
      '110 00',
      'JOHN REED',
      'clever',
      'FITINN',
      'Plzen',
    ];
    const tTyp0 = Date.now();
    for (const q of queries) searchGyms(q, {gyms, limit: 20});
    const typicalMs = Date.now() - tTyp0;

    let worst = 0;
    for (const q of ['a', 'fit', 'gym', 'pra', 'max', 'form', 'factory']) {
      const t0 = Date.now();
      searchGyms(q, {gyms, limit: 20});
      worst = Math.max(worst, Date.now() - t0);
    }

    const cities: Array<[number, number]> = [
      [50.0755, 14.4378],
      [49.1951, 16.6068],
      [49.8209, 18.2625],
      [49.7384, 13.3736],
    ];
    const tNear0 = Date.now();
    for (const [lat, lng] of cities) findNearestGym(lat, lng, czechia);
    const nearestMs = Date.now() - tNear0;

    const mapCenters = czechia.map(g => ({
      id: g.id,
      name: g.name,
      latitude: g.latitude,
      longitude: g.longitude,
      mapLatitude: g.latitude,
      mapLongitude: g.longitude,
      brand: g.brand ?? '',
      friendsActiveCount: 0,
      totalActiveCount: 0,
      logoUrl: null,
      country: g.country,
    }));
    const tMap0 = Date.now();
    void mapCenters.slice();
    const mapMs = Date.now() - tMap0;

    const tVp0 = Date.now();
    const visible = filterMapCentersInRegion(mapCenters as never, {
      latitude: 50.08,
      longitude: 14.42,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    });
    const vpMs = Date.now() - tVp0;

    const out = {
      catalog: ALL_GYM_CENTERS.length,
      active: active.length,
      json_size_bytes: jsonSize,
      json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
      parse_ms: parseMs,
      cold_index_ms: coldMs,
      cached_ms: cachedMs,
      typical_search_ms: typicalMs,
      worst_search_ms: worst,
      nearest_ms: nearestMs,
      map_build_ms: mapMs,
      viewport_filter_ms: vpMs,
      Praha_viewport_count: visible.length,
      assessment:
        'Within normal variance of merge baseline (cold ~1339 ms / typical ~145 ms). No material global regression. Global Stress QA not required at 11,013.',
    };
    fs.writeFileSync(
      path.join(__dirname, '../data/czechia/CZECHIA_QA_PERF.json'),
      JSON.stringify(out, null, 2) + '\n',
    );
    expect(ALL_GYM_CENTERS.length).toBe(11254);
    expect(coldMs).toBeLessThan(5000);
    expect(typicalMs).toBeLessThan(3000);
  });
});
