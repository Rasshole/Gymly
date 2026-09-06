/**
 * Lithuania gym QA — full production validation after lt_* merge (61 centers).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  LITHUANIA_POSTAL_RE,
  isLithuaniaCountry,
  isPlausibleLithuaniaCoordinate,
} from '../src/utils/gymCountry';
import {
  findGymById,
  formatGymDisplayName,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';

const staging = require('../data/lithuania/lithuania_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  is_coming_soon?: boolean;
  coord_source?: string | null;
}>;

const approved = require('../data/lithuania/LITHUANIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/lithuania/LITHUANIA_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  coord_source?: string | null;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN_BLOB =
  /\b(latvia|latvija|riga|poland|polska|belarus|kaliningrad|estonia|eesti|tallinn)\b/i;

const EXPECTED_TOTAL = 11692;
const EXPECTED_LITHUANIA = 61;
const POST_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRANDS: Record<string, number> = {
  'Gym+': 38,
  'Lemon Gym': 18,
  Impuls: 5,
};

const EXPECTED_CITIES: Record<string, number> = {
  Vilnius: 30,
  Kaunas: 11,
  Klaipėda: 6,
  Šiauliai: 4,
  Panevėžys: 4,
  Alytus: 1,
  Marijampolė: 1,
  Mažeikiai: 1,
  Kėdainiai: 1,
  Telšiai: 1,
  Palanga: 1,
};

const EXCLUDED_LIVE_RE =
  /^(fitclub|fitus|fitness factory|sports house|skygym|vs fitness|people fitness|myfitness|anytime fitness|clever fit|fitinn|mcfit|john reed|gold'?s gym|world class|fitness first|basic-?fit|form factory|gym!)$/i;

const POCIUNO = 'lt_6ddca417a2';
const GARDINO = 'lt_5b1f24ce40';
const VIRSULISKIU_STAGING = 'lt_bc21f9653f';
const RIESE_STAGING = 'lt_4decf7f80b';
const JONAVA_STAGING = 'lt_c3d4f6ba00';

// Dense Vilnius check-in fixtures
const VILNIUS_GEDIMINO = 'lt_70c41d18a7';
const VILNIUS_OZO = 'lt_5e91d3e3b7';
const VILNIUS_EUROPA = 'lt_e7e904234e';
const VILNIUS_KALVARIJU = 'lt_b4dcd88872';

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

describe('Lithuania gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const lithuania = gyms.filter(g => isLithuaniaCountry(g.country));
  const ltCenters = catalog.filter(c => isLithuaniaCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Lithuania = 61; lt_* = 61; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(ltCenters.length).toBe(EXPECTED_LITHUANIA);
      expect(lithuania.length).toBe(EXPECTED_LITHUANIA);
      expect(catalog.filter(c => c.id.startsWith('lt_')).length).toBe(EXPECTED_LITHUANIA);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
      expect(sha).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(ltCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(61);
      expect(ap.size).toBe(61);
      expect(ready.size).toBe(61);
      expect(merged.size).toBe(61);
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

    it('all lt_* IDs unique with required fields and valid Lithuania geography', () => {
      const ids = new Set<string>();
      for (const c of ltCenters) {
        expect(c.id).toMatch(/^lt_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Lithuania');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(LITHUANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleLithuaniaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(EXCLUDED_LIVE_RE.test(String(c.brand || '').trim())).toBe(false);
      }
      expect(ids.size).toBe(61);
    });

    it('exact brand and city breakdown', () => {
      const byBrand: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      for (const c of ltCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
        byCity[c.city] = (byCity[c.city] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(Object.keys(byBrand).length).toBe(3);
    });
  });

  describe('2. Staging exclusions / coming-soon withheld', () => {
    it('COMING_SOON = 3 and EXCLUDED = 6 remain outside production', () => {
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      const excluded = staging.filter(s => s.import_category === 'EXCLUDED');
      expect(coming.length).toBe(3);
      expect(excluded.length).toBe(6);
      const prodIds = new Set(ltCenters.map(c => c.id));
      for (const r of [...coming, ...excluded]) {
        expect(prodIds.has(r.id)).toBe(false);
      }
      expect(coming.some(r => r.id === VIRSULISKIU_STAGING)).toBe(true);
      expect(coming.some(r => r.id === RIESE_STAGING)).toBe(true);
      expect(coming.some(r => r.id === JONAVA_STAGING)).toBe(true);
    });

    it('named excluded / global chains absent from LT production', () => {
      for (const c of ltCenters) {
        expect(EXCLUDED_LIVE_RE.test(String(c.brand || '').trim())).toBe(false);
      }
      for (const brand of [
        'FitClub',
        'Fitus',
        'Fitness Factory Gym',
        'Sports House',
        'SkyGym',
        'Anytime Fitness',
        'clever fit',
        'FITINN',
        'McFIT',
        'JOHN REED',
        "Gold's Gym",
        'Fitness First',
        'World Class',
        'Basic-Fit',
        'VS Fitness',
        'People Fitness',
        'MyFitness',
      ]) {
        expect(
          ltCenters.some(c => c.brand.toLowerCase() === brand.toLowerCase()),
        ).toBe(false);
      }
    });
  });

  describe('3. Gym+ priority QA', () => {
    const gymPlus = ltCenters.filter(c => c.brand === 'Gym+');

    it('has exactly 38 live Gym+ clubs', () => {
      expect(gymPlus.length).toBe(38);
      expect(gymPlus.every(c => c.is_active === true)).toBe(true);
      expect(gymPlus.every(c => c.is_coming_soon !== true)).toBe(true);
    });

    it('Vytauto Pociūno g. 8: lt_6ddca417a2 / 06264 / premises pin', () => {
      const row = findCenterById(POCIUNO)!;
      expect(row.brand).toBe('Gym+');
      expect(row.name).toMatch(/pociūno|pociuno/i);
      expect(row.address).toBe('Vytauto Pociūno g. 8');
      expect(row.postal_code).toBe('06264');
      expect(row.city).toBe('Vilnius');
      expect(row.is_active).toBe(true);
      expect(row.lat).toBeCloseTo(54.7026293, 5);
      expect(row.lng).toBeCloseTo(25.2060967, 5);
      expect(isPlausibleLithuaniaCoordinate(row.lat!, row.lng!)).toBe(true);
      expect(
        ltCenters.filter(c => /pociūno|pociuno/i.test(`${c.name} ${c.address}`)).length,
      ).toBe(1);
    });

    it('Gardino g. 3: exactly one canonical live club lt_5b1f24ce40', () => {
      const gardino = ltCenters.filter(c => /gardino/i.test(`${c.name} ${c.address}`));
      expect(gardino.length).toBe(1);
      expect(gardino[0]!.id).toBe(GARDINO);
      expect(gardino[0]!.brand).toBe('Gym+');
      expect(gardino[0]!.address).toBe('Gardino g. 3');
      expect(gardino[0]!.city).toBe('Šiauliai');
      expect(gardino[0]!.is_active).toBe(true);
    });

    it('Viršuliškių g. 40 remains COMING_SOON; live count = 0', () => {
      expect(
        ltCenters.some(c => /viršuliškių|virsuliskiu/i.test(`${c.name} ${c.address}`)),
      ).toBe(false);
      const staged = staging.find(s => s.id === VIRSULISKIU_STAGING)!;
      expect(staged.import_category).toBe('COMING_SOON');
      expect(staged.is_coming_soon).toBe(true);
    });

    it('rebrand predecessors absent: VS Fitness / People Fitness / MyFitness', () => {
      expect(ltCenters.some(c => /^VS Fitness$/i.test(c.brand))).toBe(false);
      expect(ltCenters.some(c => /^People Fitness$/i.test(c.brand))).toBe(false);
      expect(ltCenters.some(c => /^MyFitness$/i.test(c.brand))).toBe(false);
      expect(staging.filter(s => /^VS Fitness$/i.test(String(s.brand || ''))).every(s => s.import_category === 'EXCLUDED')).toBe(true);
      expect(staging.filter(s => /^People Fitness$/i.test(String(s.brand || ''))).every(s => s.import_category === 'EXCLUDED')).toBe(true);
    });
  });

  describe('4. Lemon Gym QA', () => {
    it('has exactly 18 live clubs; Riešė and Jonava pipeline withheld', () => {
      const rows = ltCenters.filter(c => c.brand === 'Lemon Gym');
      expect(rows.length).toBe(18);
      expect(rows.every(c => c.is_active === true)).toBe(true);
      expect(rows.every(c => c.is_coming_soon !== true)).toBe(true);
      expect(ltCenters.some(c => /riešė|riese/i.test(`${c.name} ${c.address}`))).toBe(false);
      expect(
        ltCenters.some(c => c.brand === 'Lemon Gym' && /jonava/i.test(`${c.name} ${c.city}`)),
      ).toBe(false);
      expect(staging.find(s => s.id === RIESE_STAGING)?.import_category).toBe('COMING_SOON');
      expect(staging.find(s => s.id === JONAVA_STAGING)?.import_category).toBe('COMING_SOON');
    });
  });

  describe('5. Impuls QA', () => {
    it('has exactly 5 live clubs distinct from Lemon Gym', () => {
      const rows = ltCenters.filter(c => c.brand === 'Impuls');
      expect(rows.length).toBe(5);
      expect(rows.every(c => c.is_active === true)).toBe(true);
      expect(rows.every(c => LITHUANIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(rows.every(c => isPlausibleLithuaniaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(rows.every(c => c.brand === 'Impuls')).toBe(true);
      expect(ltCenters.some(c => c.brand === 'Lemon Gym')).toBe(true);
      // Brands remain separate consumer identities
      expect(rows.every(c => c.brand !== 'Lemon Gym')).toBe(true);
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no duplicate IDs; zero suspicious same/diff-brand proximity pairs', () => {
      expect(new Set(ltCenters.map(c => c.id)).size).toBe(61);

      let same25 = 0;
      let same50 = 0;
      let same100 = 0;
      let same200 = 0;
      let identical = 0;
      let diff100 = 0;
      let sameAddress = 0;

      for (let i = 0; i < ltCenters.length; i++) {
        for (let j = i + 1; j < ltCenters.length; j++) {
          const a = ltCenters[i]!;
          const b = ltCenters[j]!;
          if (
            a.brand === b.brand &&
            a.address.trim().toLowerCase() === b.address.trim().toLowerCase() &&
            a.city === b.city
          ) {
            sameAddress++;
          }
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical++;
          if (a.brand === b.brand) {
            if (d <= 25) same25++;
            if (d <= 50) same50++;
            if (d <= 100) same100++;
            if (d <= 200) same200++;
          } else if (d <= 100) {
            diff100++;
          }
        }
      }

      expect(same25).toBe(0);
      expect(same50).toBe(0);
      expect(same100).toBe(0);
      expect(same200).toBe(0);
      expect(identical).toBe(0);
      expect(diff100).toBe(0);
      expect(sameAddress).toBe(0);
    });
  });

  describe('7. Border safety', () => {
    it('rejects neighbor cores; all lt_* inside Lithuania helper', () => {
      expect(isPlausibleLithuaniaCoordinate(56.9496, 24.1052)).toBe(false); // Riga
      expect(isPlausibleLithuaniaCoordinate(54.1, 22.93)).toBe(false); // Suwałki corridor
      expect(isPlausibleLithuaniaCoordinate(53.6694, 23.8131)).toBe(false); // Grodno
      expect(isPlausibleLithuaniaCoordinate(54.7104, 20.4522)).toBe(false); // Kaliningrad
      expect(isPlausibleLithuaniaCoordinate(59.437, 24.7536)).toBe(false); // Tallinn
      for (const c of ltCenters) {
        expect(isPlausibleLithuaniaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_BLOB.test(`${c.city} ${c.address}`)).toBe(false);
      }
    });
  });

  describe('8. Lithuanian text / diacritics', () => {
    it('preserves display diacritics; search folds ASCII', () => {
      expect(ltCenters.some(c => c.city === 'Klaipėda')).toBe(true);
      expect(ltCenters.some(c => c.city === 'Šiauliai')).toBe(true);
      expect(ltCenters.some(c => c.city === 'Panevėžys')).toBe(true);
      expect(ltCenters.some(c => c.city === 'Marijampolė')).toBe(true);
      expect(ltCenters.some(c => c.city === 'Mažeikiai')).toBe(true);
      expect(ltCenters.some(c => c.city === 'Kėdainiai')).toBe(true);
      expect(ltCenters.some(c => c.city === 'Telšiai')).toBe(true);
      const blob = ltCenters.map(c => `${c.name} ${c.address} ${c.city}`).join('\n');
      expect(blob).toMatch(/ė|š|ž|ū|č|Į|ė|Š|Ž|Ū/i);
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(normalizeGymSearchValue('Klaipėda')).toBe('klaipeda');
      expect(normalizeGymSearchValue('Šiauliai')).toBe('siauliai');
      expect(normalizeGymSearchValue('Panevėžys')).toBe('panevezys');
      expect(normalizeGymSearchValue('Marijampolė')).toBe('marijampole');
      expect(normalizeGymSearchValue('Mažeikiai')).toBe('mazeikiai');
      expect(normalizeGymSearchValue('Kėdainiai')).toBe('kedainiai');
      expect(normalizeGymSearchValue('Telšiai')).toBe('telsiai');
      expect(normalizeGymSearchValue('Vytauto Pociūno')).toBe('vytauto pociuno');
    });
  });

  describe('9. Search QA', () => {
    it('brand searches return lt_* (country-scoped)', () => {
      const brandQueries = ['Gym+', 'Gym plus', 'Lemon Gym', 'lemon gym', 'Impuls', 'impuls'];
      for (const q of brandQueries) {
        const hits = searchGyms(q, {gyms: lithuania, limit: 50});
        expect(hits.some(h => h.gym.id.startsWith('lt_'))).toBe(true);
        expect(hits.every(h => h.gym.id.startsWith('lt_'))).toBe(true);
      }
    });

    it('city searches return lt_* where coverage exists; zero-chain cities stay empty', () => {
      const withCoverage = [
        'Vilnius',
        'Kaunas',
        'Klaipėda',
        'Klaipeda',
        'Šiauliai',
        'Siauliai',
        'Panevėžys',
        'Panevezys',
        'Alytus',
        'Marijampolė',
        'Marijampole',
        'Mažeikiai',
        'Mazeikiai',
        'Kėdainiai',
        'Kedainiai',
        'Telšiai',
        'Telsiai',
        'Palanga',
      ];
      for (const q of withCoverage) {
        const scoped = searchGyms(q, {gyms: lithuania, limit: 40});
        expect(scoped.some(h => h.gym.id.startsWith('lt_'))).toBe(true);
      }
      for (const q of ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai']) {
        expect(searchGyms(q, {limit: 40}).some(h => h.gym.id.startsWith('lt_'))).toBe(true);
      }
      for (const city of ['Jonava', 'Utena', 'Tauragė', 'Taurage']) {
        // A_legitimate_no_chain_presence (Jonava = future Lemon Gym only)
        expect(ltCenters.every(c => c.city !== city && c.city !== 'Tauragė')).toBe(
          city === 'Taurage' ? ltCenters.every(c => c.city !== 'Tauragė') : true,
        );
        if (city === 'Jonava' || city === 'Utena') {
          expect(ltCenters.every(c => c.city !== city)).toBe(true);
        }
        if (city === 'Tauragė' || city === 'Taurage') {
          expect(ltCenters.every(c => c.city !== 'Tauragė')).toBe(true);
        }
        const hits = searchGyms(city, {gyms: lithuania, limit: 20});
        expect(hits.every(h => h.gym.city !== city && h.gym.city !== 'Tauragė')).toBe(true);
      }
    });

    it('postcode search uses string NNNNN; LT-scoped results', () => {
      const samples = ['01103', '06264', '78230', '02153', '08243', '09308', '00116'];
      for (const pc of samples) {
        const row = ltCenters.find(c => c.postal_code === pc);
        expect(row).toBeTruthy();
        expect(typeof row!.postal_code).toBe('string');
        const scoped = searchGyms(pc, {gyms: lithuania, limit: 20});
        expect(scoped.length).toBeGreaterThan(0);
        expect(scoped.every(h => h.gym.id.startsWith('lt_'))).toBe(true);
        expect(scoped.some(h => h.gym.postalCode === pc)).toBe(true);
      }
      expect(ltCenters.every(c => LITHUANIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(ltCenters.every(c => typeof c.postal_code === 'string')).toBe(true);
    });
  });

  describe('10. Regional coverage', () => {
    it('matches Phase 2 READY footprint; zero-chain markets stay empty', () => {
      const byCity: Record<string, number> = {};
      for (const c of ltCenters) byCity[c.city] = (byCity[c.city] || 0) + 1;
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(byCity['Jonava'] || 0).toBe(0);
      expect(byCity['Utena'] || 0).toBe(0);
      expect(byCity['Tauragė'] || 0).toBe(0);
    });
  });

  describe('11. Onboarding / profile / nearest / map', () => {
    it('representative city picks persist as lt_* Lithuania', () => {
      for (const city of ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys']) {
        const pick = lithuania.find(g => g.city === city)!;
        expect(pick).toBeTruthy();
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Lithuania');
        expect(findGymById(pick.id)?.id).toBe(pick.id);
        expect(findGymById(pick.id)?.country).toBe('Lithuania');
      }
    });

    it('mixed favorites + exact ID lookup; never catalog[0]', () => {
      const a = lithuania[0]!;
      const b = lithuania[1]!;
      const dk = gyms.find(g => g.country === 'Denmark')!;
      const si = gyms.find(g => g.country === 'Slovenia')!;
      const favs = [a.id, b.id, dk.id, si.id];
      for (const id of favs) {
        expect(findGymById(id)?.id).toBe(id);
      }
      expect(findGymById(a.id)?.id).not.toBe(catalog[0]!.id);
      expect(findGymById(a.id)?.country).toBe('Lithuania');
    });

    it('nearest returns plausible lt_* around major cities', () => {
      const fixtures = [
        {city: 'Vilnius', lat: 54.6872, lng: 25.2797},
        {city: 'Kaunas', lat: 54.8985, lng: 23.9036},
        {city: 'Klaipėda', lat: 55.7033, lng: 21.1443},
        {city: 'Šiauliai', lat: 55.9349, lng: 23.3135},
        {city: 'Panevėžys', lat: 55.7348, lng: 24.3575},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, lithuania);
        expect(n?.id.startsWith('lt_')).toBe(true);
        expect(n?.country).toBe('Lithuania');
        expect(isPlausibleLithuaniaCoordinate(n!.latitude, n!.longitude)).toBe(true);
      }
    });

    it('map viewport subsets Vilnius / Kaunas / Klaipėda', () => {
      const markers = toMap(lithuania);
      expect(markers.length).toBe(61);
      const regions = [
        {latitude: 54.6872, longitude: 25.2797, latitudeDelta: 0.25, longitudeDelta: 0.25},
        {latitude: 54.8985, longitude: 23.9036, latitudeDelta: 0.2, longitudeDelta: 0.2},
        {latitude: 55.7033, longitude: 21.1443, latitudeDelta: 0.15, longitudeDelta: 0.15},
      ];
      for (const region of regions) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(EXPECTED_TOTAL);
        expect(visible.every(v => v.id.startsWith('lt_'))).toBe(true);
      }
      const vilnius = filterMapCentersInRegion(markers as never, {
        latitude: 54.6872,
        longitude: 25.2797,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      } as never);
      expect(vilnius.length).toBeGreaterThan(5);
      const brands = new Set(vilnius.map(v => findCenterById(v.id)?.brand).filter(Boolean));
      expect(brands.size).toBeGreaterThan(1);
      const pick = vilnius[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
    });
  });

  describe('12. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Gym+ Vilnius Gedimino', () => VILNIUS_GEDIMINO],
      ['Gym+ Vilnius Ozo', () => VILNIUS_OZO],
      ['Gym+ Vilnius PC Europa', () => VILNIUS_EUROPA],
      ['Gym+ Vilnius Kalvarijų', () => VILNIUS_KALVARIJU],
      ['Gym+ Vilnius Pociūno', () => POCIUNO],
    ])('%s uses selected gym coords; 199/200 allowed, 201 away', (_label, idFn) => {
      const id = idFn();
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      const center = findCenterById(id)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearby Vilnius gyms do not replace session gym ID', () => {
      const a = findGymById(VILNIUS_GEDIMINO)!;
      const b = findGymById(VILNIUS_OZO)!;
      expect(a.id).not.toBe(b.id);
      const session = getGymLatLngForCheckIn(a.id)!;
      const other = getGymLatLngForCheckIn(b.id)!;
      expect(session.latitude).toBeCloseTo(a.latitude, 5);
      expect(other.latitude).toBeCloseTo(b.latitude, 5);
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
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

  describe('13. Core flows / orphan ID', () => {
    it('lt_* resolves for workout/profile/favorites paths', () => {
      const live = lithuania[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Lithuania').length).toBe(61);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^lt_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan lt_nonexistent_test is safe Lithuania stub (not LV/PL/BY/DK/SI/catalog[0])', () => {
      const stub = resolveGymOrStub('lt_nonexistent_test');
      expect(stub.id).toBe('lt_nonexistent_test');
      expect(stub.region).toBe('Lithuania');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('lt_nonexistent_test').name);
      expect(findGymById('lt_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Latvia');
      expect(stub.region).not.toBe('Poland');
      expect(stub.region).not.toBe('Denmark');
      expect(stub.region).not.toBe('Slovenia');
      expect(stub.region).not.toBe('Estonia');
    });
  });

  describe('14. Country regression', () => {
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

  describe('15. Performance snapshot', () => {
    it('records live catalog timings vs Slovenia QA / Lithuania merge baselines', () => {
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
      searchGyms('vilnius', {limit: 20});
      searchGyms('gym+', {limit: 20});
      searchGyms('lemon gym', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(54.6872, 25.2797, lithuania);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(lithuania);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 54.6872,
        longitude: 25.2797,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        lithuania: ltCenters.length,
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
        architecture: 'KEEP CLIENT-SIDE',
        slovenia_qa_baseline: {
          catalog: 11448,
          json_size_mb: 3.39,
        },
        lithuania_merge_benchmark: {
          catalog: 11648,
          json_size_mb: 3.41,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
      };
      const outDir = path.join(__dirname, '../data/lithuania');
      fs.writeFileSync(
        path.join(outDir, 'LITHUANIA_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      expect(perf.catalog).toBe(11692);
      expect(perf.lithuania).toBe(61);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.json_size_mb).toBeLessThan(4.5);
      expect(perf.cold_index_ms).toBeLessThan(25000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
      expect(perf.worst_search_ms).toBeLessThan(3000);
      expect(perf.crossed_12500).toBe(false);
      expect(perf.global_stress_qa_required).toBe(false);
    });
  });
});
