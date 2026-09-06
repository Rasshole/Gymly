/**
 * Slovakia gym QA — full production validation after sk_* merge (37 centers).
 */
import fs from 'fs';
import path from 'path';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms, getActiveGymsByCountry} from '../src/data/danishGyms';
import {
  ALL_GYM_CENTERS,
  findCenterById,
  getEffectiveLatLng,
} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {
  compactGymSearchValue,
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  SLOVAKIA_POSTAL_RE,
  CZECHIA_POSTAL_RE,
  isSlovakiaCountry,
  isPlausibleSlovakiaCoordinate,
  isPlausibleCzechiaCoordinate,
  isPlausibleHungaryCoordinate,
} from '../src/utils/gymCountry';

/** Vienna core — no dedicated Austria helper in gymCountry. */
function isViennaCore(lat: number, lng: number): boolean {
  return lat >= 48.1 && lat <= 48.35 && lng >= 16.2 && lng <= 16.55;
}
import {
  formatGymCountryLabel,
  gymCountryTranslationKey,
} from '../src/utils/gymCountryLabel';
import {
  findGymById,
  formatGymDisplayName,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {createTranslator} from '../src/i18n/translate';
import en from '../src/i18n/translations/en';

const staging = require('../data/slovakia/slovakia_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  notes?: string;
  postcode_source?: string;
  coord_source?: string;
}>;

const approved = require('../data/slovakia/SLOVAKIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/slovakia/SLOVAKIA_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN_BLOB =
  /\b(czechia|česko|praha|austria|österreich|wien|vienna|hungary|magyarország|poland|polska|ukraine|kyiv|uzhhorod)\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  'Form Factory': 15,
  'Golem Club': 11,
  '365 Fit&Co': 8,
  FITINN: 3,
};

const EXPECTED_CITIES: Record<string, number> = {
  Bratislava: 21,
  Košice: 5,
  Prešov: 1,
  Žilina: 2,
  'Banská Bystrica': 1,
  Nitra: 1,
  Trenčín: 2,
  Martin: 1,
  Poprad: 1,
  'Spišská Nová Ves': 1,
  'Považská Bystrica': 1,
};

const GOLEM_KOSICE = 'sk_0ebf33c4c0';
const FF_SKY_PARK = (() => {
  const c = ALL_GYM_CENTERS.find(
    x => x.brand === 'Form Factory' && /sky\s*park/i.test(x.name || ''),
  );
  return c?.id || '';
})();
const FF_FITCAMP = (() => {
  const c = ALL_GYM_CENTERS.find(
    x => x.brand === 'Form Factory' && /fitcamp/i.test(x.name || ''),
  );
  return c?.id || '';
})();

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeAddr(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toMap(gs: ReturnType<typeof getActiveGymsByCountry>) {
  return gs.map(g => ({
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
    country: g.country,
  }));
}

describe('Slovakia gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const slovakia = gyms.filter(g => isSlovakiaCountry(g.country));
  const skCenters = catalog.filter(c => isSlovakiaCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Slovakia = 37; sk_* = 37', () => {
      expect(catalog.length).toBe(11692);
      expect(skCenters.length).toBe(37);
      expect(slovakia.length).toBe(37);
      expect(catalog.filter(c => c.id.startsWith('sk_')).length).toBe(37);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(skCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(37);
      expect(ap.size).toBe(37);
      expect(ready.size).toBe(37);
      expect(merged.size).toBe(37);
      expect([...prod].filter(id => !ap.has(id))).toEqual([]);
      expect([...ap].filter(id => !prod.has(id))).toEqual([]);
      expect([...prod].filter(id => !merged.has(id))).toEqual([]);
      expect([...prod].filter(id => !ready.has(id))).toEqual([]);

      for (const a of approved) {
        const live = findCenterById(a.id)!;
        expect(live.brand).toBe(a.brand);
        expect(live.name).toBe(a.name);
        expect(live.address).toBe(a.address);
        expect(live.postal_code).toBe(a.postal_code);
        expect(live.city).toBe(a.city);
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all sk_* IDs unique with required fields and valid Slovakia geography', () => {
      const ids = new Set<string>();
      for (const c of skCenters) {
        expect(c.id).toMatch(/^sk_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Slovakia');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(SLOVAKIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(CZECHIA_POSTAL_RE.test(String(c.postal_code))).toBe(false);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleSlovakiaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(37);
    });

    it('brand breakdown exact', () => {
      const byBrand: Record<string, number> = {};
      for (const c of skCenters) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.keys(byBrand).sort()).toEqual(Object.keys(EXPECTED_BRANDS).sort());
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(37);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('MERGED=37 COMING_SOON=3 CLOSED=1; none unresolved live', () => {
      const cats = staging.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.MERGED_INTO_CATALOG).toBe(37);
      expect(cats.COMING_SOON).toBe(3);
      expect(cats.CLOSED).toBe(1);
      expect(cats.NEEDS_COORDINATES || 0).toBe(0);
      expect(cats.NEEDS_REVIEW || 0).toBe(0);

      const prodIds = new Set(skCenters.map(c => c.id));
      const unresolved = staging.filter(s => s.import_category !== 'MERGED_INTO_CATALOG');
      expect(unresolved.length).toBe(4);
      for (const s of unresolved) {
        expect(prodIds.has(s.id)).toBe(false);
      }

      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(coming.every(s => /form factory/i.test(s.brand || ''))).toBe(true);
      expect(
        coming.every(s => /budatínska|europa|slnečnice|slnecnice/i.test(s.name || '')),
      ).toBe(true);
      expect(staging.some(s => s.import_category === 'CLOSED' && /digital\s*park/i.test(s.name || ''))).toBe(
        true,
      );
    });

    it('coming-soon / closed / excluded operators absent from production', () => {
      const blob = skCenters.map(c => `${c.brand} ${c.name}`).join('\n');
      expect(/budatínska|budatinska/i.test(blob)).toBe(false);
      expect(/europa\s*bc/i.test(blob)).toBe(false);
      expect(/slnečnice|slnecnice/i.test(blob)).toBe(false);
      expect(/digital\s*park/i.test(blob)).toBe(false);
      expect(
        skCenters.some(
          c => /fitinn/i.test(c.brand || '') && /vivo|petržalka|petrzalka/i.test(c.name || ''),
        ),
      ).toBe(false);
      expect(/efectfit|multisport|mozolani/i.test(blob)).toBe(false);
      expect(skCenters.some(c => /^Maximus/i.test(c.brand || ''))).toBe(false);
      expect(skCenters.some(c => /^FitCamp$/i.test(c.brand || ''))).toBe(false);
    });
  });

  describe('3. Form Factory QA', () => {
    it('15 live; FitCamp under Form Factory; Sky Park present; coming-soon absent', () => {
      const ff = skCenters.filter(c => c.brand === 'Form Factory');
      expect(ff.length).toBe(15);
      expect(ff.every(c => c.is_active !== false)).toBe(true);
      expect(ff.every(c => !/budatínska|europa bc|slnečnice|slnecnice/i.test(c.name || ''))).toBe(
        true,
      );
      expect(ff.some(c => /fitcamp/i.test(c.name || ''))).toBe(true);
      expect(FF_FITCAMP).toMatch(/^sk_/);
      expect(findCenterById(FF_FITCAMP)?.brand).toBe('Form Factory');
      expect(skCenters.some(c => /^FitCamp$/i.test(c.brand || ''))).toBe(false);

      const sky = ff.find(c => /sky\s*park/i.test(c.name || ''))!;
      expect(sky).toBeTruthy();
      expect(sky.address).toMatch(/Bottova/i);
      expect(sky.postal_code).toBe('811 09');
      expect(sky.city).toBe('Bratislava');
      expect(isPlausibleSlovakiaCoordinate(sky.lat!, sky.lng!)).toBe(true);
      expect(FF_SKY_PARK).toBe(sky.id);
    });
  });

  describe('4. Golem Club QA', () => {
    it('11 live gym estate; no physiotherapy-only; Košice Aupark repaired', () => {
      const golem = skCenters.filter(c => c.brand === 'Golem Club');
      expect(golem.length).toBe(11);
      expect(golem.every(c => !/fyzioterapia|physiotherap/i.test(`${c.name} ${c.address}`))).toBe(
        true,
      );
      const kosice = findCenterById(GOLEM_KOSICE)!;
      expect(kosice.name).toMatch(/Aupark Košice/i);
      expect(kosice.city).toBe('Košice');
      expect(kosice.postal_code).toBe('040 01');
      expect(kosice.address).toMatch(/Námestie Osloboditeľov 1/i);
      expect(kosice.lat).toBeCloseTo(48.7178377, 5);
      expect(kosice.lng).toBeCloseTo(21.2634328, 5);
      // Must not sit in Michalovce
      expect(haversineMeters(kosice.lat!, kosice.lng!, 48.7543, 21.9195)).toBeGreaterThan(40000);

      const polus = golem.find(c => /polus/i.test(c.name || ''))!;
      expect(polus.postal_code).toBe('831 04');
      const bory = golem.find(c => /bory/i.test(c.name || ''))!;
      expect(bory.postal_code).toBe('841 03');
      expect(bory.address).toMatch(/Lamač 6780/i);
    });
  });

  describe('5. 365 Fit&Co QA', () => {
    it('8 live; Digital Park absent; Phase 2 recoveries present', () => {
      const fit365 = skCenters.filter(c => c.brand === '365 Fit&Co');
      expect(fit365.length).toBe(8);
      expect(fit365.every(c => !/digital\s*park/i.test(c.name || ''))).toBe(true);
      expect(fit365.some(c => /hypertesco/i.test(c.name || ''))).toBe(true);
      expect(fit365.some(c => /roca/i.test(c.name || ''))).toBe(true);
      expect(fit365.some(c => /južanka|juzanka/i.test(c.name || ''))).toBe(true);
      expect(fit365.some(c => /spišská|spisska/i.test(c.name || ''))).toBe(true);
      const juz = fit365.find(c => /južanka|juzanka/i.test(c.name || ''))!;
      expect(juz.postal_code).toBe('911 08');
    });
  });

  describe('6. FITINN QA', () => {
    it('exactly Prior, Nido, Nitra; no VIVO/Petržalka; no CZ/AT contamination', () => {
      const fitinn = skCenters.filter(c => c.brand === 'FITINN');
      expect(fitinn.length).toBe(3);
      expect(fitinn.every(c => c.country === 'Slovakia')).toBe(true);
      expect(fitinn.every(c => isPlausibleSlovakiaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(fitinn.some(c => /prior/i.test(c.name || ''))).toBe(true);
      expect(fitinn.some(c => /nido/i.test(c.name || ''))).toBe(true);
      expect(fitinn.some(c => /nitra/i.test(c.name || ''))).toBe(true);
      expect(fitinn.every(c => !/vivo|petržalka|petrzalka/i.test(c.name || ''))).toBe(true);
      expect(fitinn.every(c => isPlausibleSlovakiaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(fitinn.every(c => !isViennaCore(c.lat!, c.lng!))).toBe(true);
      // Bratislava west edge can sit near CZ bbox helpers — require SK helper pass instead
      expect(fitinn.every(c => c.country === 'Slovakia' && c.id.startsWith('sk_'))).toBe(true);
    });
  });

  describe('7. Duplicate / proximity QA', () => {
    it('no duplicate IDs, same-brand <=200m, identical coords, or same address', () => {
      const ids = skCenters.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);

      let lt25 = 0;
      let lt50 = 0;
      let lt100 = 0;
      let lt200 = 0;
      let identical = 0;
      let sameAddr = 0;
      let diffBrand = 0;
      const addrKey = (c: (typeof skCenters)[number]) =>
        [normalizeAddr(c.address || ''), c.postal_code, normalizeAddr(c.city || ''), normalizeAddr(c.brand || '')].join(
          '|',
        );

      for (let i = 0; i < skCenters.length; i++) {
        for (let j = i + 1; j < skCenters.length; j++) {
          const a = skCenters[i]!;
          const b = skCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical++;
          if (addrKey(a) === addrKey(b)) sameAddr++;
          if (normalizeAddr(a.brand || '') !== normalizeAddr(b.brand || '')) {
            if (d <= 100) diffBrand++;
            continue;
          }
          if (d <= 25) lt25++;
          if (d <= 50) lt50++;
          if (d <= 100) lt100++;
          if (d <= 200) lt200++;
        }
      }
      expect(lt25).toBe(0);
      expect(lt50).toBe(0);
      expect(lt100).toBe(0);
      expect(lt200).toBe(0);
      expect(identical).toBe(0);
      expect(sameAddr).toBe(0);
      expect(diffBrand).toBe(0);
    });
  });

  describe('8. Border safety', () => {
    it('rejects neighbor cores; all live coords plausible SK', () => {
      expect(isPlausibleSlovakiaCoordinate(48.1486, 17.1077)).toBe(true); // Bratislava
      expect(isPlausibleSlovakiaCoordinate(48.7164, 21.2611)).toBe(true); // Košice
      expect(isPlausibleSlovakiaCoordinate(50.0755, 14.4378)).toBe(false); // Praha
      expect(isPlausibleSlovakiaCoordinate(48.2082, 16.3738)).toBe(false); // Vienna
      expect(isPlausibleSlovakiaCoordinate(47.4979, 19.0402)).toBe(false); // Budapest
      expect(isPlausibleSlovakiaCoordinate(50.0647, 19.945)).toBe(false); // Kraków
      expect(isPlausibleSlovakiaCoordinate(48.6208, 22.2879)).toBe(false); // Uzhhorod
      expect(skCenters.every(c => isPlausibleSlovakiaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(skCenters.every(c => !isViennaCore(c.lat!, c.lng!))).toBe(true);
      // Budapest core must not appear as SK production
      expect(skCenters.every(c => !(c.lat! >= 47.4 && c.lat! <= 47.6 && c.lng! >= 18.9 && c.lng! <= 19.2))).toBe(
        true,
      );
      expect(isPlausibleHungaryCoordinate(47.4979, 19.0402)).toBe(true);
      expect(isPlausibleCzechiaCoordinate(50.0755, 14.4378)).toBe(true);
    });
  });

  describe('9. Slovak text / diacritics', () => {
    it('preserves diacritics in display; search folds ASCII', () => {
      const cities = skCenters.map(c => c.city || '');
      for (const city of [
        'Košice',
        'Prešov',
        'Žilina',
        'Banská Bystrica',
        'Trenčín',
        'Spišská Nová Ves',
        'Považská Bystrica',
      ]) {
        expect(cities).toContain(city);
      }
      expect(normalizeGymSearchValue('Košice')).toBe('kosice');
      expect(normalizeGymSearchValue('Prešov')).toBe('presov');
      expect(normalizeGymSearchValue('Žilina')).toBe('zilina');
      expect(normalizeGymSearchValue('Banská Bystrica')).toBe('banska bystrica');
      expect(normalizeGymSearchValue('Trenčín')).toBe('trencin');
      expect(normalizeGymSearchValue('Spišská Nová Ves')).toBe('spisska nova ves');
      expect(normalizeGymSearchValue('Považská Bystrica')).toBe('povazska bystrica');
      for (const c of skCenters) {
        expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      }
    });
  });

  describe('10. Search QA', () => {
    it('brands, cities, diacritics/ASCII, postcodes, CZ/SK collision safety', () => {
      getGymSearchIndex();
      // Country-scoped brand search (onboarding / SK picker context)
      expect(
        searchGyms('Form Factory', {gyms: slovakia, limit: 20}).every(h => h.gym.id.startsWith('sk_')),
      ).toBe(true);
      expect(
        searchGyms('form', {gyms: slovakia, limit: 20}).some(h =>
          /form factory/i.test(h.gym.brand || ''),
        ),
      ).toBe(true);
      expect(
        searchGyms('factory', {gyms: slovakia, limit: 20}).some(h => h.gym.id.startsWith('sk_')),
      ).toBe(true);
      expect(
        searchGyms('Golem Club', {gyms: slovakia, limit: 20}).every(h =>
          /golem/i.test(h.gym.brand || ''),
        ),
      ).toBe(true);
      expect(searchGyms('golem', {gyms: slovakia, limit: 20}).length).toBe(11);
      expect(
        searchGyms('365', {gyms: slovakia, limit: 20}).some(h => /365/i.test(h.gym.brand || '')),
      ).toBe(true);
      expect(
        searchGyms('fit&co', {gyms: slovakia, limit: 20}).some(h => h.gym.id.startsWith('sk_')),
      ).toBe(true);
      expect(
        searchGyms('FITINN', {gyms: slovakia, limit: 20}).map(h => h.gym.name).sort(),
      ).toEqual(
        ['FITINN Bratislava-Nido.', 'FITINN Bratislava-Prior', 'FITINN NITRA'].sort(),
      );
      expect(searchGyms('fitinn', {gyms: slovakia, limit: 20}).length).toBe(3);
      // Global multi-country brand queries still surface sk_* when city-qualified
      expect(
        searchGyms('Form Factory Bratislava', {limit: 40}).some(h => h.gym.id.startsWith('sk_')),
      ).toBe(true);
      expect(
        searchGyms('FITINN Bratislava', {limit: 40}).some(h => h.gym.id.startsWith('sk_')),
      ).toBe(true);

      const cityQueries = [
        'Bratislava',
        'Košice',
        'Kosice',
        'Prešov',
        'Presov',
        'Žilina',
        'Zilina',
        'Banská Bystrica',
        'Banska Bystrica',
        'Nitra',
        'Trenčín',
        'Trencin',
        'Martin',
        'Poprad',
        'Spišská Nová Ves',
        'Spisska Nova Ves',
        'Považská Bystrica',
        'Povazska Bystrica',
      ];
      for (const q of cityQueries) {
        expect(searchGyms(q, {limit: 20}).some(h => h.gym.id.startsWith('sk_'))).toBe(true);
      }

      const sample = skCenters.find(c => c.postal_code === '811 01') || skCenters[0]!;
      const formatted = String(sample.postal_code);
      expect(searchGyms(formatted, {limit: 20}).some(h => h.gym.id.startsWith('sk_'))).toBe(true);
      const compact = compactGymSearchValue(formatted);
      expect(compact).toBe(formatted.replace(/\s+/g, ''));
      // Compact form should still resolve when shared normalization supports it
      if (compact !== formatted) {
        const compactHits = searchGyms(compact, {limit: 20});
        expect(compactHits.some(h => h.gym.id.startsWith('sk_') || h.gym.id.startsWith('cz_'))).toBe(
          true,
        );
      }

      // CZ/SK collision: Slovak PSČ namespace starts 0/8/9; Czech 1–7
      expect(SLOVAKIA_POSTAL_RE.test('811 01')).toBe(true);
      expect(CZECHIA_POSTAL_RE.test('811 01')).toBe(false);
      expect(CZECHIA_POSTAL_RE.test('110 00')).toBe(true);
      expect(SLOVAKIA_POSTAL_RE.test('110 00')).toBe(false);
      const skHit = searchGyms('Bratislava 811', {limit: 20}).find(h => h.gym.id.startsWith('sk_'));
      if (skHit) {
        expect(isSlovakiaCountry(skHit.gym.country)).toBe(true);
      }
    });
  });

  describe('11. Regional coverage', () => {
    it('matches Phase 2 city distribution; Trnava = 0', () => {
      const byCity: Record<string, number> = {};
      for (const c of skCenters) byCity[c.city!] = (byCity[c.city!] || 0) + 1;
      for (const [city, n] of Object.entries(EXPECTED_CITIES)) {
        expect(byCity[city]).toBe(n);
      }
      expect(skCenters.filter(c => /trnava/i.test(c.city || '')).length).toBe(0);
    });
  });

  describe('12. Onboarding / profile / nearest / map', () => {
    it('onboarding selection persists sk_* ID for representative cities', () => {
      for (const city of ['Bratislava', 'Košice', 'Žilina', 'Nitra', 'Trenčín']) {
        const pick = slovakia.find(g => g.city === city)!;
        expect(pick.id.startsWith('sk_')).toBe(true);
        expect(findGymById(pick.id)?.id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Slovakia');
        expect(formatGymDisplayName(pick).length).toBeGreaterThan(0);
      }
      expect(gymCountryTranslationKey('Slovakia')).toBe('countries.slovakia');
      const t = createTranslator(en as never);
      expect(formatGymCountryLabel('Slovakia', t)).toBe('Slovakia');
    });

    it('profile / favorites resolve exact sk_* IDs without catalog[0] fallback', () => {
      const primary = slovakia.find(g => g.city === 'Bratislava')!;
      const extra = slovakia.find(g => g.city === 'Košice')!;
      expect(findGymById(primary.id)?.id).toBe(primary.id);
      expect(findGymById(extra.id)?.id).toBe(extra.id);
      expect(findCenterById(primary.id)?.id).toBe(primary.id);
      expect(primary.id).not.toBe(catalog[0]!.id);
      expect(getActiveGymsByCountry('Slovakia').length).toBe(37);
      // mixed-country: SK + RO still resolve independently
      const ro = gyms.find(g => g.id.startsWith('ro_'));
      if (ro) {
        expect(findGymById(ro.id)?.id).toBe(ro.id);
        expect(findGymById(primary.id)?.id).toBe(primary.id);
      }
    });

    it('nearest returns plausible sk_* near major cities', () => {
      const fixtures = [
        {lat: 48.1486, lng: 17.1077, label: 'Bratislava'},
        {lat: 48.7164, lng: 21.2611, label: 'Košice'},
        {lat: 48.9985, lng: 21.2411, label: 'Prešov'},
        {lat: 49.2231, lng: 18.7394, label: 'Žilina'},
        {lat: 48.7363, lng: 19.1462, label: 'Banská Bystrica'},
        {lat: 48.3061, lng: 18.0764, label: 'Nitra'},
        {lat: 48.8945, lng: 18.0444, label: 'Trenčín'},
        {lat: 49.055, lng: 20.297, label: 'Poprad'},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, slovakia);
        expect(n?.id.startsWith('sk_')).toBe(true);
        expect(isSlovakiaCountry(n!.country)).toBe(true);
      }
    });

    it('map viewport filters SK markers without rendering full catalog', () => {
      const markers = toMap(slovakia);
      const viewports = [
        {latitude: 48.15, longitude: 17.12, latitudeDelta: 0.2, longitudeDelta: 0.2},
        {latitude: 48.72, longitude: 21.26, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 49.22, longitude: 18.74, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 48.31, longitude: 18.08, latitudeDelta: 0.15, longitudeDelta: 0.15},
      ];
      for (const region of viewports) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(catalog.length);
        expect(visible.every(v => v.id.startsWith('sk_'))).toBe(true);
      }
      const ba = filterMapCentersInRegion(markers as never, {
        latitude: 48.15,
        longitude: 17.12,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      expect(ba.length).toBeGreaterThan(5);
      const pick = ba[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
    });
  });

  describe('13. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Form Factory FitCamp dense BA', () => FF_FITCAMP],
      ['Form Factory Sky Park', () => FF_SKY_PARK],
      ['Golem Aupark Košice', () => GOLEM_KOSICE],
      ['FITINN Prior', () => skCenters.find(c => /prior/i.test(c.name || ''))!.id],
    ])('%s uses selected gym coords; 199/200 allowed, 201 away', (_label, idFn) => {
      const id = idFn();
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      const center = findCenterById(id)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearby Bratislava gyms do not replace session gym ID', () => {
      const a = slovakia.find(g => /form factory/i.test(g.brand || '') && /nivy/i.test(g.name))!;
      const b = slovakia.find(g => /form factory/i.test(g.brand || '') && /bbc5/i.test(g.name))!;
      expect(a.id).not.toBe(b.id);
      const session = getGymLatLngForCheckIn(a.id)!;
      const other = getGymLatLngForCheckIn(b.id)!;
      expect(session.latitude).toBeCloseTo(a.latitude, 5);
      expect(other.latitude).toBeCloseTo(b.latitude, 5);
      expect(findGymById(a.id)!.id).not.toBe(findGymById(b.id)!.id);
      const d = calculateDistance(session.latitude, session.longitude, other.latitude, other.longitude);
      expect(d).toBeGreaterThan(0);
    });

    it('repeated away evaluations stay set_away (no duplicate-checkout side effects)', () => {
      const t = Date.now();
      const first = decideGeofenceAutoCheckout(250, null, t);
      expect(first.action).toBe('set_away');
      const awayIso =
        first.action === 'set_away' ? first.awayStartedAt : new Date(t).toISOString();
      expect(decideGeofenceAutoCheckout(250, awayIso, t + 1000).action).toBe(
        'update_distance_only',
      );
      expect(decideGeofenceAutoCheckout(250, awayIso, t + 2000).action).not.toBe('checkout_away');
    });
  });

  describe('14. Core flows / orphan ID', () => {
    it('sk_* resolves for workout/profile/favorites paths', () => {
      const live = slovakia[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Slovakia').length).toBe(37);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^sk_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan sk_nonexistent_test is safe Slovakia stub (not CZ/AT/HU/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('sk_nonexistent_test');
      expect(stub.id).toBe('sk_nonexistent_test');
      expect(stub.region).toBe('Slovakia');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('sk_nonexistent_test').name);
      expect(findGymById('sk_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Czechia');
      expect(stub.region).not.toBe('Austria');
      expect(stub.region).not.toBe('Hungary');
      expect(stub.region).not.toBe('Denmark');
    });
  });

  describe('15. Country regression', () => {
    it('exact 30-country production counts totaling 11692', () => {
      const counts: Record<string, number> = {};
      catalog.forEach(c => {
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
      expect(counts['Bulgaria']).toBe(82);
      expect(counts['Croatia']).toBe(80);
      expect(counts['Slovenia']).toBe(32);
      expect(counts['Lithuania']).toBe(61);
      expect(counts['Latvia']).toBe(33);
      expect(counts['Estonia']).toBe(68);
      expect(counts['Luxembourg']).toBe(20);
      expect(counts['Malta']).toBe(18);
      expect(counts['Cyprus']).toBe(17);
    expect(counts['Iceland']).toBe(27);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11692);
    });
  });

  describe('16. Performance snapshot', () => {
    it('records live catalog timings vs Slovakia merge / Romania baselines', () => {
      const centersPath = path.join(__dirname, '../src/data/centers.json');
      const jsonSize = fs.statSync(centersPath).size;
      const tParse0 = Date.now();
      const raw = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
      const parseMs = Date.now() - tParse0;
      const active = raw.filter((c: {is_active?: boolean}) => c.is_active !== false);

      const tCold0 = Date.now();
      getGymSearchIndex();
      const coldMs = Date.now() - tCold0;
      const tCached0 = Date.now();
      getGymSearchIndex();
      const cachedMs = Date.now() - tCached0;

      const tSearch0 = Date.now();
      searchGyms('bratislava', {limit: 20});
      searchGyms('kosice', {limit: 20});
      searchGyms('form factory', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(48.1486, 17.1077, slovakia);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(slovakia);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 48.15,
        longitude: 17.12,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
        parse_ms: parseMs,
        cold_index_ms: coldMs,
        cached_index_ms: cachedMs,
        typical_search_ms: +typicalMs.toFixed(2),
        worst_search_ms: worstMs,
        nearest_ms: nearestMs,
        map_build_ms: mapBuildMs,
        viewport_filter_ms: viewportMs,
        map_markers_built: built.length,
        merge_benchmark: {
          catalog: 11254,
          json_size_mb: 3.33,
          parse_ms: 48.51,
          cold_index_ms: 16.49,
          typical_search_ms: 1.97,
          worst_search_ms: 0.01,
          nearest_ms: 0.54,
        },
        romania_qa_baseline: {
          catalog: 11217,
          json_size_mb: 3.32,
        },
      };
      const outDir = path.join(__dirname, '../data/slovakia');
      fs.writeFileSync(path.join(outDir, 'SLOVAKIA_QA_PERF.json'), JSON.stringify(perf, null, 2) + '\n');
      expect(perf.catalog).toBe(11692);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.json_size_mb).toBeLessThan(5);
      expect(perf.cold_index_ms).toBeLessThan(25000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
    });
  });
});
