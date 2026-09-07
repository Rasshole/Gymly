/**
 * Onboarding-oriented forgiving gym search: normalisation, Danish diacritics,
 * compact brands, ranking determinism. Does not mutate centres.json.
 */

import {getActiveDanishGyms} from '@/data/danishGyms';
import {searchGyms} from '@/services/gymSearch/gymSearchEngine';
import {clearGymSearchIndexCache} from '@/services/gymSearch/gymSearchIndex';
import {
  compactGymSearchFolded,
  compactGymSearchValue,
  foldNordicSearchEquivalents,
  normalizeGymSearchValue,
  tokenizeGymQuery,
} from '@/services/gymSearch/gymSearchNormalize';

beforeAll(() => {
  clearGymSearchIndexCache();
});

const gyms = getActiveDanishGyms();

function topNames(query: string, limit = 8): string[] {
  return searchGyms(query, {gyms, limit}).map(h => h.gym.name);
}

function topIds(query: string, limit = 8): string[] {
  return searchGyms(query, {gyms, limit}).map(h => h.gym.id);
}

describe('gym search normalisation (forgiving onboarding)', () => {
  it('lowercases and strips punctuation/whitespace consistently', () => {
    expect(normalizeGymSearchValue('  Fitness-X,  Nørrebro. ')).toBe(
      'fitness x noerrebro',
    );
    expect(compactGymSearchValue('Fitness X')).toBe('fitnessx');
    expect(compactGymSearchValue('FitnessX')).toBe('fitnessx');
  });

  it('folds Danish digraphs so ae/oe/aa match a/o/a forms', () => {
    expect(foldNordicSearchEquivalents('noerrebro')).toBe('norrebro');
    expect(foldNordicSearchEquivalents('norrebro')).toBe('norrebro');
    expect(foldNordicSearchEquivalents('vanloese')).toBe('vanlose');
    expect(foldNordicSearchEquivalents('vanlose')).toBe('vanlose');
    expect(compactGymSearchFolded('Nørrebro')).toBe(
      compactGymSearchFolded('norrebro'),
    );
    expect(tokenizeGymQuery('FITNESS X NORREBRO')).toEqual([
      'fitness',
      'x',
      'norrebro',
    ]);
  });
});

describe('gym search matching examples', () => {
  it('matches Fitness X Nørrebrogade case-insensitively and with ASCII ø', () => {
    for (const q of [
      'fitness x norrebro',
      'FITNESSX NØRREBRO',
      'nørrebro fitnessx',
      'norrebro fitnessx',
    ]) {
      const ids = topIds(q, 12);
      expect(ids.some(id => id.includes('noerrebrogade'))).toBe(true);
    }
  });

  it('matches compact brand+area without spaces', () => {
    const ids = topIds('fitnessxnorrebro', 12);
    expect(ids.some(id => id.includes('noerrebrogade'))).toBe(true);
  });

  it('matches street-only queries like norrebrogade', () => {
    const names = topNames('norrebrogade', 10);
    expect(names.some(n => /nørrebrogade/i.test(n))).toBe(true);
  });

  it('matches sats vanlose via ø→o folding when both tokens apply', () => {
    // Catalogue has Vanløse PureGym/LOOP/ARCA but no SATS Vanløse — both tokens must match.
    const satsVanlose = searchGyms('sats vanlose', {gyms, limit: 20});
    expect(satsVanlose).toHaveLength(0);

    const vanlose = searchGyms('vanlose', {gyms, limit: 10});
    expect(
      vanlose.some(h =>
        /vanløse|vanlose|vanloese/i.test(
          `${h.gym.name} ${h.gym.city} ${h.gym.address}`,
        ),
      ),
    ).toBe(true);

    expect(foldNordicSearchEquivalents(normalizeGymSearchValue('Vanløse'))).toBe(
      foldNordicSearchEquivalents(normalizeGymSearchValue('vanlose')),
    );

    const pureVanlose = topIds('puregym vanlose', 5);
    expect(pureVanlose[0]).toMatch(/vanloese|vanlose/i);
  });

  it('treats pure gym valby and puregym valby as equivalent top result', () => {
    const a = topIds('pure gym valby', 5);
    const b = topIds('puregym valby', 5);
    expect(a[0]).toBe(b[0]);
    expect(a[0]).toMatch(/valby|mosedal/i);
  });

  it('returns city/district relevant gyms for broad place queries', () => {
    const hits = searchGyms('valby', {gyms, limit: 15});
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.some(h => /valby/i.test(`${h.gym.name} ${h.gym.city} ${h.gym.address}`)),
    ).toBe(true);
  });

  it('allows minor typos with reasonable confidence', () => {
    const hits = searchGyms('puregym valbi', {gyms, limit: 10});
    expect(
      hits.some(h => /valby/i.test(`${h.gym.name} ${h.gym.city} ${h.gym.address}`)),
    ).toBe(true);
  });

  it('excludes irrelevant fuzzy noise for unrelated queries', () => {
    const hits = searchGyms('zzzznotagym999', {gyms, limit: 10});
    expect(hits.length).toBe(0);
  });

  it('empty query preserves browse behaviour without text scoring filter', () => {
    const empty = searchGyms('', {gyms, limit: 12});
    expect(empty.length).toBe(12);
    // Onboarding UI uses popular list when empty; engine empty path is distance/fav browse.
    expect(empty.every(h => h.gym.id)).toBe(true);
  });

  it('ranking is deterministic for the same query', () => {
    const a = topIds('fitness x norrebro', 10);
    const b = topIds('fitness x norrebro', 10);
    expect(a).toEqual(b);
  });

  it('does not apply a 150 km hard cutoff during active search', () => {
    // Copenhagen-ish coords; PureGym Valby and distant Aarhus Fitness X must both be findable by text.
    const cph = {userLat: 55.6761, userLng: 12.5683};
    const valby = searchGyms('puregym valby', {gyms, limit: 5, ...cph});
    const aarhusStreet = searchGyms('norrebrogade', {gyms, limit: 10, ...cph});
    expect(valby.length).toBeGreaterThan(0);
    expect(aarhusStreet.some(h => /nørrebrogade/i.test(h.gym.name + h.gym.address))).toBe(
      true,
    );
    // No hit is discarded solely for distance — Aarhus result can appear despite >>150km.
    const aarhusHit = aarhusStreet.find(h => /aarhus/i.test(h.gym.city + h.gym.name));
    expect(aarhusHit).toBeTruthy();
    if (aarhusHit?.distanceM != null) {
      expect(aarhusHit.distanceM).toBeGreaterThan(150_000);
    }
  });
});
