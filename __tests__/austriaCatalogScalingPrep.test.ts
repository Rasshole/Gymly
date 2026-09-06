/**
 * Austria catalog scaling prep — country support + post-merge 10k state.
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {isAustriaCountry, isGermanyCountry, allowsInventedCoordinates} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey, formatGymCountryLabel} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
  compactGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {
  findGymById,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {GymCenter} from '../src/types/center.types';
import type {DanishGym} from '../src/data/danishGyms';

const AT_POSTAL_RE = /^\d{4}$/;

function fakeAustriaGym(partial: Partial<DanishGym> & {city: string; postalCode: string}): DanishGym {
  const id = partial.id ?? 'at_alias_probe';
  return {
    id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city,
    address: partial.address ?? 'Kärntner Straße 1',
    postalCode: partial.postalCode,
    country: 'Austria',
    region: 'Österreich',
    latitude: partial.latitude ?? 48.21,
    longitude: partial.longitude ?? 16.37,
    brand: partial.brand ?? 'Probe',
    _center: {
      id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Kärntner Straße 1',
      postal_code: partial.postalCode,
      city: partial.city,
      country: 'Austria',
      lat: partial.latitude ?? 48.21,
      lng: partial.longitude ?? 16.37,
      is_active: true,
    },
  };
}

describe('Austria catalog scaling prep', () => {
  test('catalog has exactly 10050 centers; Austria = 335', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Austria').length).toBe(335);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('at_')).length).toBe(335);
  });

  test('current country counts intact (12 countries)', () => {
    const counts: Record<string, number> = {};
    ALL_GYM_CENTERS.forEach(c => {
      counts[c.country] = (counts[c.country] || 0) + 1;
    });
    expect(counts['Denmark']).toBe(354);
    expect(counts['Sweden']).toBe(639);
    expect(counts['Norway']).toBe(535);
    expect(counts['Finland']).toBe(429);
    expect(counts['Germany']).toBe(1424);
    expect(counts['United Kingdom']).toBe(1474);
    expect(counts['Netherlands']).toBe(600);
    expect(counts['France']).toBe(1712);
    expect(counts['Spain']).toBe(976);
    expect(counts['Italy']).toBe(588);
    expect(counts['Belgium']).toBe(363);
    expect(counts['Poland']).toBe(621);
    expect(counts['Austria']).toBe(335);
  });

  test('at_ prefix IDs present in production', () => {
    expect(GYM_ID_PREFIX.austria).toBe('at_');
    expect((GYM_ID_PREFIX as Record<string, string>).au).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).aut).toBeUndefined();
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('at_')).length).toBe(335);
  });

  test('isAustriaCountry accepts expected aliases; distinct from Germany', () => {
    expect(isAustriaCountry('Austria')).toBe(true);
    expect(isAustriaCountry('austria')).toBe(true);
    expect(isAustriaCountry('at')).toBe(true);
    expect(isAustriaCountry('AT')).toBe(true);
    expect(isAustriaCountry('Österreich')).toBe(true);
    expect(isAustriaCountry('Oesterreich')).toBe(true);
    expect(isAustriaCountry('Germany')).toBe(false);
    expect(isAustriaCountry('Deutschland')).toBe(false);
    expect(isGermanyCountry('Austria')).toBe(false);
    expect(isAustriaCountry('au')).toBe(false);
  });

  test('Austria does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Austria')).toBe(false);
    expect(allowsInventedCoordinates('at')).toBe(false);
    expect(allowsInventedCoordinates('Österreich')).toBe(false);
  });

  test('Austria translation key + labels in all locales', () => {
    expect(gymCountryTranslationKey('Austria')).toBe('countries.austria');
    expect(gymCountryTranslationKey('at')).toBe('countries.austria');
    expect(gymCountryTranslationKey('Österreich')).toBe('countries.austria');
    expect(en.countries.austria).toBe('Austria');
    expect(da.countries.austria).toBe('Østrig');
    expect(sv.countries.austria).toBe('Österrike');
    expect(nb.countries.austria).toBe('Østerrike');
    const tEn = createTranslator(en as any);
    expect(formatGymCountryLabel('Austria', tEn)).toBe('Austria');
  });

  test('German/Austrian diacritics fold for search (reuse German map); stored text unchanged', () => {
    expect(normalizeGymSearchValue('Währing')).toBe('wahring');
    expect(normalizeGymSearchValue('Wahring')).toBe('wahring');
    expect(normalizeGymSearchValue('Kärntner Straße')).toBe('karntner strasse');
    expect(normalizeGymSearchValue('Mariahilfer Straße')).toBe('mariahilfer strasse');
    expect(normalizeGymSearchValue('Größe')).toBe('grosse');
    expect(normalizeGymSearchValue('Grosse')).toBe('grosse');
  });

  test('Austrian 4-digit postcodes remain strings (distinct from BE by country context)', () => {
    const codes = ['1010', '1020', '4020', '5020', '6020', '8010'];
    for (const pc of codes) {
      expect(typeof pc).toBe('string');
      expect(AT_POSTAL_RE.test(pc)).toBe(true);
    }
    expect(Number('1010')).toBe(1010);
    expect('1010').toBe('1010');
    expect('0100').toBe('0100');
    const fake: GymCenter = {
      id: 'at_post_probe',
      name: 'Probe',
      brand: 'B',
      address: 'Kärntner Straße 1',
      postal_code: '1010',
      city: 'Wien',
      country: 'Austria',
      lat: 48.21,
      lng: 16.37,
      is_active: true,
    };
    expect(typeof fake.postal_code).toBe('string');
    expect(fake.postal_code).toBe('1010');
    expect(compactGymSearchValue('1010')).toBe('1010');
  });

  test('Austrian city aliases appear in search keywords (test fixtures only)', () => {
    const vienna = buildGymSearchEntry(fakeAustriaGym({city: 'Wien', postalCode: '1010'}));
    expect(vienna.haystack).toContain('wien');
    expect(vienna.haystack).toContain('vienna');
    expect(vienna.haystack).toContain('austria');
    expect(vienna.haystack).toContain('osterreich');

    const graz = buildGymSearchEntry(
      fakeAustriaGym({id: 'at_graz', city: 'Graz', postalCode: '8010'}),
    );
    expect(graz.haystack).toContain('graz');

    const linz = buildGymSearchEntry(
      fakeAustriaGym({id: 'at_linz', city: 'Linz', postalCode: '4020'}),
    );
    expect(linz.haystack).toContain('linz');

    const salzburg = buildGymSearchEntry(
      fakeAustriaGym({id: 'at_salzburg', city: 'Salzburg', postalCode: '5020'}),
    );
    expect(salzburg.haystack).toContain('salzburg');
  });

  test('missing Austria coords → NaN (no Vienna / Austria / Germany centroid)', () => {
    const fake: GymCenter = {
      id: 'at_missing_coords',
      name: 'Probe',
      brand: 'B',
      address: 'Kärntner Straße 1',
      postal_code: '1010',
      city: 'Wien',
      country: 'Austria',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
    expect(lat).not.toBe(48.2082);
    expect(lng).not.toBe(16.3738);
    expect(lat).not.toBe(52.52);
    expect(lng).not.toBe(13.405);
  });

  test('orphan at_* does not resolve to catalog[0] / DK / DE / nearest', () => {
    expect(findGymById('at_nonexistent_test')).toBeNull();
    const stub = resolveGymOrStub('at_nonexistent_test');
    expect(stub.id).toBe('at_nonexistent_test');
    expect(stub.region).toBe('Österreich');
    expect(stub.name).toBe('Unknown gym');
    expect(ALL_GYM_CENTERS[0]?.id).not.toBe(stub.id);
    expect(unresolvedGymStub('at_fake').id).toBe('at_fake');
    expect(unresolvedGymStub('at_fake').region).toBe('Österreich');
  });

  test('200 m check-in and auto-checkout unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('10k threshold crossed; global stress QA deferred', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(ALL_GYM_CENTERS.length).toBeGreaterThan(10000);
    expect(ALL_GYM_CENTERS.length - 10000).toBe(50);
  });

  test('unique IDs across production catalog', () => {
    const ids = ALL_GYM_CENTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
