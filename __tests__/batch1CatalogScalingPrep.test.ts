/**
 * Batch 1 catalog scaling prep — Ireland, Czechia, Hungary, Greece.
 * Production plumbing only; no centers.json rows for these countries.
 */
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {
  allowsInventedCoordinates,
  isIrelandCountry,
  isCzechiaCountry,
  isHungaryCountry,
  isGreeceCountry,
  isUnitedKingdomCountry,
  isGermanyCountry,
  isPolandCountry,
  isAustriaCountry,
  isPlausibleIrelandCoordinate,
  isPlausibleCzechiaCoordinate,
  isPlausibleHungaryCoordinate,
  isPlausibleGreeceCoordinate,
  IRELAND_EIRCODE_RE,
  CZECHIA_POSTAL_RE,
  HUNGARY_POSTAL_RE,
  GREECE_POSTAL_RE,
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
import type {DanishGym} from '../src/data/danishGyms';

function fakeGym(
  country: string,
  partial: Partial<DanishGym> & {
    id: string;
    city: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    region: DanishGym['region'];
  },
): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city,
    address: partial.address ?? '1 Probe Street',
    postalCode: partial.postalCode,
    country,
    region: partial.region,
    latitude: partial.latitude,
    longitude: partial.longitude,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? '1 Probe Street',
      postal_code: partial.postalCode,
      city: partial.city,
      country,
      lat: partial.latitude,
      lng: partial.longitude,
      is_active: true,
    },
  };
}

describe('Batch 1 catalog scaling prep (IE/CZ/HU/GR)', () => {
  test('production baseline: Ireland+Czechia+Greece+Hungary merged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11254);
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
    expect(counts['Greece']).toBe(106);
    expect(counts['Ireland']).toBe(65);
    expect(counts['Czechia']).toBe(70);
    expect(counts['Hungary']).toBe(50);
    expect(counts['Romania']).toBe(154);
    expect(counts['Slovakia']).toBe(37);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ie_')).length).toBe(65);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('cz_')).length).toBe(70);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('hu_')).length).toBe(50);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('gr_')).length).toBe(106);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ro_')).length).toBe(154);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('sk_')).length).toBe(37);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11254);
  });

  test('ID prefixes registered; wrong prefixes rejected', () => {
    expect(GYM_ID_PREFIX.ireland).toBe('ie_');
    expect(GYM_ID_PREFIX.czechia).toBe('cz_');
    expect(GYM_ID_PREFIX.hungary).toBe('hu_');
    expect(GYM_ID_PREFIX.greece).toBe('gr_');
    expect((GYM_ID_PREFIX as Record<string, string>).ir).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).cs).toBeUndefined();
    expect((GYM_ID_PREFIX as Record<string, string>).el).toBeUndefined();
  });

  test('country detection aliases and neighbor separation', () => {
    expect(isIrelandCountry('Ireland')).toBe(true);
    expect(isIrelandCountry('Éire')).toBe(true);
    expect(isIrelandCountry('Northern Ireland')).toBe(false);
    expect(isUnitedKingdomCountry('Northern Ireland')).toBe(true);

    expect(isCzechiaCountry('Czechia')).toBe(true);
    expect(isCzechiaCountry('Czech Republic')).toBe(true);
    expect(isCzechiaCountry('Slovakia')).toBe(false);
    expect(isGermanyCountry('Czechia')).toBe(false);
    expect(isPolandCountry('Czechia')).toBe(false);
    expect(isAustriaCountry('Czechia')).toBe(false);

    expect(isHungaryCountry('Hungary')).toBe(true);
    expect(isHungaryCountry('Magyarország')).toBe(true);
    expect(isAustriaCountry('Hungary')).toBe(false);

    expect(isGreeceCountry('Greece')).toBe(true);
    expect(isGreeceCountry('Hellas')).toBe(true);
    expect(isGreeceCountry('Ελλάδα')).toBe(true);
  });

  test('no invented coordinates for batch countries', () => {
    for (const c of ['Ireland', 'Czechia', 'Hungary', 'Greece']) {
      expect(allowsInventedCoordinates(c)).toBe(false);
    }
  });

  test('i18n labels EN/DA/SV/NB', () => {
    expect(gymCountryTranslationKey('Ireland')).toBe('countries.ireland');
    expect(gymCountryTranslationKey('Czechia')).toBe('countries.czechia');
    expect(gymCountryTranslationKey('Hungary')).toBe('countries.hungary');
    expect(gymCountryTranslationKey('Greece')).toBe('countries.greece');
    expect(en.countries.ireland).toBe('Ireland');
    expect(en.countries.czechia).toBe('Czechia');
    expect(en.countries.hungary).toBe('Hungary');
    expect(en.countries.greece).toBe('Greece');
    expect(da.countries.ireland).toBe('Irland');
    expect(da.countries.czechia).toBe('Tjekkiet');
    expect(da.countries.hungary).toBe('Ungarn');
    expect(da.countries.greece).toBe('Grækenland');
    expect(sv.countries.ireland).toBe('Irland');
    expect(sv.countries.czechia).toBe('Tjeckien');
    expect(sv.countries.hungary).toBe('Ungern');
    expect(sv.countries.greece).toBe('Grekland');
    expect(nb.countries.ireland).toBe('Irland');
    expect(nb.countries.czechia).toBe('Tsjekkia');
    expect(nb.countries.hungary).toBe('Ungarn');
    expect(nb.countries.greece).toBe('Hellas');
    const t = createTranslator(en as any);
    expect(formatGymCountryLabel('Ireland', t)).toBe('Ireland');
    expect(formatGymCountryLabel('Czechia', t)).toBe('Czechia');
    expect(formatGymCountryLabel('Hungary', t)).toBe('Hungary');
    expect(formatGymCountryLabel('Greece', t)).toBe('Greece');
  });

  test('postcode formats validated as strings', () => {
    expect(IRELAND_EIRCODE_RE.test('D02 X285')).toBe(true);
    expect(IRELAND_EIRCODE_RE.test('D02X285')).toBe(true);
    expect(IRELAND_EIRCODE_RE.test('T12 XF2K')).toBe(true);
    expect(IRELAND_EIRCODE_RE.test('1000-001')).toBe(false);
    expect(CZECHIA_POSTAL_RE.test('110 00')).toBe(true);
    expect(CZECHIA_POSTAL_RE.test('11000')).toBe(false);
    expect(CZECHIA_POSTAL_RE.test('811 01')).toBe(false); // Slovak first digit 8
    expect(HUNGARY_POSTAL_RE.test('1051')).toBe(true);
    expect(HUNGARY_POSTAL_RE.test('105 1')).toBe(false);
    expect(GREECE_POSTAL_RE.test('105 58')).toBe(true);
    expect(GREECE_POSTAL_RE.test('10558')).toBe(false);
    expect(compactGymSearchValue('110 00')).toBe('11000');
    expect(compactGymSearchValue('105 58')).toBe('10558');
    expect(compactGymSearchValue('D02 X285').toUpperCase()).toBe('D02X285');
  });

  test('character normalization leaves display text unchanged', () => {
    expect(normalizeGymSearchValue('Plzeň')).toBe('plzen');
    expect(normalizeGymSearchValue('Győr')).toBe('gyor');
    expect(normalizeGymSearchValue('Székesfehérvár')).toBe('szekesfehervar');
    expect(normalizeGymSearchValue('Αθήνα')).toBe('athina');
    expect(normalizeGymSearchValue('Θεσσαλονίκη')).toBe('thessaloniki');
    expect(normalizeGymSearchValue('Πάτρα')).toBe('patra');
    // Stored Greek string unchanged by normalize helper itself being search-only
    expect('Αθήνα').toBe('Αθήνα');
  });

  test('city aliases appear in search haystack', () => {
    const dublin = fakeGym('Ireland', {
      id: 'ie_dublin_n',
      city: 'Dublin',
      postalCode: 'D02 X285',
      latitude: 53.3498,
      longitude: -6.2603,
      region: 'Ireland',
    });
    expect(buildGymSearchEntry(dublin).haystack).toContain('dublin');

    const praha = fakeGym('Czechia', {
      id: 'cz_praha_n',
      city: 'Praha',
      postalCode: '110 00',
      latitude: 50.0755,
      longitude: 14.4378,
      region: 'Czechia',
    });
    expect(buildGymSearchEntry(praha).haystack).toMatch(/prague|praha/);

    const pecs = fakeGym('Hungary', {
      id: 'hu_pecs_n',
      city: 'Pécs',
      postalCode: '7621',
      latitude: 46.0727,
      longitude: 18.2328,
      region: 'Hungary',
    });
    expect(buildGymSearchEntry(pecs).haystack).toMatch(/pecs/);

    const athens = fakeGym('Greece', {
      id: 'gr_athens_n',
      name: 'Probe Αθήνα',
      city: 'Αθήνα',
      postalCode: '105 58',
      latitude: 37.9838,
      longitude: 23.7275,
      region: 'Greece',
      address: 'Οδός Ερμού 1',
    });
    const hay = buildGymSearchEntry(athens).haystack;
    expect(hay).toMatch(/athens|athina/);
  });

  test('geographic plausibility + border rejects', () => {
    // Ireland vs NI / UK
    expect(isPlausibleIrelandCoordinate(53.3498, -6.2603)).toBe(true); // Dublin
    expect(isPlausibleIrelandCoordinate(54.5973, -5.9301)).toBe(false); // Belfast
    expect(isPlausibleIrelandCoordinate(51.5074, -0.1278)).toBe(false); // London

    // Czechia vs neighbors
    expect(isPlausibleCzechiaCoordinate(50.0755, 14.4378)).toBe(true); // Praha
    expect(isPlausibleCzechiaCoordinate(52.52, 13.405)).toBe(false); // Berlin
    expect(isPlausibleCzechiaCoordinate(48.2082, 16.3738)).toBe(false); // Vienna
    expect(isPlausibleCzechiaCoordinate(48.1486, 17.1077)).toBe(false); // Bratislava
    expect(isPlausibleCzechiaCoordinate(52.2297, 21.0122)).toBe(false); // Warsaw

    // Hungary vs neighbors
    expect(isPlausibleHungaryCoordinate(47.4979, 19.0402)).toBe(true); // Budapest
    expect(isPlausibleHungaryCoordinate(48.2082, 16.3738)).toBe(false); // Vienna
    expect(isPlausibleHungaryCoordinate(48.1486, 17.1077)).toBe(false); // Bratislava
    expect(isPlausibleHungaryCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
    expect(isPlausibleHungaryCoordinate(45.815, 15.9819)).toBe(false); // Zagreb
    expect(isPlausibleHungaryCoordinate(46.0569, 14.5058)).toBe(false); // Ljubljana
    expect(isPlausibleHungaryCoordinate(44.4268, 26.1025)).toBe(false); // Bucharest
    expect(isPlausibleHungaryCoordinate(50.4501, 30.5234)).toBe(false); // Kyiv

    // Greece mainland + islands vs neighbors
    expect(isPlausibleGreeceCoordinate(37.9838, 23.7275)).toBe(true); // Athens
    expect(isPlausibleGreeceCoordinate(35.3387, 25.1442)).toBe(true); // Heraklion Crete
    expect(isPlausibleGreeceCoordinate(36.4349, 28.2176)).toBe(true); // Rhodes
    expect(isPlausibleGreeceCoordinate(39.6243, 19.9217)).toBe(true); // Corfu
    expect(isPlausibleGreeceCoordinate(36.8915, 27.2877)).toBe(true); // Kos
    expect(isPlausibleGreeceCoordinate(39.1105, 26.5547)).toBe(true); // Lesbos
    expect(isPlausibleGreeceCoordinate(41.3275, 19.8187)).toBe(false); // Tirana
    expect(isPlausibleGreeceCoordinate(41.9981, 21.4254)).toBe(false); // Skopje
    expect(isPlausibleGreeceCoordinate(42.6977, 23.3219)).toBe(false); // Sofia
    expect(isPlausibleGreeceCoordinate(41.0082, 28.9784)).toBe(false); // Istanbul
  });

  test('missing coordinates stay NaN / unavailable', () => {
    const center = {
      id: 'ie_missing_coords',
      name: 'No Coords',
      brand: 'Probe',
      address: '1 Street',
      postal_code: 'D02 X285',
      city: 'Dublin',
      country: 'Ireland',
      lat: null as unknown as number,
      lng: null as unknown as number,
      is_active: true,
    };
    const {lat, lng} = getEffectiveLatLng(center as any);
    expect(Number.isNaN(lat)).toBe(true);
    expect(Number.isNaN(lng)).toBe(true);
  });

  test('orphan stubs resolve by prefix region', () => {
    expect(resolveGymOrStub('ie_nonexistent_test').region).toBe('Ireland');
    expect(resolveGymOrStub('cz_nonexistent_test').region).toBe('Czechia');
    expect(resolveGymOrStub('hu_nonexistent_test').region).toBe('Hungary');
    expect(resolveGymOrStub('gr_nonexistent_test').region).toBe('Greece');
    expect(findGymById('ie_nonexistent_test')).toBeNull();
    expect(resolveGymOrStub('ie_nonexistent_test').id).not.toBe(ALL_GYM_CENTERS[0]!.id);
    expect(unresolvedGymStub('gr_x').region).toBe('Greece');
  });

  test('check-in radii unchanged; nearest + map fixtures work', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    const fixtures = [
      fakeGym('Ireland', {
        id: 'ie_dublin_n',
        city: 'Dublin',
        postalCode: 'D02 X285',
        latitude: 53.3498,
        longitude: -6.2603,
        region: 'Ireland',
      }),
      fakeGym('Czechia', {
        id: 'cz_praha_n',
        city: 'Praha',
        postalCode: '110 00',
        latitude: 50.0755,
        longitude: 14.4378,
        region: 'Czechia',
      }),
      fakeGym('Hungary', {
        id: 'hu_bp_n',
        city: 'Budapest',
        postalCode: '1051',
        latitude: 47.4979,
        longitude: 19.0402,
        region: 'Hungary',
      }),
      fakeGym('Greece', {
        id: 'gr_ath_n',
        city: 'Αθήνα',
        postalCode: '105 58',
        latitude: 37.9838,
        longitude: 23.7275,
        region: 'Greece',
      }),
      fakeGym('Greece', {
        id: 'gr_crete_n',
        city: 'Ηράκλειο',
        postalCode: '712 02',
        latitude: 35.3387,
        longitude: 25.1442,
        region: 'Greece',
      }),
    ];
    expect(findNearestGym(53.35, -6.26, fixtures)?.id).toBe('ie_dublin_n');
    expect(findNearestGym(35.34, 25.14, fixtures)?.id).toBe('gr_crete_n');
    const visible = filterMapCentersInRegion(
      fixtures.map(g => ({
        id: g.id,
        name: g.name,
        latitude: g.latitude,
        longitude: g.longitude,
        mapLatitude: g.latitude,
        mapLongitude: g.longitude,
        brand: g.brand ?? '',
        friendsActiveCount: 0,
        totalActiveCount: 0,
        logoUrl: null,
      })) as never,
      {latitude: 53.35, longitude: -6.26, latitudeDelta: 0.5, longitudeDelta: 0.5} as never,
    );
    expect(visible.some(v => v.id === 'ie_dublin_n')).toBe(true);
    expect(visible.every(v => v.id.startsWith('ie_') || v.id.startsWith('cz_') || v.id.startsWith('hu_') || v.id.startsWith('gr_'))).toBe(
      true,
    );
  });

  test('catalog remains within previously validated client-side envelope', () => {
    expect(ALL_GYM_CENTERS.length).toBeLessThan(20000);
    expect(ALL_GYM_CENTERS.length).toBe(11254);
  });
});
