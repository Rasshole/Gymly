/**
 * Poland catalog scaling prep — country support + post-merge catalog integrity.
 * Production: 9,715 centers (621 Poland) after Phase 2 merge.
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {isPolandCountry, allowsInventedCoordinates} from '../src/utils/gymCountry';
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

const PL_POSTAL_RE = /^\d{2}-\d{3}$/;

function fakePolandGym(partial: Partial<DanishGym> & {city: string; postalCode: string}): DanishGym {
  const id = partial.id ?? 'pl_alias_probe';
  return {
    id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city,
    address: partial.address ?? 'ul. Testowa 1',
    postalCode: partial.postalCode,
    country: 'Poland',
    region: 'Polska',
    latitude: partial.latitude ?? 52.23,
    longitude: partial.longitude ?? 21.01,
    brand: partial.brand ?? 'Probe',
    _center: {
      id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'ul. Testowa 1',
      postal_code: partial.postalCode,
      city: partial.city,
      country: 'Poland',
      lat: partial.latitude ?? 52.23,
      lng: partial.longitude ?? 21.01,
      is_active: true,
    },
  };
}

describe('Poland catalog scaling prep', () => {
  test('catalog has exactly 10050 centers; Poland = 621', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Poland').length).toBe(621);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('pl_')).length).toBe(621);
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
  });

  test('pl_ prefix registered (not pol_/po_)', () => {
    expect(GYM_ID_PREFIX.poland).toBe('pl_');
    expect((GYM_ID_PREFIX as Record<string, string>).pol).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).po).toBeUndefined();
  });

  test('isPolandCountry accepts expected aliases', () => {
    expect(isPolandCountry('Poland')).toBe(true);
    expect(isPolandCountry('poland')).toBe(true);
    expect(isPolandCountry('pl')).toBe(true);
    expect(isPolandCountry('PL')).toBe(true);
    expect(isPolandCountry('Polska')).toBe(true);
    expect(isPolandCountry('Polen')).toBe(true);
    expect(isPolandCountry('Italy')).toBe(false);
    expect(isPolandCountry('Belgium')).toBe(false);
    expect(isPolandCountry('po')).toBe(false);
  });

  test('Poland does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Poland')).toBe(false);
    expect(allowsInventedCoordinates('pl')).toBe(false);
    expect(allowsInventedCoordinates('Polska')).toBe(false);
  });

  test('Poland translation key + labels in all locales', () => {
    expect(gymCountryTranslationKey('Poland')).toBe('countries.poland');
    expect(gymCountryTranslationKey('pl')).toBe('countries.poland');
    expect(gymCountryTranslationKey('Polska')).toBe('countries.poland');
    expect(en.countries.poland).toBe('Poland');
    expect(da.countries.poland).toBe('Polen');
    expect(sv.countries.poland).toBe('Polen');
    expect(nb.countries.poland).toBe('Polen');
    const tEn = createTranslator(en as any);
    expect(formatGymCountryLabel('Poland', tEn)).toBe('Poland');
  });

  test('Polish characters fold for search (ł → l); stored text unchanged', () => {
    expect(normalizeGymSearchValue('Łódź')).toBe('lodz');
    expect(normalizeGymSearchValue('Lodz')).toBe('lodz');
    expect(normalizeGymSearchValue('Wrocław')).toBe('wroclaw');
    expect(normalizeGymSearchValue('Poznań')).toBe('poznan');
    expect(normalizeGymSearchValue('Gdańsk')).toBe('gdansk');
    expect(normalizeGymSearchValue('Białystok')).toBe('bialystok');
    expect(normalizeGymSearchValue('Częstochowa')).toBe('czestochowa');
    expect(normalizeGymSearchValue('Rzeszów')).toBe('rzeszow');
    expect(normalizeGymSearchValue('Toruń')).toBe('torun');
    expect(normalizeGymSearchValue('Kraków')).toBe('krakow');
    expect(normalizeGymSearchValue('ąęćńóśźż')).toBe('aecnoszz');
  });

  test('Polish postcodes NN-NNN remain strings; hyphen searchable via compact', () => {
    const codes = ['00-001', '30-001', '80-001', '01-234'];
    for (const pc of codes) {
      expect(typeof pc).toBe('string');
      expect(PL_POSTAL_RE.test(pc)).toBe(true);
    }
    expect(compactGymSearchValue('00-001')).toBe('00001');
    expect(compactGymSearchValue('00 001')).toBe('00001');
    expect(Number('00-001')).toBeNaN(); // must not be stored as number
    const fake: GymCenter = {
      id: 'pl_post_probe',
      name: 'Probe',
      brand: 'B',
      address: 'ul. Marszałkowska 1',
      postal_code: '00-001',
      city: 'Warszawa',
      country: 'Poland',
      lat: 52.23,
      lng: 21.01,
      is_active: true,
    };
    expect(typeof fake.postal_code).toBe('string');
    expect(fake.postal_code).toBe('00-001');
  });

  test('Polish city aliases appear in search keywords', () => {
    const warsaw = buildGymSearchEntry(fakePolandGym({city: 'Warszawa', postalCode: '00-001'}));
    expect(warsaw.haystack).toContain('warszawa');
    expect(warsaw.haystack).toContain('warsaw');
    expect(warsaw.haystack).toContain('poland');
    expect(warsaw.haystack).toContain('polska');

    const krakow = buildGymSearchEntry(
      fakePolandGym({id: 'pl_krakow', city: 'Kraków', postalCode: '30-001'}),
    );
    expect(krakow.haystack).toContain('krakow');
    expect(krakow.haystack).toContain('cracow');

    const lodz = buildGymSearchEntry(
      fakePolandGym({id: 'pl_lodz', city: 'Łódź', postalCode: '90-001'}),
    );
    expect(lodz.haystack).toContain('lodz');

    const wroclaw = buildGymSearchEntry(
      fakePolandGym({id: 'pl_wroclaw', city: 'Wrocław', postalCode: '50-001'}),
    );
    expect(wroclaw.haystack).toContain('wroclaw');
  });

  test('Polish postcode appears in search entry haystack/postalNorm', () => {
    const entry = buildGymSearchEntry(
      fakePolandGym({city: 'Warszawa', postalCode: '00-001'}),
    );
    expect(entry.postalNorm.replace(/\s+/g, '')).toBe('00001');
    expect(entry.haystack.replace(/\s+/g, '')).toContain('00001');
  });

  test('missing Poland coords → NaN (no Warsaw / Kraków / Poland centroid)', () => {
    const fake: GymCenter = {
      id: 'pl_missing_coords',
      name: 'Probe',
      brand: 'B',
      address: 'ul. Testowa 1',
      postal_code: '00-001',
      city: 'Warszawa',
      country: 'Poland',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
    expect(lat).not.toBe(52.2297);
    expect(lng).not.toBe(21.0122);
    expect(lat).not.toBe(50.0647);
    expect(lng).not.toBe(19.945);
  });

  test('orphan pl_* does not resolve to catalog[0] / DK / nearest', () => {
    expect(findGymById('pl_nonexistent_test')).toBeNull();
    const stub = resolveGymOrStub('pl_nonexistent_test');
    expect(stub.id).toBe('pl_nonexistent_test');
    expect(stub.region).toBe('Polska');
    expect(stub.name).toBe('Unknown gym');
    expect(ALL_GYM_CENTERS[0]?.id).not.toBe(stub.id);
    expect(unresolvedGymStub('pl_fake').id).toBe('pl_fake');
  });

  test('200 m check-in and auto-checkout unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('10k headroom documented', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(ALL_GYM_CENTERS.length).toBeGreaterThan(10000);
    expect(ALL_GYM_CENTERS.length - 10000).toBe(50);
  });

  test('unique IDs across production catalog', () => {
    const ids = ALL_GYM_CENTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
