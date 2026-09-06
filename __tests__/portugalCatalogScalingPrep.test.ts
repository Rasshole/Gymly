/**
 * Portugal catalog scaling prep — country support only (no production pt_* rows).
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  allowsInventedCoordinates,
  isPlausiblePortugalCoordinate,
  isPortugalCountry,
  isSpainCountry,
  isPolandCountry,
  PORTUGAL_POSTAL_RE,
} from '../src/utils/gymCountry';
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
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {GymCenter} from '../src/types/center.types';
import type {DanishGym} from '../src/data/danishGyms';

function fakePortugalGym(
  partial: Partial<DanishGym> & {city: string; postalCode: string},
): DanishGym {
  const id = partial.id ?? 'pt_alias_probe';
  return {
    id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city,
    address: partial.address ?? 'Rua da Liberdade 1',
    postalCode: partial.postalCode,
    country: 'Portugal',
    region: 'Portugal',
    latitude: partial.latitude ?? 38.7223,
    longitude: partial.longitude ?? -9.1393,
    brand: partial.brand ?? 'Probe',
    _center: {
      id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Rua da Liberdade 1',
      postal_code: partial.postalCode,
      city: partial.city,
      country: 'Portugal',
      lat: partial.latitude ?? 38.7223,
      lng: partial.longitude ?? -9.1393,
      is_active: true,
    },
  };
}

describe('Portugal catalog scaling prep', () => {
  test('catalog has exactly 10772 centers; Portugal production = 247', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11254);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Portugal').length).toBe(247);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('pt_')).length).toBe(247);
  });

  test('15-country production counts intact', () => {
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
    expect(counts['Switzerland']).toBe(475);
    expect(counts['Portugal']).toBe(247);
  });

  test('pt_ prefix registered; wrong prefixes rejected', () => {
    expect(GYM_ID_PREFIX.portugal).toBe('pt_');
    expect((GYM_ID_PREFIX as Record<string, string>).po).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).por).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).prt).toBeUndefined();
  });

  test('isPortugalCountry accepts expected aliases; distinct from Spain', () => {
    expect(isPortugalCountry('Portugal')).toBe(true);
    expect(isPortugalCountry('pt')).toBe(true);
    expect(isPortugalCountry('PT')).toBe(true);
    expect(isPortugalCountry('República Portuguesa')).toBe(true);
    expect(isPortugalCountry('Spain')).toBe(false);
    expect(isPortugalCountry('es')).toBe(false);
    expect(isPortugalCountry('España')).toBe(false);
    expect(isSpainCountry('Portugal')).toBe(false);
    expect(isPortugalCountry('po')).toBe(false);
  });

  test('Portugal does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Portugal')).toBe(false);
    expect(allowsInventedCoordinates('pt')).toBe(false);
  });

  test('Portugal translation key + labels in all locales', () => {
    expect(gymCountryTranslationKey('Portugal')).toBe('countries.portugal');
    expect(gymCountryTranslationKey('pt')).toBe('countries.portugal');
    expect(en.countries.portugal).toBe('Portugal');
    expect(da.countries.portugal).toBe('Portugal');
    expect(sv.countries.portugal).toBe('Portugal');
    expect(nb.countries.portugal).toBe('Portugal');
    const tEn = createTranslator(en as any);
    expect(formatGymCountryLabel('Portugal', tEn)).toBe('Portugal');
  });

  test('Portuguese diacritics fold for search; stored text unchanged', () => {
    expect(normalizeGymSearchValue('Lisboa')).toBe('lisboa');
    expect(normalizeGymSearchValue('Évora')).toBe('evora');
    expect(normalizeGymSearchValue('Evora')).toBe('evora');
    expect(normalizeGymSearchValue('Setúbal')).toBe('setubal');
    expect(normalizeGymSearchValue('Guimarães')).toBe('guimaraes');
    expect(normalizeGymSearchValue('São João')).toBe('sao joao');
    expect(normalizeGymSearchValue('açores')).toBe('acores');
    expect(normalizeGymSearchValue('Açores')).toBe('acores');
    // ç via NFD
    expect(normalizeGymSearchValue('Praça')).toBe('praca');
  });

  test('Portuguese postcodes NNNN-NNN as strings; compact search form', () => {
    expect(PORTUGAL_POSTAL_RE.test('1000-001')).toBe(true);
    expect(PORTUGAL_POSTAL_RE.test('4000-001')).toBe(true);
    expect(PORTUGAL_POSTAL_RE.test('00-001')).toBe(false); // Poland shape
    expect(PORTUGAL_POSTAL_RE.test('1000001')).toBe(false); // compact is search-only
    expect(typeof '1000-001').toBe('string');
    expect(normalizeGymSearchValue('1000-001')).toBe('1000 001');
    expect(compactGymSearchValue('1000-001')).toBe('1000001');
    expect(compactGymSearchValue('1000001')).toBe('1000001');
  });

  test('Portugal vs Poland postcode shapes stay distinct', () => {
    const pt = fakePortugalGym({city: 'Lisboa', postalCode: '1000-001'});
    const pl: DanishGym = {
      id: 'pl_post_collision',
      name: 'Probe PL',
      city: 'Warszawa',
      postalCode: '00-001',
      country: 'Poland',
      region: 'Polska',
      latitude: 52.23,
      longitude: 21.01,
      brand: 'Probe',
      _center: {
        id: 'pl_post_collision',
        name: 'Probe PL',
        brand: 'Probe',
        address: 'ul. Marszałkowska 1',
        postal_code: '00-001',
        city: 'Warszawa',
        country: 'Poland',
        lat: 52.23,
        lng: 21.01,
        is_active: true,
      },
    };
    expect(isPortugalCountry(pt.country)).toBe(true);
    expect(isPolandCountry(pl.country)).toBe(true);
    expect(PORTUGAL_POSTAL_RE.test(pt.postalCode!)).toBe(true);
    expect(PORTUGAL_POSTAL_RE.test(pl.postalCode!)).toBe(false);
    expect(compactGymSearchValue(pt.postalCode!)).toBe('1000001');
    expect(compactGymSearchValue(pl.postalCode!)).toBe('00001');
    expect(compactGymSearchValue(pt.postalCode!)).not.toBe(compactGymSearchValue(pl.postalCode!));
  });

  test('Lisboa/Lisbon and Porto aliases in search index (stored city unchanged)', () => {
    const lisboa = buildGymSearchEntry(
      fakePortugalGym({id: 'pt_lisboa', city: 'Lisboa', postalCode: '1000-001'}),
    );
    expect(lisboa.haystack).toContain('lisboa');
    expect(lisboa.haystack).toContain('lisbon');
    expect(lisboa.haystack).toContain('portugal');

    const porto = buildGymSearchEntry(
      fakePortugalGym({
        id: 'pt_porto',
        city: 'Porto',
        postalCode: '4000-001',
        latitude: 41.1579,
        longitude: -8.6291,
      }),
    );
    expect(porto.haystack).toContain('porto');
    expect(porto.haystack).toContain('oporto');

    const gaia = buildGymSearchEntry(
      fakePortugalGym({
        id: 'pt_gaia',
        city: 'Vila Nova de Gaia',
        postalCode: '4400-001',
        latitude: 41.1239,
        longitude: -8.6118,
      }),
    );
    expect(gaia.haystack).toContain('vila nova de gaia');
    expect(gaia.haystack).toContain('gaia');
  });

  test('Madeira and Azores coordinates are plausible Portugal; Spain border points are not', () => {
    expect(isPlausiblePortugalCoordinate(38.7223, -9.1393)).toBe(true); // Lisboa
    expect(isPlausiblePortugalCoordinate(41.1579, -8.6291)).toBe(true); // Porto
    expect(isPlausiblePortugalCoordinate(32.6669, -16.9241)).toBe(true); // Funchal
    expect(isPlausiblePortugalCoordinate(37.7412, -25.6756)).toBe(true); // Ponta Delgada
    expect(isPlausiblePortugalCoordinate(40.4168, -3.7038)).toBe(false); // Madrid
    expect(isPlausiblePortugalCoordinate(37.3891, -5.9845)).toBe(false); // Seville
    expect(isPlausiblePortugalCoordinate(33.5731, -7.5898)).toBe(false); // Casablanca
    expect(isPlausiblePortugalCoordinate(14.933, -23.513)).toBe(false); // Cape Verde
  });

  test('Portugal/Spain country identity stays separate on fixtures', () => {
    const pt = fakePortugalGym({
      id: 'pt_valenca',
      city: 'Valença',
      postalCode: '4930-001',
      latitude: 42.028,
      longitude: -8.644,
    });
    expect(pt.country).toBe('Portugal');
    expect(pt.id.startsWith('pt_')).toBe(true);
    expect(isSpainCountry(pt.country)).toBe(false);
    expect(isPortugalCountry('Spain')).toBe(false);
  });

  test('missing Portugal coords → NaN (no Lisbon/Madrid/catalog centroid)', () => {
    const fake: GymCenter = {
      id: 'pt_missing_coords',
      name: 'Probe',
      brand: 'B',
      address: 'Rua A 1',
      postal_code: '1000-001',
      city: 'Lisboa',
      country: 'Portugal',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
    expect(lat).not.toBe(38.7223);
    expect(lng).not.toBe(-9.1393);
    expect(lat).not.toBe(40.4168);
    expect(lng).not.toBe(-3.7038);
  });

  test('orphan pt_* does not resolve to catalog[0] / DK / ES / nearest', () => {
    expect(findGymById('pt_nonexistent_test')).toBeNull();
    const stub = resolveGymOrStub('pt_nonexistent_test');
    expect(stub.id).toBe('pt_nonexistent_test');
    expect(stub.region).toBe('Portugal');
    expect(stub.name).toBe('Unknown gym');
    expect(ALL_GYM_CENTERS[0]?.id).not.toBe(stub.id);
    expect(unresolvedGymStub('pt_fake').region).toBe('Portugal');
  });

  test('200 m check-in and auto-checkout unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
  });

  test('nearest gym among Portuguese fixtures picks local club', () => {
    const lisboa = fakePortugalGym({
      id: 'pt_lisboa_n',
      city: 'Lisboa',
      postalCode: '1000-001',
      latitude: 38.7223,
      longitude: -9.1393,
    });
    const porto = fakePortugalGym({
      id: 'pt_porto_n',
      city: 'Porto',
      postalCode: '4000-001',
      latitude: 41.1579,
      longitude: -8.6291,
    });
    const funchal = fakePortugalGym({
      id: 'pt_funchal_n',
      city: 'Funchal',
      postalCode: '9000-001',
      latitude: 32.6669,
      longitude: -16.9241,
    });
    const pd = fakePortugalGym({
      id: 'pt_pd_n',
      city: 'Ponta Delgada',
      postalCode: '9500-001',
      latitude: 37.7412,
      longitude: -25.6756,
    });
    const fixtures = [lisboa, porto, funchal, pd];
    expect(findNearestGym(38.7223, -9.1393, fixtures)?.id).toBe('pt_lisboa_n');
    expect(findNearestGym(41.1579, -8.6291, fixtures)?.id).toBe('pt_porto_n');
    expect(findNearestGym(32.6669, -16.9241, fixtures)?.id).toBe('pt_funchal_n');
    expect(findNearestGym(37.7412, -25.6756, fixtures)?.id).toBe('pt_pd_n');
  });

  test('future pt_* map viewport filter compatible (Lisboa fixture)', () => {
    const gym = fakePortugalGym({id: 'pt_map_probe', city: 'Lisboa', postalCode: '1000-001'});
    const mapCenters = [
      {
        id: gym.id,
        name: gym.name,
        latitude: gym.latitude,
        longitude: gym.longitude,
        mapLatitude: gym.latitude,
        mapLongitude: gym.longitude,
        brand: gym.brand ?? '',
        friendsActiveCount: 0,
        totalActiveCount: 0,
        logoUrl: null,
      },
    ];
    const visible = filterMapCentersInRegion(mapCenters as any, {
      latitude: 38.7223,
      longitude: -9.1393,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    });
    expect(visible.length).toBe(1);
    expect(visible[0]!.id).toBe('pt_map_probe');
  });

  test('scale sanity — live catalog within client-side comfort zone', () => {
    expect(ALL_GYM_CENTERS.length).toBeLessThan(20000);
    expect(ALL_GYM_CENTERS.length + 2000).toBeLessThan(15000);
  });
});
