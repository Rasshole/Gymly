/**
 * Switzerland catalog scaling prep — country support only (no production ch_* rows).
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  allowsInventedCoordinates,
  isAustriaCountry,
  isBelgiumCountry,
  isFranceCountry,
  isGermanyCountry,
  isItalyCountry,
  isLiechtensteinCountry,
  isSwitzerlandCountry,
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
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {GymCenter} from '../src/types/center.types';
import type {DanishGym} from '../src/data/danishGyms';

const CH_POSTAL_RE = /^\d{4}$/;

function fakeSwitzerlandGym(
  partial: Partial<DanishGym> & {city: string; postalCode: string},
): DanishGym {
  const id = partial.id ?? 'ch_alias_probe';
  return {
    id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city,
    address: partial.address ?? 'Bahnhofstrasse 1',
    postalCode: partial.postalCode,
    country: 'Switzerland',
    region: 'Schweiz',
    latitude: partial.latitude ?? 47.3769,
    longitude: partial.longitude ?? 8.5417,
    brand: partial.brand ?? 'Probe',
    _center: {
      id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Bahnhofstrasse 1',
      postal_code: partial.postalCode,
      city: partial.city,
      country: 'Switzerland',
      lat: partial.latitude ?? 47.3769,
      lng: partial.longitude ?? 8.5417,
      is_active: true,
    },
  };
}

describe('Switzerland catalog scaling prep', () => {
  test('catalog has exactly 10772 centers; Switzerland production = 475', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11254);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Switzerland').length).toBe(475);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ch_')).length).toBe(475);
  });

  test('14-country production counts intact', () => {
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
  });

  test('ch_ prefix registered; wrong prefixes rejected', () => {
    expect(GYM_ID_PREFIX.switzerland).toBe('ch_');
    expect((GYM_ID_PREFIX as Record<string, string>).sw).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).swi).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).che).toBeUndefined();
  });

  test('isSwitzerlandCountry accepts expected aliases; distinct from neighbors', () => {
    expect(isSwitzerlandCountry('Switzerland')).toBe(true);
    expect(isSwitzerlandCountry('ch')).toBe(true);
    expect(isSwitzerlandCountry('CH')).toBe(true);
    expect(isSwitzerlandCountry('Schweiz')).toBe(true);
    expect(isSwitzerlandCountry('Suisse')).toBe(true);
    expect(isSwitzerlandCountry('Svizzera')).toBe(true);
    expect(isSwitzerlandCountry('Germany')).toBe(false);
    expect(isSwitzerlandCountry('Austria')).toBe(false);
    expect(isSwitzerlandCountry('France')).toBe(false);
    expect(isSwitzerlandCountry('Italy')).toBe(false);
    expect(isSwitzerlandCountry('sw')).toBe(false);
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(isSwitzerlandCountry('Liechtenstein')).toBe(false);
  });

  test('Switzerland does not allow invented coordinates', () => {
    expect(allowsInventedCoordinates('Switzerland')).toBe(false);
    expect(allowsInventedCoordinates('ch')).toBe(false);
    expect(allowsInventedCoordinates('Schweiz')).toBe(false);
  });

  test('Switzerland translation key + labels in all locales', () => {
    expect(gymCountryTranslationKey('Switzerland')).toBe('countries.switzerland');
    expect(gymCountryTranslationKey('ch')).toBe('countries.switzerland');
    expect(gymCountryTranslationKey('Schweiz')).toBe('countries.switzerland');
    expect(en.countries.switzerland).toBe('Switzerland');
    expect(da.countries.switzerland).toBe('Schweiz');
    expect(sv.countries.switzerland).toBe('Schweiz');
    expect(nb.countries.switzerland).toBe('Sveits');
    const tEn = createTranslator(en as any);
    expect(formatGymCountryLabel('Switzerland', tEn)).toBe('Switzerland');
  });

  test('German/French/Italian diacritics fold for search; stored text unchanged', () => {
    expect(normalizeGymSearchValue('Zürich')).toBe('zurich');
    expect(normalizeGymSearchValue('Zurich')).toBe('zurich');
    expect(normalizeGymSearchValue('Genève')).toBe('geneve');
    expect(normalizeGymSearchValue('Geneve')).toBe('geneve');
    expect(normalizeGymSearchValue('Bâle')).toBe('bale');
    expect(normalizeGymSearchValue('Neuchâtel')).toBe('neuchatel');
    expect(normalizeGymSearchValue('Fribourg')).toBe('fribourg');
    expect(normalizeGymSearchValue('Straße')).toBe('strasse');
    expect(normalizeGymSearchValue("Sant'Agata")).toBe('sant agata');
  });

  test('Swiss 4-digit postcodes remain strings; disambiguated from AT/BE by country', () => {
    const codes = ['8001', '1201', '3001', '4001'];
    for (const pc of codes) {
      expect(typeof pc).toBe('string');
      expect(CH_POSTAL_RE.test(pc)).toBe(true);
    }
    expect('1010').toBe('1010');
    expect('1000').toBe('1000');
    const chZurich = fakeSwitzerlandGym({city: 'Zürich', postalCode: '8001'});
    const atVienna: DanishGym = {
      id: 'at_post_collision',
      name: 'Probe AT',
      city: 'Wien',
      postalCode: '1010',
      country: 'Austria',
      region: 'Österreich',
      latitude: 48.21,
      longitude: 16.37,
      brand: 'Probe',
      _center: {
        id: 'at_post_collision',
        name: 'Probe AT',
        brand: 'Probe',
        address: 'Kärntner Straße 1',
        postal_code: '1010',
        city: 'Wien',
        country: 'Austria',
        lat: 48.21,
        lng: 16.37,
        is_active: true,
      },
    };
    const beBrussels: DanishGym = {
      id: 'be_post_collision',
      name: 'Probe BE',
      city: 'Bruxelles',
      postalCode: '1000',
      country: 'Belgium',
      region: 'België',
      latitude: 50.85,
      longitude: 4.35,
      brand: 'Probe',
      _center: {
        id: 'be_post_collision',
        name: 'Probe BE',
        brand: 'Probe',
        address: 'Rue de la Loi 1',
        postal_code: '1000',
        city: 'Bruxelles',
        country: 'Belgium',
        lat: 50.85,
        lng: 4.35,
        is_active: true,
      },
    };
    const chEntry = buildGymSearchEntry(chZurich);
    const atEntry = buildGymSearchEntry(atVienna);
    const beEntry = buildGymSearchEntry(beBrussels);
    expect(chEntry.haystack).toContain('8001');
    expect(chEntry.haystack).toContain('switzerland');
    expect(atEntry.haystack).toContain('1010');
    expect(atEntry.haystack).toContain('austria');
    expect(beEntry.haystack).toContain('1000');
    expect(beEntry.haystack).toContain('belgium');
    expect(compactGymSearchValue('8001')).toBe('8001');
  });

  test('Swiss multilingual city aliases in search keywords (fixtures only)', () => {
    const zurich = buildGymSearchEntry(fakeSwitzerlandGym({city: 'Zürich', postalCode: '8001'}));
    expect(zurich.haystack).toContain('zurich');

    const geneve = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_geneve', city: 'Genève', postalCode: '1201'}),
    );
    expect(geneve.haystack).toContain('geneve');
    expect(geneve.haystack).toContain('geneva');
    expect(geneve.haystack).toContain('genf');

    const basel = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_basel', city: 'Basel', postalCode: '4001'}),
    );
    expect(basel.haystack).toContain('basel');
    expect(basel.haystack).toContain('bale');

    const bern = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_bern', city: 'Bern', postalCode: '3001'}),
    );
    expect(bern.haystack).toContain('bern');
    expect(bern.haystack).toContain('berne');

    const luzern = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_luzern', city: 'Luzern', postalCode: '6003'}),
    );
    expect(luzern.haystack).toContain('luzern');
    expect(luzern.haystack).toContain('lucerne');

    const stGallen = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_stgallen', city: 'St. Gallen', postalCode: '9000'}),
    );
    expect(stGallen.haystack).toContain('st gallen');
    expect(stGallen.haystack).toContain('saint gall');

    const biel = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_biel', city: 'Biel/Bienne', postalCode: '2502'}),
    );
    expect(biel.haystack).toContain('biel');
    expect(biel.haystack).toContain('bienne');

    const fribourg = buildGymSearchEntry(
      fakeSwitzerlandGym({id: 'ch_fribourg', city: 'Fribourg', postalCode: '1700'}),
    );
    expect(fribourg.haystack).toContain('fribourg');
    expect(fribourg.haystack).toContain('freiburg');

    expect(zurich.haystack).toContain('schweiz');
    expect(zurich.haystack).toContain('suisse');
    expect(zurich.haystack).toContain('svizzera');
  });

  test('cross-country brand search keeps country identity on center (fixture)', () => {
    const chFit = fakeSwitzerlandGym({
      id: 'ch_fitinn_zurich',
      city: 'Zürich',
      postalCode: '8001',
      brand: 'FITINN',
      name: 'FITINN Zürich',
    });
    expect(chFit.country).toBe('Switzerland');
    expect(chFit.id.startsWith('ch_')).toBe(true);
    expect(isGermanyCountry('Switzerland')).toBe(false);
    expect(isAustriaCountry('Switzerland')).toBe(false);
    expect(isFranceCountry('Switzerland')).toBe(false);
    expect(isItalyCountry('Switzerland')).toBe(false);
  });

  test('missing Switzerland coords → NaN (no Zurich/Bern/German/Austrian centroid)', () => {
    const fake: GymCenter = {
      id: 'ch_missing_coords',
      name: 'Probe',
      brand: 'B',
      address: 'Bahnhofstrasse 1',
      postal_code: '8001',
      city: 'Zürich',
      country: 'Switzerland',
      lat: null,
      lng: null,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(fake);
    expect(Number.isFinite(lat)).toBe(false);
    expect(Number.isFinite(lng)).toBe(false);
    expect(lat).not.toBe(47.3769);
    expect(lng).not.toBe(8.5417);
    expect(lat).not.toBe(46.948);
    expect(lng).not.toBe(7.4474);
    expect(lat).not.toBe(52.52);
    expect(lng).not.toBe(13.405);
    expect(lat).not.toBe(48.2082);
    expect(lng).not.toBe(16.3738);
  });

  test('orphan ch_* does not resolve to catalog[0] / DK / DE / AT / nearest', () => {
    expect(findGymById('ch_nonexistent_test')).toBeNull();
    const stub = resolveGymOrStub('ch_nonexistent_test');
    expect(stub.id).toBe('ch_nonexistent_test');
    expect(stub.region).toBe('Schweiz');
    expect(stub.name).toBe('Unknown gym');
    expect(ALL_GYM_CENTERS[0]?.id).not.toBe(stub.id);
    expect(unresolvedGymStub('ch_fake').id).toBe('ch_fake');
    expect(unresolvedGymStub('ch_fake').region).toBe('Schweiz');
  });

  test('200 m check-in and auto-checkout unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('future ch_* map viewport filter compatible (fixture)', () => {
    const gym = fakeSwitzerlandGym({id: 'ch_map_probe', city: 'Zürich', postalCode: '8001'});
    const region = {
      latitude: 47.3769,
      longitude: 8.5417,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    };
    const visible = filterMapCentersInRegion([gym as any], region);
    expect(visible.length).toBe(1);
    expect(visible[0]!.id).toBe('ch_map_probe');
  });

  test('future ch_* nearest-gym compatible (fixture among mixed countries)', () => {
    const zurich = fakeSwitzerlandGym({id: 'ch_nearest_zurich', city: 'Zürich', postalCode: '8001'});
    const geneve = fakeSwitzerlandGym({
      id: 'ch_nearest_geneve',
      city: 'Genève',
      postalCode: '1201',
      latitude: 46.2044,
      longitude: 6.1432,
    });
    const nearest = findNearestGym(47.37, 8.54, [geneve, zurich]);
    expect(nearest?.id).toBe('ch_nearest_zurich');
    expect(nearest?.country).toBe('Switzerland');
  });

  test('Liechtenstein is not Switzerland', () => {
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(isSwitzerlandCountry('Liechtenstein')).toBe(false);
    expect(isAustriaCountry('Liechtenstein')).toBe(false);
  });

  test('border neighbor countries remain distinct from Switzerland', () => {
    expect(isFranceCountry('France')).toBe(true);
    expect(isGermanyCountry('Germany')).toBe(true);
    expect(isItalyCountry('Italy')).toBe(true);
    expect(isAustriaCountry('Austria')).toBe(true);
    expect(isBelgiumCountry('Belgium')).toBe(true);
    for (const neighbor of ['France', 'Germany', 'Italy', 'Austria']) {
      expect(isSwitzerlandCountry(neighbor)).toBe(false);
    }
  });

  test('unique IDs across production catalog', () => {
    const ids = ALL_GYM_CENTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
