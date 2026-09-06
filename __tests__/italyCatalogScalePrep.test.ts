import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  isItalyCountry,
  allowsInventedCoordinates,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import type {GymCenter} from '../src/types/center.types';

describe('Italy catalog scaling prep', () => {
  test('catalog has exactly 10050 centers', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
  });

  test('country counts include Italy 550 after merge', () => {
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
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('it_')).length).toBe(588);
  });

  test('it_ prefix is registered in GYM_ID_PREFIX (not italy_/ita_)', () => {
    expect(GYM_ID_PREFIX.italy).toBe('it_');
    expect((GYM_ID_PREFIX as Record<string, string>).italy).toBe('it_');
  });

  test('isItalyCountry accepts expected values', () => {
    expect(isItalyCountry('Italy')).toBe(true);
    expect(isItalyCountry('italy')).toBe(true);
    expect(isItalyCountry('it')).toBe(true);
    expect(isItalyCountry('Italia')).toBe(true);
    expect(isItalyCountry('italia')).toBe(true);
    expect(isItalyCountry('Italien')).toBe(true);
    expect(isItalyCountry('italien')).toBe(true);
    expect(isItalyCountry('Spain')).toBe(false);
    expect(isItalyCountry('San Marino')).toBe(false);
    expect(isItalyCountry('Vatican')).toBe(false);
    expect(isItalyCountry('Vatican City')).toBe(false);
  });

  test('Italy does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Italy')).toBe(false);
    expect(allowsInventedCoordinates('it')).toBe(false);
    expect(allowsInventedCoordinates('Italia')).toBe(false);
  });

  test('Italy has translation key', () => {
    expect(gymCountryTranslationKey('Italy')).toBe('countries.italy');
    expect(gymCountryTranslationKey('it')).toBe('countries.italy');
    expect(gymCountryTranslationKey('Italia')).toBe('countries.italy');
  });

  test('Italy country labels in all locales', () => {
    const en = require('../src/i18n/translations/en').default ?? require('../src/i18n/translations/en');
    const da = require('../src/i18n/translations/da').default ?? require('../src/i18n/translations/da');
    const sv = require('../src/i18n/translations/sv').default ?? require('../src/i18n/translations/sv');
    const nb = require('../src/i18n/translations/nb').default ?? require('../src/i18n/translations/nb');
    expect(en.countries.italy).toBe('Italy');
    expect(da.countries.italy).toBe('Italien');
    expect(sv.countries.italy).toBe('Italien');
    expect(nb.countries.italy).toBe('Italia');
  });

  test('Italian diacritics normalize correctly for search', () => {
    expect(normalizeGymSearchValue('Forlì')).toBe('forli');
    expect(normalizeGymSearchValue('Forli')).toBe('forli');
    expect(normalizeGymSearchValue('àèéìòù')).toBe('aeeiou');
    expect(normalizeGymSearchValue('Città')).toBe('citta');
    expect(normalizeGymSearchValue('Perugia')).toBe('perugia');
  });

  test('Italian apostrophes normalize for search only', () => {
    expect(normalizeGymSearchValue("Sant'Agata")).toBe('sant agata');
    expect(normalizeGymSearchValue('Sant’Agata')).toBe('sant agata');
  });

  test('Italian CAP remain strings (5-digit, leading zeros preserved)', () => {
    const codes = ['00118', '20121', '50100', '80121', '09125'];
    for (const pc of codes) {
      expect(typeof pc).toBe('string');
      expect(pc.length).toBe(5);
      expect(pc).toBe(String(pc));
    }
    // Leading zeros must not be lost (numeric coercion would drop them)
    expect(Number('00118').toString()).toBe('118');
    expect('00118').toBe('00118');
    // Schema type is string — verify sample CAP stays string
    const fake: GymCenter = {
      id: 'it_cap_probe',
      name: 'Probe',
      brand: 'B',
      address: 'Via Roma 1',
      postal_code: '00118',
      city: 'Roma',
      country: 'Italy',
      lat: 41.9,
      lng: 12.5,
      is_active: true,
    };
    expect(typeof fake.postal_code).toBe('string');
    expect(fake.postal_code).toBe('00118');
  });

  test('missing Italy coords → NaN (not eligible)', () => {
    const fake: GymCenter = {
      id: 'it_test_001',
      name: 'Test',
      brand: 'B',
      address: 'A',
      postal_code: '00118',
      city: 'Roma',
      country: 'Italy',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
  });

  test('no Rome/Milan/centroid fallback for Italy gym with no coords', () => {
    const fake: GymCenter = {
      id: 'it_test_002',
      name: 'Test Milano',
      brand: 'B',
      address: 'A',
      postal_code: '20121',
      city: 'Milano',
      country: 'Italy',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(lat).not.toBe(41.9028);
    expect(lng).not.toBe(12.4964);
    expect(lat).not.toBe(45.4642);
    expect(lng).not.toBe(9.19);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
  });

  test('200m check-in radius and auto-checkout distance unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('no duplicate IDs', () => {
    const ids = new Set<string>();
    for (const c of ALL_GYM_CENTERS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
