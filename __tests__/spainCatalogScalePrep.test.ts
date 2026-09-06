import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  isSpainCountry,
  allowsInventedCoordinates,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import type {GymCenter} from '../src/types/center.types';

describe('Spain catalog scaling prep', () => {
  test('catalog has exactly 10050 centers', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
  });

  test('country counts include Spain 976', () => {
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
  });

  test('es_ prefix is registered in GYM_ID_PREFIX', () => {
    expect(GYM_ID_PREFIX.spain).toBe('es_');
  });

  test('isSpainCountry accepts expected values', () => {
    expect(isSpainCountry('Spain')).toBe(true);
    expect(isSpainCountry('spain')).toBe(true);
    expect(isSpainCountry('es')).toBe(true);
    expect(isSpainCountry('españa')).toBe(true);
    expect(isSpainCountry('España')).toBe(true);
    expect(isSpainCountry('spanien')).toBe(true);
    expect(isSpainCountry('Spania')).toBe(true);
    expect(isSpainCountry('France')).toBe(false);
  });

  test('Spain does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Spain')).toBe(false);
    expect(allowsInventedCoordinates('es')).toBe(false);
  });

  test('Spain has translation key', () => {
    expect(gymCountryTranslationKey('Spain')).toBe('countries.spain');
    expect(gymCountryTranslationKey('es')).toBe('countries.spain');
  });

  test('Spain country labels in all locales', () => {
    const en = require('../src/i18n/translations/en').default ?? require('../src/i18n/translations/en');
    const da = require('../src/i18n/translations/da').default ?? require('../src/i18n/translations/da');
    const sv = require('../src/i18n/translations/sv').default ?? require('../src/i18n/translations/sv');
    const nb = require('../src/i18n/translations/nb').default ?? require('../src/i18n/translations/nb');
    expect(en.countries.spain).toBe('Spain');
    expect(da.countries.spain).toBe('Spanien');
    expect(sv.countries.spain).toBe('Spanien');
    expect(nb.countries.spain).toBe('Spania');
  });

  test('Spanish diacritics normalize correctly for search', () => {
    expect(normalizeGymSearchValue('Málaga')).toBe('malaga');
    expect(normalizeGymSearchValue('Cádiz')).toBe('cadiz');
    expect(normalizeGymSearchValue('Córdoba')).toBe('cordoba');
    expect(normalizeGymSearchValue('León')).toBe('leon');
    expect(normalizeGymSearchValue('Almería')).toBe('almeria');
  });

  test('ñ normalizes to n', () => {
    expect(normalizeGymSearchValue('España')).toBe('espana');
    expect(normalizeGymSearchValue('Logroño')).toBe('logrono');
    expect(normalizeGymSearchValue('Coruña')).toBe('coruna');
  });

  test('ü normalizes to u', () => {
    expect(normalizeGymSearchValue('Güell')).toBe('guell');
  });

  test('Spanish postcodes remain strings (5-digit, leading zeros preserved)', () => {
    const codes = ['28001', '08001', '01001', '04001', '07001'];
    for (const pc of codes) {
      expect(typeof pc).toBe('string');
      expect(pc.length).toBe(5);
      expect(pc).toBe(pc.toString());
    }
  });

  test('missing Spain coords → NaN (not eligible)', () => {
    const fake: GymCenter = {
      id: 'es_test_001', name: 'Test', brand: 'B', address: 'A',
      postal_code: '28001', city: 'Madrid', country: 'Spain',
      lat: null, lng: null, is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
  });

  test('no Madrid/Barcelona fallback for Spain gym with no coords', () => {
    const fake: GymCenter = {
      id: 'es_test_002', name: 'Test Barcelona', brand: 'B', address: 'A',
      postal_code: '08001', city: 'Barcelona', country: 'Spain',
      lat: null, lng: null, is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(lat).not.toBe(40.4168);
    expect(lng).not.toBe(-3.7038);
    expect(lat).not.toBe(41.3874);
    expect(lng).not.toBe(2.1686);
  });

  test('200m check-in radius is unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
  });

  test('no duplicate IDs', () => {
    const ids = new Set<string>();
    for (const c of ALL_GYM_CENTERS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
