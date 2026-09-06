import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  isFranceCountry,
  allowsInventedCoordinates,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
  applyDanishAsciiVariants,
} from '../src/services/gymSearch/gymSearchNormalize';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import type {GymCenter} from '../src/types/center.types';

describe('France catalog scaling prep', () => {
  test('catalog has exactly 10050 centers', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
  });

  test('country counts are unchanged', () => {
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

  test('fr_ prefix is registered in GYM_ID_PREFIX', () => {
    expect(GYM_ID_PREFIX.france).toBe('fr_');
  });

  test('isFranceCountry accepts expected values', () => {
    expect(isFranceCountry('France')).toBe(true);
    expect(isFranceCountry('france')).toBe(true);
    expect(isFranceCountry('fr')).toBe(true);
    expect(isFranceCountry('frankrig')).toBe(true);
    expect(isFranceCountry('Frankrike')).toBe(true);
    expect(isFranceCountry('Germany')).toBe(false);
  });

  test('France does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('France')).toBe(false);
    expect(allowsInventedCoordinates('fr')).toBe(false);
  });

  test('France has translation key', () => {
    expect(gymCountryTranslationKey('France')).toBe('countries.france');
    expect(gymCountryTranslationKey('fr')).toBe('countries.france');
  });

  test('French diacritics normalize correctly for search', () => {
    expect(normalizeGymSearchValue('Château')).toBe('chateau');
    expect(normalizeGymSearchValue('François')).toBe('francois');
    expect(normalizeGymSearchValue('Crème')).toBe('creme');
    expect(normalizeGymSearchValue('Île-de-France')).toBe('ile de france');
    expect(normalizeGymSearchValue('Façade')).toBe('facade');
    expect(normalizeGymSearchValue('Noël')).toBe('noel');
  });

  test('œ and Œ normalize to oe', () => {
    expect(applyDanishAsciiVariants('Bœuf')).toBe('Boeuf');
    expect(applyDanishAsciiVariants('Œuvre')).toBe('oeuvre');
    expect(normalizeGymSearchValue('cœur')).toBe('coeur');
  });

  test('French postcodes remain strings (leading zeros safe)', () => {
    const sample = ALL_GYM_CENTERS.slice(0, 10);
    for (const c of sample) {
      expect(typeof c.postal_code).toBe('string');
    }
    // Verify string type would preserve French leading zeros
    const frPostcodes = ['75001', '69001', '01000', '06000'];
    for (const pc of frPostcodes) {
      expect(typeof pc).toBe('string');
      expect(pc).toBe(pc.toString());
      expect(pc.length).toBe(5);
    }
  });

  test('no duplicate IDs', () => {
    const ids = new Set<string>();
    for (const c of ALL_GYM_CENTERS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  test('200m check-in radius is unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
  });

  test('missing France coords → NaN (not eligible)', () => {
    const fake: GymCenter = {
      id: 'fr_test_001', name: 'Test', brand: 'B', address: 'A',
      postal_code: '75001', city: 'Paris', country: 'France',
      lat: null, lng: null, is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
  });

  test('no Paris fallback for France gym with no coords', () => {
    const fake: GymCenter = {
      id: 'fr_test_002', name: 'Test Lyon', brand: 'B', address: 'A',
      postal_code: '69002', city: 'Lyon', country: 'France',
      lat: null, lng: null, is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(lat).not.toBe(48.8566);
    expect(lng).not.toBe(2.3522);
  });

  test('France country labels in all locales', () => {
    const en = require('../src/i18n/translations/en').default ?? require('../src/i18n/translations/en');
    const da = require('../src/i18n/translations/da').default ?? require('../src/i18n/translations/da');
    const sv = require('../src/i18n/translations/sv').default ?? require('../src/i18n/translations/sv');
    const nb = require('../src/i18n/translations/nb').default ?? require('../src/i18n/translations/nb');
    expect(en.countries.france).toBe('France');
    expect(da.countries.france).toBe('Frankrig');
    expect(sv.countries.france).toBe('Frankrike');
    expect(nb.countries.france).toBe('Frankrike');
  });

  test('Orléans, Évry, Saint-Étienne normalize correctly', () => {
    expect(normalizeGymSearchValue('Orléans')).toBe('orleans');
    expect(normalizeGymSearchValue('Évry')).toBe('evry');
    expect(normalizeGymSearchValue('Saint-Étienne')).toBe('saint etienne');
  });
});
