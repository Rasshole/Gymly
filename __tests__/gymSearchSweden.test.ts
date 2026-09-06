import {getActiveDanishGyms} from '../src/data/danishGyms';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';

describe('Swedish gym search', () => {
  const gyms = getActiveDanishGyms();
  const sweden = gyms.filter(g => g.country === 'Sweden');

  it('includes Swedish centers in active list', () => {
    expect(sweden.length).toBeGreaterThan(300);
  });

  it('finds Nordic Wellness Stockholm gyms', () => {
    const hits = searchGyms('Nordic Wellness Stockholm', {gyms, limit: 20});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => /stockholm/i.test(h.gym.name) || h.gym.region === 'Stockholm')).toBe(
      true,
    );
  });

  it('finds SATS Stockholm', () => {
    const hits = searchGyms('SATS Stockholm', {gyms, limit: 10});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.gym.brand).toMatch(/sats/i);
  });

  it('matches without Swedish diacritics', () => {
    const hits = searchGyms('Goteborg Nordic', {gyms, limit: 10});
    expect(hits.some(h => /göteborg|goteborg/i.test(h.gym.name + h.gym.city))).toBe(true);
  });

  it('finds STC Stockholm gyms', () => {
    const hits = searchGyms('STC Stockholm', {gyms, limit: 20});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.gym.brand === 'STC')).toBe(true);
    expect(
      hits.some(h => /stockholm/i.test(h.gym.name) || h.gym.region === 'Stockholm'),
    ).toBe(true);
  });

  it('finds STC Göteborg gyms', () => {
    const hits = searchGyms('STC Goteborg', {gyms, limit: 20});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.gym.brand === 'STC')).toBe(true);
    expect(
      hits.some(
        h =>
          /göteborg|goteborg/i.test(h.gym.name + h.gym.city) ||
          h.gym.region === 'Göteborg',
      ),
    ).toBe(true);
  });
});
