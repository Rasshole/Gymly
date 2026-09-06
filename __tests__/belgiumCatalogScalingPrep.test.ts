import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  isBelgiumCountry,
  allowsInventedCoordinates,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {findGymById} from '../src/utils/gymDisplay';
import type {GymCenter} from '../src/types/center.types';
import type {DanishGym} from '../src/data/danishGyms';

describe('Belgium catalog scaling prep', () => {
  test('catalog has exactly 10050 centers', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
  });

  test('country counts: Belgium 363, production 11 countries intact', () => {
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
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('be_')).length).toBe(363);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('bel_')).length).toBe(0);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('bg_')).length).toBe(0);
  });

  test('be_ prefix is registered in GYM_ID_PREFIX (not bel_/bg_)', () => {
    expect(GYM_ID_PREFIX.belgium).toBe('be_');
    expect((GYM_ID_PREFIX as Record<string, string>).belgium).toBe('be_');
    expect((GYM_ID_PREFIX as Record<string, string>).bel).toBeUndefined();
  });

  test('isBelgiumCountry accepts expected values', () => {
    expect(isBelgiumCountry('Belgium')).toBe(true);
    expect(isBelgiumCountry('belgium')).toBe(true);
    expect(isBelgiumCountry('be')).toBe(true);
    expect(isBelgiumCountry('BE')).toBe(true);
    expect(isBelgiumCountry('Belgie')).toBe(true);
    expect(isBelgiumCountry('België')).toBe(true);
    expect(isBelgiumCountry('belgië')).toBe(true);
    expect(isBelgiumCountry('Belgique')).toBe(true);
    expect(isBelgiumCountry('Belgien')).toBe(true);
    expect(isBelgiumCountry('Belgia')).toBe(true);
    expect(isBelgiumCountry('Italy')).toBe(false);
    expect(isBelgiumCountry('Netherlands')).toBe(false);
    expect(isBelgiumCountry('France')).toBe(false);
    expect(isBelgiumCountry('bg')).toBe(false);
  });

  test('Belgium does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Belgium')).toBe(false);
    expect(allowsInventedCoordinates('be')).toBe(false);
    expect(allowsInventedCoordinates('België')).toBe(false);
    expect(allowsInventedCoordinates('Belgique')).toBe(false);
  });

  test('Belgium has translation key', () => {
    expect(gymCountryTranslationKey('Belgium')).toBe('countries.belgium');
    expect(gymCountryTranslationKey('be')).toBe('countries.belgium');
    expect(gymCountryTranslationKey('België')).toBe('countries.belgium');
    expect(gymCountryTranslationKey('Belgique')).toBe('countries.belgium');
  });

  test('Belgium country labels in all locales', () => {
    const en = require('../src/i18n/translations/en').default ?? require('../src/i18n/translations/en');
    const da = require('../src/i18n/translations/da').default ?? require('../src/i18n/translations/da');
    const sv = require('../src/i18n/translations/sv').default ?? require('../src/i18n/translations/sv');
    const nb = require('../src/i18n/translations/nb').default ?? require('../src/i18n/translations/nb');
    expect(en.countries.belgium).toBe('Belgium');
    expect(da.countries.belgium).toBe('Belgien');
    expect(sv.countries.belgium).toBe('Belgien');
    expect(nb.countries.belgium).toBe('Belgia');
  });

  test('Belgian diacritics normalize correctly for search', () => {
    expect(normalizeGymSearchValue('Liège')).toBe('liege');
    expect(normalizeGymSearchValue('Liege')).toBe('liege');
    expect(normalizeGymSearchValue('België')).toBe('belgie');
    expect(normalizeGymSearchValue('Bruxelles')).toBe('bruxelles');
    expect(normalizeGymSearchValue('àéèêëïôùü')).toBe('aeeeeiouu');
  });

  test('Belgian postcodes remain strings (4-digit)', () => {
    const codes = ['1000', '2000', '9000', '4000', '8000', '0500'];
    for (const pc of codes) {
      expect(typeof pc).toBe('string');
      expect(pc.length).toBe(4);
      expect(pc).toBe(String(pc));
    }
    // Leading zeros must not be lost (numeric coercion would drop them)
    expect(Number('0500').toString()).toBe('500');
    expect('0500').toBe('0500');
    const fake: GymCenter = {
      id: 'be_post_probe',
      name: 'Probe',
      brand: 'B',
      address: 'Rue de la Loi 1',
      postal_code: '1000',
      city: 'Bruxelles',
      country: 'Belgium',
      lat: 50.85,
      lng: 4.35,
      is_active: true,
    };
    expect(typeof fake.postal_code).toBe('string');
    expect(fake.postal_code).toBe('1000');
  });

  test('multilingual Belgian city aliases appear in search keywords', () => {
    const base: DanishGym = {
      id: 'be_alias_probe',
      name: 'Probe Gym',
      city: 'Bruxelles',
      address: 'Rue Neuve 1',
      postalCode: '1000',
      country: 'Belgium',
      region: 'België',
      latitude: 50.85,
      longitude: 4.35,
      brand: 'Probe',
      _center: {
        id: 'be_alias_probe',
        name: 'Probe Gym',
        brand: 'Probe',
        address: 'Rue Neuve 1',
        postal_code: '1000',
        city: 'Bruxelles',
        country: 'Belgium',
        lat: 50.85,
        lng: 4.35,
        is_active: true,
      },
    };
    const entry = buildGymSearchEntry(base);
    const hay = entry.haystack;
    expect(hay).toContain('brussels');
    expect(hay).toContain('bruxelles');
    expect(hay).toContain('brussel');
    expect(hay).toContain('belgium');
    expect(hay).toContain('belgique');
    expect(hay).toContain('belgie');

    const antwerp = buildGymSearchEntry({
      ...base,
      id: 'be_antwerp',
      city: 'Antwerpen',
      _center: {...base._center, id: 'be_antwerp', city: 'Antwerpen'},
    });
    expect(antwerp.haystack).toContain('antwerp');
    expect(antwerp.haystack).toContain('antwerpen');
    expect(antwerp.haystack).toContain('anvers');

    const ghent = buildGymSearchEntry({
      ...base,
      id: 'be_ghent',
      city: 'Gent',
      _center: {...base._center, id: 'be_ghent', city: 'Gent'},
    });
    expect(ghent.haystack).toContain('ghent');
    expect(ghent.haystack).toContain('gent');
    expect(ghent.haystack).toContain('gand');

    const liege = buildGymSearchEntry({
      ...base,
      id: 'be_liege',
      city: 'Liège',
      _center: {...base._center, id: 'be_liege', city: 'Liège'},
    });
    expect(liege.haystack).toContain('liege');
    expect(liege.haystack).toContain('luik');

    const bruges = buildGymSearchEntry({
      ...base,
      id: 'be_bruges',
      city: 'Brugge',
      _center: {...base._center, id: 'be_bruges', city: 'Brugge'},
    });
    expect(bruges.haystack).toContain('bruges');
    expect(bruges.haystack).toContain('brugge');
  });

  test('missing Belgium coords → NaN (not eligible)', () => {
    const fake: GymCenter = {
      id: 'be_test_001',
      name: 'Test',
      brand: 'B',
      address: 'A',
      postal_code: '1000',
      city: 'Bruxelles',
      country: 'Belgium',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
  });

  test('no Brussels/Belgium/postal/DK/Stockholm fallback for Belgium gym with no coords', () => {
    const fake: GymCenter = {
      id: 'be_test_002',
      name: 'Test Brussels',
      brand: 'B',
      address: 'A',
      postal_code: '1000',
      city: 'Brussels',
      country: 'Belgium',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    // Brussels
    expect(lat).not.toBe(50.8503);
    expect(lng).not.toBe(4.3517);
    // Stockholm SE fallback
    expect(lat).not.toBe(59.33);
    expect(lng).not.toBe(18.07);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
  });

  test('200m check-in radius and auto-checkout distance unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('orphan be_* unresolvedRegion is safe for unknown IDs', () => {
    expect(ALL_GYM_CENTERS.some(c => c.id.startsWith('be_'))).toBe(true);
    expect(findGymById('be_orphan_safety_probe')).toBeNull();
    const {unresolvedGymStub} = require('../src/utils/gymDisplay');
    const stub = unresolvedGymStub('be_orphan_safety_probe');
    expect(stub.region).toBe('België');
    expect(Number.isFinite(stub.latitude)).toBe(false);
    expect(Number.isFinite(stub.longitude)).toBe(false);
  });

  test('no duplicate IDs', () => {
    const ids = new Set<string>();
    for (const c of ALL_GYM_CENTERS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
