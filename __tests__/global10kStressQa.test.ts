/**
 * Global 10K+ stress QA — production catalog at 10,050 centers (13 countries).
 */
import fs from 'fs';
import path from 'path';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {
  ALL_GYM_CENTERS,
  findCenterById,
  getActiveCenters,
  getActiveCentersByCountry,
  getCentersByCountry,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {
  getActiveDanishGyms,
  getActiveGyms,
  getActiveGymsByCountry,
  getGymById,
  getGymsByCountry,
} from '../src/data/danishGyms';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {
  allowsInventedCoordinates,
  isAustriaCountry,
  isBelgiumCountry,
  isDenmarkCountry,
  isFinlandCountry,
  isFranceCountry,
  isGermanyCountry,
  isItalyCountry,
  isNetherlandsCountry,
  isNorwayCountry,
  isPolandCountry,
  isSpainCountry,
  isSwedenCountry,
  isUnitedKingdomCountry,
} from '../src/utils/gymCountry';
import {
  formatGymCountryLabel,
  gymCountryTranslationKey,
} from '../src/utils/gymCountryLabel';
import {
  findGymById,
  findGymByIdRelaxed,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';

const MOJIBAKE_RE = /Ã.|�|â€|Â(?![a-z])/;
const LITERAL_ESCAPE_RE = /\\x[0-9a-fA-F]{2}/;

const EXPECTED_COUNTS: Record<string, number> = {
  Denmark: 354,
  Sweden: 639,
  Norway: 535,
  Germany: 1424,
  'United Kingdom': 1474,
  Finland: 429,
  Netherlands: 600,
  France: 1712,
  Spain: 976,
  Italy: 588,
  Belgium: 363,
  Poland: 621,
  Austria: 335,
};

const PREFIX_BY_COUNTRY: Record<string, string | null> = {
  Denmark: null,
  Sweden: 'se_',
  Norway: 'no_',
  Germany: 'de_',
  'United Kingdom': 'gb_',
  Finland: 'fi_',
  Netherlands: 'nl_',
  France: 'fr_',
  Spain: 'es_',
  Italy: 'it_',
  Belgium: 'be_',
  Poland: 'pl_',
  Austria: 'at_',
};

function countryFn(country: string) {
  const map: Record<string, (c?: string | null) => boolean> = {
    Denmark: isDenmarkCountry,
    Sweden: isSwedenCountry,
    Norway: isNorwayCountry,
    Germany: isGermanyCountry,
    'United Kingdom': isUnitedKingdomCountry,
    Finland: isFinlandCountry,
    Netherlands: isNetherlandsCountry,
    France: isFranceCountry,
    Spain: isSpainCountry,
    Italy: isItalyCountry,
    Belgium: isBelgiumCountry,
    Poland: isPolandCountry,
    Austria: isAustriaCountry,
  };
  return map[country]!;
}

describe('Global 10K+ stress QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveGyms();

  describe('1. Production baseline', () => {
    it('total = 10050, active = 10046', () => {
      expect(catalog.length).toBe(10050);
      expect(getActiveCenters().length).toBe(10046);
      expect(gyms.length).toBe(10046);
    });

    it.each(Object.entries(EXPECTED_COUNTS))('%s = %d', (country, count) => {
      expect(catalog.filter(c => c.country === country).length).toBe(count);
    });
  });

  describe('2. Global catalog integrity', () => {
    it('globally unique IDs', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('no mojibake or literal escapes in any row', () => {
      let bad = 0;
      for (const c of catalog) {
        const blob = `${c.name}|${c.address}|${c.city}|${c.brand}`;
        if (MOJIBAKE_RE.test(blob) || LITERAL_ESCAPE_RE.test(blob)) bad++;
      }
      expect(bad).toBe(0);
    });

    it('active rows have name, brand, city; check-in rows have finite coords or legacy fallback', () => {
      for (const c of getActiveCenters()) {
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        const {lat, lng} = getEffectiveLatLng(c);
        if (!allowsInventedCoordinates(c.country)) {
          if (c.lat != null && c.lng != null) {
            expect(Number.isFinite(lat)).toBe(true);
            expect(Number.isFinite(lng)).toBe(true);
          }
        } else {
          expect(Number.isFinite(lat)).toBe(true);
          expect(Number.isFinite(lng)).toBe(true);
        }
      }
    });

    it('Denmark has 4 intentional inactive rows', () => {
      expect(catalog.filter(c => c.country === 'Denmark' && c.is_active === false).length).toBe(4);
    });
  });

  describe('3. Country prefix integrity', () => {
    it.each(Object.entries(PREFIX_BY_COUNTRY))('%s prefix rules', (country, prefix) => {
      const rows = catalog.filter(c => c.country === country);
      if (prefix) {
        expect(rows.every(c => c.id.startsWith(prefix))).toBe(true);
        expect(rows.some(c => c.id.startsWith('uk_'))).toBe(false);
      } else {
        expect(rows.some(c => c.id.startsWith('se_'))).toBe(false);
      }
    });

    it('GYM_ID_PREFIX matches conventions', () => {
      expect(GYM_ID_PREFIX.unitedKingdom).toBe('gb_');
      expect(GYM_ID_PREFIX.austria).toBe('at_');
      expect(GYM_ID_PREFIX.poland).toBe('pl_');
    });
  });

  describe('4. Country partitioning', () => {
    it.each(Object.keys(EXPECTED_COUNTS))('%s partitions correctly', country => {
      const fn = countryFn(country);
      const fromRegistry = getCentersByCountry(country).length;
      const fromActive = getActiveCentersByCountry(country).length;
      const fromGyms = getGymsByCountry(country).length;
      const fromActiveGyms = getActiveGymsByCountry(country).length;
      expect(fromRegistry).toBe(EXPECTED_COUNTS[country]);
      expect(fromGyms).toBe(fromRegistry);
      expect(fromActiveGyms).toBe(fromActive);
    });
  });

  describe('5. O(1) ID lookup', () => {
    const first = catalog[0]!;
    const mid = catalog[Math.floor(catalog.length / 2)]!;
    const last = catalog[catalog.length - 1]!;

    it.each([
      ['first', first.id],
      ['middle', mid.id],
      ['last', last.id],
      ['missing', 'zz_nonexistent_global'],
    ])('findCenterById %s is fast map lookup', (_label, id) => {
      const t0 = Date.now();
      for (let i = 0; i < 5000; i++) findCenterById(id);
      expect(Date.now() - t0).toBeLessThan(200);
    });

    it('findGymById uses map not linear scan', () => {
      const t0 = Date.now();
      for (let i = 0; i < 5000; i++) findGymById(mid.id);
      expect(Date.now() - t0).toBeLessThan(200);
    });
  });

  describe('6. Active catalog cache', () => {
    it('getActiveGyms returns stable reference', () => {
      const a = getActiveGyms();
      const b = getActiveGyms();
      expect(a).toBe(b);
      expect(a.length).toBe(10046);
    });

    it('getActiveCenters returns stable reference', () => {
      const a = getActiveCenters();
      const b = getActiveCenters();
      expect(a).toBe(b);
    });

    it('repeated getActiveGyms calls are near-zero overhead', () => {
      const t0 = Date.now();
      for (let i = 0; i < 10000; i++) getActiveGyms();
      expect(Date.now() - t0).toBeLessThan(50);
    });
  });

  describe('7. Search index caching', () => {
    it('cold index build then cached near-zero', () => {
      const coldMs = (() => {
        const t0 = Date.now();
        getGymSearchIndex(gyms);
        return Date.now() - t0;
      })();
      const cachedMs = (() => {
        const t0 = Date.now();
        getGymSearchIndex(gyms);
        return Date.now() - t0;
      })();
      expect(cachedMs).toBeLessThan(5);
      expect(coldMs).toBeLessThan(5000);
    });

    it('searchGyms reuses default index without per-query rebuild', () => {
      getGymSearchIndex(gyms);
      const t0 = Date.now();
      for (let i = 0; i < 20; i++) searchGyms('PureGym', {limit: 20});
      expect(Date.now() - t0).toBeLessThan(8000);
    });
  });

  describe('8. Global brand search (13 countries)', () => {
    const brandQueries: Array<[string, string, number, number, RegExp]> = [
      ['Denmark', 'PureGym', 55.67, 12.57, /^(?!se_|no_|de_|gb_)/],
      ['Sweden', 'Nordic Wellness', 59.33, 18.07, /^se_/],
      ['Norway', 'SATS', 59.91, 10.75, /^no_/],
      ['Germany', 'McFIT', 52.52, 13.41, /^de_/],
      ['United Kingdom', 'PureGym', 51.51, -0.13, /^gb_/],
      ['Finland', 'Fressi', 60.17, 24.94, /^fi_/],
      ['Netherlands', 'Basic-Fit', 52.37, 4.9, /^nl_/],
      ['France', 'Basic-Fit', 48.86, 2.35, /^fr_/],
      ['Spain', 'VivaGym', 40.42, -3.7, /^es_/],
      ['Italy', 'FITINN', 45.46, 9.19, /^it_/],
      ['Belgium', 'Basic-Fit', 50.85, 4.35, /^be_/],
      ['Poland', 'Zdrofit', 52.23, 21.01, /^pl_/],
      ['Austria', 'FITINN', 48.21, 16.37, /^at_/],
    ];

    it.each(brandQueries)(
      '%s brand %s returns local prefix',
      (_country, brand, lat, lng, prefixRe) => {
        const hits = searchGyms(brand, {limit: 30, userLat: lat, userLng: lng});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some(h => prefixRe.test(h.gym.id))).toBe(true);
      },
    );
  });

  describe('9. Global city search', () => {
    const cities: Array<[string, number, number, RegExp]> = [
      ['København', 55.67, 12.57, /./],
      ['Stockholm', 59.33, 18.07, /^se_/],
      ['Oslo', 59.91, 10.75, /^no_/],
      ['Berlin', 52.52, 13.41, /^de_/],
      ['London', 51.51, -0.13, /^gb_/],
      ['Helsinki', 60.17, 24.94, /^fi_/],
      ['Amsterdam', 52.37, 4.9, /^nl_/],
      ['Paris', 48.86, 2.35, /^fr_/],
      ['Madrid', 40.42, -3.7, /^es_/],
      ['Milano', 45.46, 9.19, /^it_/],
      ['Bruxelles', 50.85, 4.35, /^be_/],
      ['Warszawa', 52.23, 21.01, /^pl_/],
      ['Wien', 48.21, 16.37, /^at_/],
    ];

    it.each(cities)('%s returns local results', (city, lat, lng, prefixRe) => {
      const hits = searchGyms(city, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.length).toBeGreaterThan(0);
      if (prefixRe.source !== '.') {
        expect(hits.some(h => prefixRe.test(h.gym.id))).toBe(true);
      }
    });
  });

  describe('10. Diacritic normalization', () => {
    it.each([
      ['Tromso', 'tromso'],
      ['Munchen', 'munchen'],
      ['Lodz', 'lodz'],
      ['Wroclaw', 'wroclaw'],
      ['Wien', 'wien'],
      ['Vienna', 'vienna'],
      ['Strasse', 'strasse'],
    ])('%s normalizes for search', (input, expected) => {
      expect(normalizeGymSearchValue(input)).toBe(expected);
    });
  });

  describe('11. Multi-country postcodes', () => {
    it('Belgium 1000 and Austria 1010 both resolve without cross-confusion near local coords', () => {
      const be = searchGyms('1000', {limit: 20, userLat: 50.85, userLng: 4.35});
      const at = searchGyms('1010', {limit: 20, userLat: 48.21, userLng: 16.37});
      expect(be.some(h => h.gym.id.startsWith('be_'))).toBe(true);
      expect(at.some(h => h.gym.id.startsWith('at_'))).toBe(true);
    });

    it('Poland NN-NNN postcode search works', () => {
      const hits = searchGyms('00-001', {limit: 20, userLat: 52.23, userLng: 21.01});
      expect(hits.some(h => h.gym.id.startsWith('pl_'))).toBe(true);
    });
  });

  describe('12. Search typing stress', () => {
    it('progressive Berlin/London/Warsaw/Wien prefixes remain functional', () => {
      getGymSearchIndex(gyms);
      for (const seq of [
        ['ber', 'berl', 'berlin'],
        ['lon', 'lond', 'london'],
        ['wars', 'warsz', 'warszawa'],
        ['wi', 'wie', 'wien'],
      ]) {
        for (const q of seq) {
          const hits = searchGyms(q, {limit: 25});
          expect(hits.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('13. Worst-case search', () => {
    it('broad queries complete without error', () => {
      getGymSearchIndex(gyms);
      for (const q of ['fitness', 'gym', 'fit', 'a', 's', 'f']) {
        const t0 = Date.now();
        const hits = searchGyms(q, {limit: 20});
        expect(Date.now() - t0).toBeLessThan(5000);
        expect(Array.isArray(hits)).toBe(true);
      }
    });
  });

  describe('14. Nearest gym global', () => {
    const coords: Array<[string, number, number, string]> = [
      ['Copenhagen', 55.67, 12.57, 'Denmark'],
      ['Stockholm', 59.33, 18.07, 'Sweden'],
      ['Oslo', 59.91, 10.75, 'Norway'],
      ['Berlin', 52.52, 13.41, 'Germany'],
      ['London', 51.51, -0.13, 'United Kingdom'],
      ['Helsinki', 60.17, 24.94, 'Finland'],
      ['Amsterdam', 52.37, 4.9, 'Netherlands'],
      ['Paris', 48.86, 2.35, 'France'],
      ['Madrid', 40.42, -3.7, 'Spain'],
      ['Milan', 45.46, 9.19, 'Italy'],
      ['Brussels', 50.85, 4.35, 'Belgium'],
      ['Warsaw', 52.23, 21.01, 'Poland'],
      ['Vienna', 48.21, 16.37, 'Austria'],
    ];

    it.each(coords)('nearest in %s is local country', (_city, lat, lng, country) => {
      const t0 = Date.now();
      const nearest = findNearestGym(lat, lng, gyms);
      expect(Date.now() - t0).toBeLessThan(500);
      expect(nearest).not.toBeNull();
      expect(nearest!.country).toBe(country);
    });
  });

  describe('15. Coordinate invention safety', () => {
    it('modern countries do not invent coords except DK/SE legacy', () => {
      for (const country of [
        'Norway', 'Germany', 'United Kingdom', 'Finland', 'Netherlands',
        'France', 'Spain', 'Italy', 'Belgium', 'Poland', 'Austria',
      ]) {
        expect(allowsInventedCoordinates(country)).toBe(false);
      }
      expect(allowsInventedCoordinates('Denmark')).toBe(true);
      expect(allowsInventedCoordinates('Sweden')).toBe(true);
    });
  });

  describe('16. Map viewport isolation', () => {
    const dense: Array<[string, number, number]> = [
      ['London', 51.51, -0.13],
      ['Paris', 48.86, 2.35],
      ['Berlin', 52.52, 13.41],
      ['Vienna', 48.21, 16.37],
      ['Warsaw', 52.23, 21.01],
    ];

    it.each(dense)('%s viewport shows subset not full catalog', (_city, lat, lng) => {
      const mapCenters = gyms.map(g => ({
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
      }));
      const visible = filterMapCentersInRegion(mapCenters as any, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.4,
        longitudeDelta: 0.4,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(gyms.length);
    });
  });

  describe('17. 200m check-in global', () => {
    it('CHECK_IN_RADIUS_METERS = 200 unchanged', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([500, 250, 201])('%dm blocked/away', d => {
      expect(decideGeofenceAutoCheckout(d, null, Date.now()).action).toBe('set_away');
    });

    it.each([200, 199, 100, 10])('%dm inside/none', d => {
      const r = decideGeofenceAutoCheckout(d, null, Date.now());
      if (d === 200) {
        expect(r.action).not.toBe('set_away');
      } else {
        expect(r.action).toBe('none');
      }
    });

    it('multi-country gyms resolve check-in coords', () => {
      for (const id of ['gb_', 'de_', 'pl_', 'at_']) {
        const g = gyms.find(x => x.id.startsWith(id));
        expect(getGymLatLngForCheckIn(g!.id)).not.toBeNull();
      }
    });
  });

  describe('18. Known co-locations', () => {
    it('Poland Well/Zdrofit and Austria Salzburg co-location resolve independently', () => {
      expect(getGymLatLngForCheckIn('pl_3b16c7db04')).not.toBeNull();
      expect(getGymLatLngForCheckIn('pl_a8b07a3cbe')).not.toBeNull();
      expect(getGymLatLngForCheckIn('at_fad38fce91')).not.toBeNull();
      expect(getGymLatLngForCheckIn('at_af355944dd')).not.toBeNull();
    });
  });

  describe('19. Orphan ID safety', () => {
    it.each(['gb_nonexistent', 'de_nonexistent', 'it_nonexistent', 'pl_nonexistent', 'at_nonexistent'])(
      '%s → stub not catalog[0]',
      id => {
        expect(findGymById(id)).toBeNull();
        const stub = resolveGymOrStub(id);
        expect(stub.name).toBe('Unknown gym');
        expect(stub.id).toBe(id);
        expect(catalog[0]!.id).not.toBe(stub.id);
        expect(findGymByIdRelaxed(id)).toBeNull();
      },
    );

    it('unresolvedGymStub has no finite coords', () => {
      expect(Number.isFinite(unresolvedGymStub('at_fake').latitude)).toBe(false);
    });
  });

  describe('20. Country labels (13 countries)', () => {
    it('all 13 countries have translation keys', () => {
      for (const country of Object.keys(EXPECTED_COUNTS)) {
        expect(gymCountryTranslationKey(country)).toBeTruthy();
      }
    });

    it('Austria/Poland labels in en/da/sv/nb', () => {
      const tEn = createTranslator(en as any);
      const tDa = createTranslator(da as any);
      expect(formatGymCountryLabel('Austria', tEn)).toBe('Austria');
      expect(formatGymCountryLabel('Poland', tEn)).toBe('Poland');
      expect(tDa('countries.austria')).toBe('Østrig');
    });
  });

  describe('21. Bundle size sanity', () => {
    it('centers.json under 4MB', () => {
      const p = path.join(__dirname, '../src/data/centers.json');
      const bytes = fs.statSync(p).size;
      expect(bytes).toBeLessThan(4 * 1024 * 1024);
      expect(bytes).toBeGreaterThan(2 * 1024 * 1024);
    });
  });

  describe('22. Onboarding popular gyms (cosmetic)', () => {
    it('default popular list is DK-centric but search is global — no auto-selection', () => {
      const dkPopular = [
        'sats-2500-valby-torvegade-17',
        'puregym-2730-herlev-noerrelundvej-4',
      ];
      for (const id of dkPopular) {
        expect(findGymById(id)?.country).toBe('Denmark');
      }
      const intl = searchGyms('FITINN Wien', {limit: 5, userLat: 48.21, userLng: 16.37});
      expect(intl.some(h => h.gym.id.startsWith('at_'))).toBe(true);
    });
  });
});
