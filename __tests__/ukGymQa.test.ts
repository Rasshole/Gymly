import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms} from '../src/data/danishGyms';
import {
  ALL_GYM_CENTERS,
  findCenterById,
  getActiveCenters,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  allowsInventedCoordinates,
  isDenmarkCountry,
  isGermanyCountry,
  isNorwayCountry,
  isSwedenCountry,
  isUnitedKingdomCountry,
} from '../src/utils/gymCountry';
import {
  formatGymCountryLabel,
  gymCountryTranslationKey,
  gymPickerLocationLine,
} from '../src/utils/gymCountryLabel';
import {
  findGymById,
  findGymByIdRelaxed,
  formatGymDisplayName,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import {findNearestGym} from '../src/utils/nearestGym';
import {createTranslator} from '../src/i18n/translate';
import {SUPPORTED_LANGUAGES} from '../src/i18n/types';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {GymCenter} from '../src/types/center.types';

const staging = require('../data/uk/uk_centers_staging.json') as Array<{
  import_category?: string;
  name?: string;
  address?: string;
}>;

describe('UK gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const uk = gyms.filter(g => isUnitedKingdomCountry(g.country));
  const denmark = gyms.filter(g => isDenmarkCountry(g.country));
  const sweden = gyms.filter(g => isSwedenCountry(g.country));
  const norway = gyms.filter(g => isNorwayCountry(g.country));
  const germany = gyms.filter(g => isGermanyCountry(g.country));

  it('loads expected production catalog counts', () => {
    expect(catalog.length).toBe(10050);
    expect(catalog.filter(c => isDenmarkCountry(c.country)).length).toBe(354);
    expect(catalog.filter(c => isSwedenCountry(c.country)).length).toBe(639);
    expect(catalog.filter(c => isNorwayCountry(c.country)).length).toBe(535);
    expect(catalog.filter(c => isGermanyCountry(c.country)).length).toBe(1424);
    expect(catalog.filter(c => isUnitedKingdomCountry(c.country)).length).toBe(1474);

    expect(uk.length).toBe(1474);
    expect(denmark.length).toBe(350);
    expect(sweden.length).toBe(639);
    expect(norway.length).toBe(535);
    expect(germany.length).toBe(1424);
  });

  it('has unique gb_* IDs and valid United Kingdom rows', () => {
    const ids = catalog.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GYM_ID_PREFIX.unitedKingdom).toBe('gb_');
    expect(uk.every(g => g.id.startsWith('gb_'))).toBe(true);
    expect(catalog.some(c => c.id.startsWith('uk_'))).toBe(false);
    expect(uk.every(g => g.country === 'United Kingdom')).toBe(true);
    expect(uk.every(g => g.region === 'Storbritannien')).toBe(true);
    expect(uk.every(g => g._center.is_active === true)).toBe(true);
    expect(
      uk.every(
        g =>
          Number.isFinite(g.latitude) &&
          Number.isFinite(g.longitude) &&
          !(g.latitude === 0 && g.longitude === 0),
      ),
    ).toBe(true);
    expect(
      uk.every(
        g =>
          Boolean(g.address?.trim()) &&
          Boolean(g.postalCode?.trim()) &&
          Boolean(g.city?.trim()),
      ),
    ).toBe(true);
  });

  it('preserves UK text without mojibake', () => {
    const blob = uk
      .map(g => [g.name, g.city ?? '', g.address ?? '', g.brand ?? ''].join(' '))
      .join('\n');
    expect(blob).not.toMatch(/Ã¤|Ã¶|Ã¼|Ã©|â€“|â€™|�|\uFFFD/);
    expect(uk.some(g => (g.address ?? '').includes('Coldham’s'))).toBe(true);
    expect(uk.some(g => g.name.includes("Bishop's Stortford"))).toBe(true);
  });

  it('findGymById resolves gb_* and never displays the raw id', () => {
    const sample = uk.find(g => /london/i.test(g.city ?? '') || /london/i.test(g.name)) ?? uk[0]!;
    expect(findGymById(sample.id)?.id).toBe(sample.id);
    expect(findGymByIdRelaxed(sample.id.toUpperCase())?.id).toBe(sample.id);
    const name = formatGymDisplayName(sample);
    expect(name).toBeTruthy();
    expect(name).not.toMatch(/^gb_/i);
    expect(name).not.toBe(sample.id);
  });

  it('getEffectiveLatLng never invents UK coordinates', () => {
    const withCoords = findCenterById(uk[0]!.id)!;
    const real = getEffectiveLatLng(withCoords);
    expect(Number.isFinite(real.lat)).toBe(true);

    const fakeMissing = {
      ...withCoords,
      lat: null,
      lng: null,
    };
    const nan = getEffectiveLatLng(fakeMissing as typeof withCoords);
    expect(Number.isNaN(nan.lat)).toBe(true);
    expect(Number.isNaN(nan.lng)).toBe(true);
    expect(nan.lat).not.toBe(59.33);
    expect(nan.lng).not.toBe(18.07);
    expect(nan.lat).not.toBe(51.5074);
    expect(nan.lng).not.toBe(-0.1278);
    expect(allowsInventedCoordinates('United Kingdom')).toBe(false);
    expect(getGymLatLngForCheckIn(withCoords.id)).toEqual({
      latitude: withCoords.lat,
      longitude: withCoords.lng,
    });
    expect(getGymLatLngForCheckIn('gb_missing_coords_probe')).toBeNull();
  });

  describe('geography', () => {
    it('keeps every UK pin inside the UK and off Crown Dependencies / ROI / London centroid', () => {
      for (const g of uk) {
        expect(g.latitude).toBeGreaterThanOrEqual(49.8);
        expect(g.latitude).toBeLessThanOrEqual(60.9);
        expect(g.longitude).toBeGreaterThanOrEqual(-8.65);
        expect(g.longitude).toBeLessThanOrEqual(1.85);
        const jersey = g.latitude >= 49.15 && g.latitude <= 49.3 && g.longitude >= -2.3 && g.longitude <= -2.0;
        const guernsey = g.latitude >= 49.4 && g.latitude <= 49.52 && g.longitude >= -2.7 && g.longitude <= -2.45;
        const iom = g.latitude >= 54.0 && g.latitude <= 54.45 && g.longitude >= -4.85 && g.longitude <= -4.3;
        expect(jersey || guernsey || iom).toBe(false);
        expect(Math.abs(g.latitude - 51.5074) < 1e-4 && Math.abs(g.longitude + 0.1278) < 1e-4).toBe(
          false,
        );
      }
      const england = uk.filter(g => /london|manchester|birmingham/i.test(`${g.city} ${g.name}`));
      const scotland = uk.filter(g => /glasgow|edinburgh/i.test(`${g.city} ${g.name}`));
      const wales = uk.filter(g => /cardiff/i.test(`${g.city} ${g.name}`));
      const ni = uk.filter(g => /belfast/i.test(`${g.city} ${g.name}`) || (g.postalCode ?? '').toUpperCase().startsWith('BT'));
      expect(england.length).toBeGreaterThan(50);
      expect(scotland.length).toBeGreaterThan(10);
      expect(wales.length).toBeGreaterThan(3);
      expect(ni.length).toBeGreaterThan(3);
    });
  });

  describe('search', () => {
    const brandQueries: Array<[string, string]> = [
      ['PureGym', 'PureGym'],
      ['The Gym Group', 'The Gym Group'],
      ['Anytime Fitness', 'Anytime Fitness'],
      ['David Lloyd', 'David Lloyd'],
      ['Nuffield Health', 'Nuffield Health'],
      ['JD Gyms', 'JD Gyms'],
      ['Snap Fitness', 'Snap Fitness'],
      ['Bannatyne', 'Bannatyne'],
      ['Everlast Gyms', 'Everlast Gyms'],
      ['Energie Fitness', 'Energie Fitness'],
      ['Village Gym', 'Village Gym'],
      ['Virgin Active', 'Virgin Active'],
      ['Fitness First', 'Fitness First'],
      ['Third Space', 'Third Space'],
      ['Total Fitness', 'Total Fitness'],
      ['Gymbox', 'Gymbox'],
      ['Buzz Gym', 'Buzz Gym'],
      ['Fitness4Less', 'Fitness4Less'],
      ['easyGym', 'easyGym'],
    ];

    it.each(brandQueries)('finds UK brand query: %s', (q, brand) => {
      const hits = searchGyms(q, {gyms: uk, limit: 20});
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(h => isUnitedKingdomCountry(h.gym.country))).toBe(true);
      expect(hits.some(h => h.gym.brand === brand)).toBe(true);
    });

    it('finds major UK cities', () => {
      for (const city of [
        'London',
        'Manchester',
        'Birmingham',
        'Liverpool',
        'Leeds',
        'Glasgow',
        'Edinburgh',
        'Cardiff',
        'Belfast',
        'Bristol',
        'Sheffield',
        'Newcastle',
        'Nottingham',
        'Leicester',
        'Southampton',
        'Brighton',
        'Oxford',
        'Cambridge',
      ]) {
        const hits = searchGyms(city, {gyms: uk, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        const re = new RegExp(city, 'i');
        expect(
          hits.some(h => re.test(h.gym.city ?? '') || re.test(h.gym.name)),
        ).toBe(true);
      }
    });

    it('tolerates UK search aliases, punctuation and spacing', () => {
      const cases: Array<[string, RegExp]> = [
        ['the gym', /the gym group/i],
        ['gym group', /the gym group/i],
        ['puregym', /puregym/i],
        ['pure gym', /puregym/i],
        ['jd', /jd gyms/i],
        ['jd gyms', /jd gyms/i],
        ['anytime', /anytime fitness/i],
        ['fitness first', /fitness first/i],
        ['david lloyd', /david lloyd/i],
        ['nuffield', /nuffield/i],
        ['virgin', /virgin active/i],
        ['everlast', /everlast/i],
      ];
      for (const [q, re] of cases) {
        const hits = searchGyms(q, {gyms: uk, limit: 20});
        expect(hits.some(h => re.test(h.gym.brand ?? '') || re.test(h.gym.name))).toBe(
          true,
        );
      }
      expect(
        searchGyms("Bishop's Stortford", {gyms: uk, limit: 10}).some(h =>
          /stortford/i.test(h.gym.name),
        ),
      ).toBe(true);
      expect(
        searchGyms('Clacton-on-Sea', {gyms: uk, limit: 10}).some(h =>
          /clacton/i.test(h.gym.name),
        ),
      ).toBe(true);
    });

    it('supports UK postcode search via the shared index', () => {
      const prefixes = ['SW1', 'M1', 'B1', 'G1', 'EH1', 'CF10', 'BT1'];
      for (const q of prefixes) {
        const hits = searchGyms(q, {gyms: uk, limit: 15});
        expect(hits.length).toBeGreaterThan(0);
        expect(
          hits.some(h =>
            (h.gym.postalCode ?? '').toUpperCase().replace(/\s+/g, '').startsWith(q),
          ),
        ).toBe(true);
      }

      const complete = [
        ['M1 3BN', /manchester/i],
        ['SN3 3SQ', /swindon/i],
        ['YO30 4TU', /york/i],
        ['CF10 1LA', /cardiff/i],
        ['BT2 8GD', /belfast/i],
      ] as const;
      for (const [q, place] of complete) {
        const hits = searchGyms(q, {gyms: uk, limit: 8});
        expect(
          hits.some(
            h =>
              (h.gym.postalCode ?? '').toUpperCase().replace(/\s+/g, '') ===
                q.replace(/\s+/g, '') &&
              (place.test(h.gym.city ?? '') || place.test(h.gym.name)),
          ),
        ).toBe(true);
      }

      const sw1a = searchGyms('SW1A', {gyms: uk, limit: 10});
      expect(Array.isArray(sw1a)).toBe(true);
    });

    it('onboarding-style UK city/brand search does not prefer Danish gyms', () => {
      const london = searchGyms('PureGym London', {gyms, limit: 12});
      expect(london.length).toBeGreaterThan(0);
      expect(london.every(h => h.gym.id.startsWith('gb_'))).toBe(true);

      const manchester = searchGyms('Manchester', {gyms, limit: 12});
      expect(manchester.some(h => isUnitedKingdomCountry(h.gym.country))).toBe(true);
      expect(manchester[0] && isDenmarkCountry(manchester[0].gym.country)).toBe(false);
    });
  });

  describe('nearest gym', () => {
    it.each([
      ['London', 51.5074, -0.1278],
      ['Manchester', 53.4808, -2.2426],
      ['Birmingham', 52.4862, -1.8904],
      ['Glasgow', 55.8642, -4.2518],
      ['Cardiff', 51.4816, -3.1791],
      ['Belfast', 54.5973, -5.9301],
    ] as const)('nearest from %s is a local gb_* gym', (_city, lat, lng) => {
      const nearest = findNearestGym(lat, lng, gyms);
      expect(nearest).toBeTruthy();
      expect(nearest!.id.startsWith('gb_')).toBe(true);
      expect(isUnitedKingdomCountry(nearest!.country)).toBe(true);
      const d = calculateDistance(lat, lng, nearest!.latitude, nearest!.longitude);
      expect(d).toBeLessThan(20_000);
      expect(nearest!.latitude).not.toBe(59.33);
      expect(nearest!.longitude).not.toBe(18.07);
    });
  });

  describe('dense nearby centers vs explicit selection', () => {
    const erithA = uk.find(g => g.id === 'gb_59728c6752');
    const erithB = uk.find(g => g.id === 'gb_7e6359f61b');
    const swindonA = uk.find(g => g.id === 'gb_a49489a5a5');
    const swindonB = uk.find(g => g.id === 'gb_6e01651f16');
    const yorkA = uk.find(g => g.id === 'gb_11bf1f7e0c');
    const yorkB = uk.find(g => g.id === 'gb_8770dbb0c6');

    const clusters: Array<[string, string]> = [
      ['gb_ba90d2237e', 'gb_d75a662a41'],
      ['gb_f240a78429', 'gb_cc5aa6f225'],
      ['gb_59728c6752', 'gb_7e6359f61b'],
      ['gb_a49489a5a5', 'gb_6e01651f16'],
      ['gb_08ae43a9ef', 'gb_3515988c73'],
      ['gb_fff73c7cab', 'gb_03ee1ff844'],
    ];

    it('keeps the six different-brand ≤50 m clusters as separate gyms', () => {
      for (const [idA, idB] of clusters) {
        const a = uk.find(g => g.id === idA);
        const b = uk.find(g => g.id === idB);
        expect(a).toBeTruthy();
        expect(b).toBeTruthy();
        expect(a!.id).not.toBe(b!.id);
        expect(a!.brand).not.toBe(b!.brand);
        const d = calculateDistance(a!.latitude, a!.longitude, b!.latitude, b!.longitude);
        expect(d).toBeLessThanOrEqual(50);
        const ma = getMarkerMapCoordinate(a!.id, a!.latitude, a!.longitude);
        const mb = getMarkerMapCoordinate(b!.id, b!.latitude, b!.longitude);
        expect(ma.latitude === mb.latitude && ma.longitude === mb.longitude).toBe(false);
      }
    });

    it('manual selection overrides nearest and check-in uses the selected id', () => {
      expect(erithA && erithB).toBeTruthy();
      const selected = erithA!;
      const nearest = erithB!;
      const activeGymId = selected.id;
      expect(activeGymId).toBe(erithA!.id);
      expect(activeGymId).not.toBe(nearest.id);
      expect(findGymById(activeGymId)?.id).toBe(erithA!.id);
      const coords = getGymLatLngForCheckIn(activeGymId)!;
      expect(coords.latitude).toBe(selected.latitude);
      expect(coords.longitude).toBe(selected.longitude);
    });

    it('spot-checks Swindon and York co-located different-brand gyms', () => {
      expect(swindonA?.name).toMatch(/Nuffield Health Swindon/i);
      expect(swindonB?.name).toMatch(/The Gym Group Swindon/i);
      expect(
        calculateDistance(
          swindonA!.latitude,
          swindonA!.longitude,
          swindonB!.latitude,
          swindonB!.longitude,
        ),
      ).toBeLessThan(20);

      expect(yorkA?.name).toBe('Everlast Gyms York');
      expect(yorkB?.name).toBe('PureGym York Gym');
      expect(yorkA!.postalCode).toBe('YO30 4TU');
      expect(yorkB!.postalCode).toBe('YO30 4TU');
      expect(yorkA!.id).not.toBe(yorkB!.id);
    });
  });

  describe('200 m check-in + auto-checkout boundary', () => {
    const gym = uk.find(g => /london/i.test(g.city ?? '') || /london/i.test(g.name)) ?? uk[0]!;

    function offsetNorth(lat: number, lng: number, meters: number) {
      const dLat = meters / 111_320;
      return {latitude: lat + dLat, longitude: lng};
    }

    it('uses inclusive <= 200 for check-in eligibility', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

      const cases: Array<[number, boolean]> = [
        [500, false],
        [250, false],
        [201, false],
        [200, true],
        [199, true],
        [100, true],
        [10, true],
      ];
      for (const [meters, allowed] of cases) {
        const pos = offsetNorth(gym.latitude, gym.longitude, meters);
        const d = calculateDistance(pos.latitude, pos.longitude, gym.latitude, gym.longitude);
        expect(Math.abs(d - meters)).toBeLessThan(2);
        expect(d <= CHECK_IN_RADIUS_METERS).toBe(allowed);
      }
    });

    it('auto-checkout treats exactly 200 m as inside the selected UK gym', () => {
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
      const other = uk.find(g => g.id !== gym.id)!;
      const dOther = calculateDistance(
        gym.latitude,
        gym.longitude,
        other.latitude,
        other.longitude,
      );
      expect(dOther).toBeGreaterThan(0);
      const sessionGymId = gym.id;
      expect(sessionGymId).not.toBe(other.id);
      expect(getGymLatLngForCheckIn(sessionGymId)?.latitude).toBe(gym.latitude);
    });
  });

  describe('map viewport', () => {
    function toMapCenters() {
      return getActiveCenters()
        .filter(
          c =>
            c.lat != null &&
            c.lng != null &&
            Number.isFinite(c.lat) &&
            Number.isFinite(c.lng),
        )
        .map(c => ({
          id: c.id,
          name: c.name,
          latitude: c.lat as number,
          longitude: c.lng as number,
          mapLatitude: c.lat as number,
          mapLongitude: c.lng as number,
          logoUrl: null,
          friendsActiveCount: 0,
          totalActiveCount: 0,
          address: c.address,
          city: c.city,
          brand: c.brand,
          hasExplicitGeocode: true,
          country: c.country,
        }));
    }

    it.each([
      ['London', 51.5074, -0.1278],
      ['Manchester', 53.4808, -2.2426],
      ['Birmingham', 52.4862, -1.8904],
      ['Glasgow', 55.8642, -4.2518],
      ['Cardiff', 51.4816, -3.1791],
      ['Belfast', 54.5973, -5.9301],
    ] as const)('shows UK pins in %s without DK/SE/NO/DE', (_city, lat, lng) => {
      const all = toMapCenters();
      expect(all.length).toBeGreaterThan(4000);
      expect(all.length).toBeLessThan(catalog.length);
      const visible = filterMapCentersInRegion(all as any, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(catalog.length);
      expect(visible.some(c => c.id.startsWith('gb_'))).toBe(true);
      expect(visible.every(c => isUnitedKingdomCountry(c.country))).toBe(true);
      expect(visible.some(c => c.id.startsWith('de_'))).toBe(false);
      expect(visible.some(c => c.id.startsWith('no_'))).toBe(false);
      expect(visible.some(c => c.id.startsWith('se_'))).toBe(false);
    });
  });

  describe('localization', () => {
    it('localizes United Kingdom via existing i18n keys without en-GB', () => {
      expect(SUPPORTED_LANGUAGES).toEqual(['da', 'en', 'sv', 'nb']);
      expect((SUPPORTED_LANGUAGES as string[]).includes('en-GB')).toBe(false);
      expect(gymCountryTranslationKey('United Kingdom')).toBe('countries.unitedKingdom');
      const tEn = createTranslator(en as unknown as Record<string, unknown>);
      const tDa = createTranslator(da as unknown as Record<string, unknown>);
      const tSv = createTranslator(sv as unknown as Record<string, unknown>);
      const tNb = createTranslator(nb as unknown as Record<string, unknown>);
      expect(formatGymCountryLabel('United Kingdom', tEn)).toBe('United Kingdom');
      expect(formatGymCountryLabel('United Kingdom', tDa)).toBe('Storbritannien');
      expect(formatGymCountryLabel('United Kingdom', tSv)).toBe('Storbritannien');
      expect(formatGymCountryLabel('United Kingdom', tNb)).toBe('Storbritannia');
      const sample = uk[0]!;
      expect(gymPickerLocationLine(sample, tEn)).toContain('United Kingdom');
      expect(gymPickerLocationLine(sample, tDa)).toContain('Storbritannien');
    });
  });

  describe('orphan-ID safety', () => {
    it('does not substitute a Danish gym for a missing gb_* id', () => {
      const orphan = 'gb_deadbeef12ab';
      expect(findGymById(orphan)).toBeNull();
      expect(findGymByIdRelaxed(orphan)).toBeNull();
      const stub = resolveGymOrStub(orphan, 'Everlast Gyms York');
      expect(stub.id).toBe(orphan);
      expect(stub.name).toBe('Everlast Gyms York');
      expect(stub.id).not.toBe(gyms[0]!.id);
      expect(isDenmarkCountry(stub.country)).toBe(false);
      expect(formatGymDisplayName(stub)).not.toMatch(/^gb_/i);
      expect(formatGymDisplayName(stub)).toBe('Everlast Gyms York');
      expect(unresolvedGymStub(orphan).latitude).toBeNaN();
    });
  });

  describe('Sweden fallback isolation', () => {
    it('keeps the Stockholm fallback on Sweden only', () => {
      expect(allowsInventedCoordinates('Sweden')).toBe(true);
      expect(allowsInventedCoordinates('United Kingdom')).toBe(false);
      const seMissing: GymCenter = {
        id: 'se_qa_missing',
        name: 'Probe SE',
        brand: 'Probe',
        address: '1 Test',
        postal_code: '11122',
        city: 'Stockholm',
        country: 'Sweden',
        lat: null,
        lng: null,
        is_active: true,
      };
      const se = getEffectiveLatLng(seMissing);
      expect(se).toEqual({lat: 59.33, lng: 18.07});
      const ukMissing: GymCenter = {
        ...seMissing,
        id: 'gb_qa_missing',
        country: 'United Kingdom',
        postal_code: 'SW1A 1AA',
        city: 'London',
      };
      const ukNan = getEffectiveLatLng(ukMissing);
      expect(Number.isNaN(ukNan.lat)).toBe(true);
      expect(ukNan).not.toEqual({lat: 59.33, lng: 18.07});
    });
  });

  describe('Denmark / Sweden / Norway / Germany regression', () => {
    it('still finds DK/SE/NO/DE gyms including diacritics and ß', () => {
      expect(searchGyms('SATS København', {gyms, limit: 10}).some(h => isDenmarkCountry(h.gym.country))).toBe(true);
      expect(searchGyms('Nordic Wellness Stockholm', {gyms, limit: 10}).some(h => isSwedenCountry(h.gym.country))).toBe(true);
      expect(searchGyms('SATS Oslo', {gyms, limit: 10}).some(h => isNorwayCountry(h.gym.country))).toBe(true);
      expect(searchGyms('Tromso', {gyms: norway, limit: 10}).some(h => /troms/i.test(h.gym.city ?? '') || /troms/i.test(h.gym.name))).toBe(true);
      expect(searchGyms('McFIT', {gyms: germany, limit: 10}).some(h => isGermanyCountry(h.gym.country))).toBe(true);
      expect(searchGyms('Munchen', {gyms: germany, limit: 10}).some(h => /münchen/i.test(h.gym.city ?? '') || /münchen/i.test(h.gym.name))).toBe(true);
      expect(searchGyms('Greifswalder Strasse', {gyms: germany, limit: 10}).some(h => /greifswalder straße/i.test(h.gym.address ?? ''))).toBe(true);
    });

    it('keeps DK 200 m behaviour on a Danish gym', () => {
      const gym = denmark[0]!;
      const dLat = 200 / 111_320;
      const d = calculateDistance(gym.latitude + dLat, gym.longitude, gym.latitude, gym.longitude);
      expect(d <= CHECK_IN_RADIUS_METERS).toBe(true);
      const d201 = calculateDistance(gym.latitude + 201 / 111_320, gym.longitude, gym.latitude, gym.longitude);
      expect(d201 <= CHECK_IN_RADIUS_METERS).toBe(false);
    });
  });

  describe('staging safety', () => {
    it('keeps unresolved / coming-soon / closed UK rows out of production', () => {
      const counts = staging.reduce<Record<string, number>>((acc, row) => {
        const key = row.import_category || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      expect(counts.NEEDS_COORDINATES).toBe(166);
      expect(counts.NEEDS_REVIEW).toBe(5);
      expect(counts.COMING_SOON).toBe(71);
      expect(counts.CLOSED).toBe(1);
      expect(uk.some(g => /nuffield health barrow/i.test(g.name))).toBe(false);
      expect(uk.some(g => /test 100 lane/i.test(g.address ?? ''))).toBe(false);
      expect(uk.some(g => /gymbox holborn/i.test(g.name))).toBe(false);
      expect(uk.some(g => /^find a gym$/i.test(g.name) || /^home$/i.test(g.name))).toBe(false);
    });
  });

  describe('performance', () => {
    it('search index and representative UK queries stay responsive at 10050 centers', () => {
      const t0 = Date.now();
      const index = getGymSearchIndex(gyms);
      const buildMs = Date.now() - t0;
      expect(index.length).toBe(gyms.length);
      expect(buildMs).toBeLessThan(6000);

      const tCache = Date.now();
      const again = getGymSearchIndex(gyms);
      expect(again).toBe(index);
      expect(Date.now() - tCache).toBeLessThan(20);

      const queries = [
        'PureGym London',
        'the gym',
        'Manchester',
        'SW1',
        'M1 3BN',
        'SATS København',
        'McFIT',
      ];
      const t1 = Date.now();
      for (const q of queries) {
        const hits = searchGyms(q, {gyms, limit: 15});
        expect(hits.length).toBeGreaterThan(0);
      }
      expect(Date.now() - t1).toBeLessThan(8000);
    });
  });
});
