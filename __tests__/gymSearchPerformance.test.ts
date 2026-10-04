/**
 * @jest-environment node
 *
 * Gym search stays fast on the full catalog and does not load centers.json
 * from the app startup graph.
 */

import fs from 'fs';
import path from 'path';
import {performance} from 'perf_hooks';
import {getActiveDanishGyms} from '@/data/danishGyms';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';
import {
  clearGymSearchIndexCache,
  getGymSearchIndex,
  getGymSearchWordIndex,
} from '@/services/gymSearch/gymSearchIndex';

const ROOT = path.join(__dirname, '..');

function warmMs(query: string, gyms: ReturnType<typeof getActiveDanishGyms>): number {
  searchGyms(query, {gyms, limit: 40});
  const t0 = performance.now();
  searchGyms(query, {gyms, limit: 40});
  return performance.now() - t0;
}

describe('gym search performance', () => {
  const gyms = getActiveDanishGyms();

  beforeAll(() => {
    clearGymSearchIndexCache();
  });

  it('builds one folded index for every active center', () => {
    const t0 = performance.now();
    const index = getGymSearchIndex(gyms);
    const buildMs = performance.now() - t0;
    const ids = gyms.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(index).toHaveLength(gyms.length);
    expect(gyms.length).toBeGreaterThan(13000);
    expect(buildMs).toBeLessThan(2000);
    expect(getGymSearchWordIndex(gyms).size).toBeGreaterThan(1000);
    expect(getGymSearchWordIndex(gyms).size).toBeLessThan(400000);
  });

  it('answers representative queries without a full-catalog rescan cost', () => {
    const cases: Array<[string, number]> = [
      ['', 120],
      ['s', 80],
      ['sats', 40],
      ['puregym ballerup', 20],
      ['energii', 20],
      ['Copenhagen', 20],
      ['København', 20],
      ['Kobenhavn', 20],
      ['Stockholm', 20],
      ['Oslo', 20],
      ['Berlin', 20],
      ['zzzznotagym', 80],
    ];
    for (const [query, maxMs] of cases) {
      const ms = warmMs(query, gyms);
      const hits = searchGyms(query, {gyms, limit: 40});
      expect(ms).toBeLessThan(maxMs);
      expect(hits.length).toBeLessThanOrEqual(40);
      if (query === 'zzzznotagym') {
        expect(hits).toHaveLength(0);
      } else if (query !== '' && query !== 's') {
        expect(hits.length).toBeGreaterThan(0);
      }
    }
    const ballerup = searchGyms('puregym ballerup', {gyms, limit: 5});
    expect(ballerup[0]?.gym.name.toLowerCase()).toContain('puregym');
    expect(ballerup[0]?.gym.city?.toLowerCase()).toContain('ballerup');
    const ascii = searchGyms('Kobenhavn', {gyms, limit: 8}).map(h => h.gym.city ?? '');
    expect(ascii.some(city => /københavn|copenhagen/i.test(city))).toBe(true);
  });

  it('can find a spread of catalog centers by their own names', () => {
    for (let i = 0; i < gyms.length; i += 700) {
      const gym = gyms[i];
      const query = [gym.name, gym.city].filter(Boolean).join(' ');
      const hits = searchGyms(query, {gyms, limit: 20});
      if (!hits.some(h => h.gym.id === gym.id)) {
        throw new Error(
          `miss i=${i} id=${gym.id} q=${query} top=${hits
            .slice(0, 3)
            .map(h => `${h.gym.id}:${h.gym.name}`)
            .join(' | ')}`,
        );
      }
    }
  });

  it('keeps centers.json off the startup import graph', () => {
    const files = [
      'App.tsx',
      'index.js',
      'src/i18n/LanguageContext.tsx',
      'src/navigation/RootNavigator.tsx',
      'src/store/appStore.ts',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(/from ['"]@\/data\/centers\.json['"]/);
      expect(src).not.toMatch(/from ['"]@\/data\/danishGyms['"]/);
      expect(src).not.toMatch(/gymSearchEngine|gymSearchIndex/);
    }
  });
});
