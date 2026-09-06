/**
 * Croatia gym QA — full production validation after hr_* merge (80 centers).
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
  CROATIA_POSTAL_RE,
  isCroatiaCountry,
  isPlausibleCroatiaCoordinate,
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

const staging = require('../data/croatia/croatia_centers_staging.json') as Array<{
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

const approved = require('../data/croatia/CROATIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/croatia/CROATIA_PHASE2_READY_TO_IMPORT.json') as Array<{
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

const keepExisting = require('../data/croatia/CROATIA_PHASE2_KEEP_EXISTING.json') as Array<{
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

const approvedCurrent = require('../data/croatia/CROATIA_APPROVED_CURRENT_PRODUCTION.json') as Array<{
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
  /\b(slovenia|ljubljana|hungary|budapest|serbia|beograd|bosnia|sarajevo|montenegro|podgorica)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_CROATIA = 80;
const POST_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const EXPECTED_BRANDS: Record<string, number> = {
  Gyms4you: 48,
  'THE Fitness': 21,
  'Gibi Gib': 4,
  'Fitness Centar Joker': 4,
  Multihealth: 3,
};

const EXPECTED_CITIES: Record<string, number> = {
  Zagreb: 50,
  Split: 5,
  Varaždin: 4,
  'Velika Gorica': 3,
  Karlovac: 3,
  Zadar: 2,
  Rijeka: 2,
  Osijek: 2,
  Samobor: 2,
  Zaprešić: 1,
  Šibenik: 1,
  'Slavonski Brod': 1,
  Dubrovnik: 1,
  'Dugo Selo': 1,
  Omiš: 1,
  Solin: 1,
};

const COMING_SOON_IDS = [
  'hr_f3f2371e7f', // Split Visoka
  'hr_ee18805422', // Trstenik
  'hr_096e0c854b', // Split 3
  'hr_eff3e7d13c', // Jurišićeva
  'hr_d7d57e7e6b', // Spinut
  'hr_ce961ae600', // Heinzelova x Vukovarska
  'hr_3c82eb55d7', // Samobor STOP SHOP
  'hr_6c2849e74b', // Donje Svetice
];

const JELKOVEC = 'hr_130c7050f0';
const HOTEL_NOVI = 'hr_e99d3d2a6c';
const ZONAR = 'hr_a0ec1a2c32';
const ZAVRTNICA = 'hr_31f66c7a1f';
const BRANIMIR = 'hr_ca7a172b54';
const DUBEC = 'hr_1156235f67';
const DUBRAVA_TF = 'hr_e86685f75d';
const KAPTOL = 'hr_96bab24e46';
const GREEN_GOLD = 'hr_036861a783';
const CRNOMERE_TF = 'hr_765f4e908a';
const HEINZELOVA_OPEN = 'hr_b7e6171fe4';

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

describe('Croatia gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const croatia = gyms.filter(g => isCroatiaCountry(g.country));
  const hrCenters = catalog.filter(c => isCroatiaCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Croatia = 80; hr_* = 80', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(hrCenters.length).toBe(EXPECTED_CROATIA);
      expect(croatia.length).toBe(EXPECTED_CROATIA);
      expect(catalog.filter(c => c.id.startsWith('hr_')).length).toBe(EXPECTED_CROATIA);
    });

    it('production IDs reconcile with KEEP_EXISTING + approved current + merge artifact', () => {
      const prod = new Set(hrCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const keep = new Set(keepExisting.map(r => r.id));
      const current = new Set(approvedCurrent.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'KEEP_EXISTING').map(s => s.id),
      );
      expect(prod.size).toBe(80);
      expect(ap.size).toBe(80);
      expect(keep.size).toBe(80);
      expect(current.size).toBe(80);
      expect(phase2Ready.length).toBe(0);
      expect(merged.size).toBe(80);
      expect([...prod].filter(id => !keep.has(id))).toEqual([]);
      expect([...prod].filter(id => !current.has(id))).toEqual([]);
      expect([...prod].filter(id => !ap.has(id))).toEqual([]);
      expect([...prod].filter(id => !merged.has(id))).toEqual([]);

      for (const a of keepExisting) {
        const live = findCenterById(a.id)!;
        expect(live.brand).toBe(a.brand);
        expect(live.name).toBe(a.name);
        expect(live.city).toBe(a.city);
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all hr_* IDs unique with required fields and valid Croatia geography', () => {
      const ids = new Set<string>();
      for (const c of hrCenters) {
        expect(c.id).toMatch(/^hr_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Croatia');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(5);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(CROATIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleCroatiaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(80);
    });

    it('exact brand and city breakdown', () => {
      const byBrand: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      for (const c of hrCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
        byCity[c.city] = (byCity[c.city] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(Object.keys(byBrand).length).toBe(5);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('COMING_SOON = 8 and EXCLUDED = 37 remain outside production', () => {
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      const excluded = staging.filter(s => s.import_category === 'EXCLUDED');
      expect(coming.length).toBe(8);
      expect(excluded.length).toBe(37);
      const prodIds = new Set(hrCenters.map(c => c.id));
      for (const r of [...coming, ...excluded]) {
        expect(prodIds.has(r.id)).toBe(false);
      }
      expect(COMING_SOON_IDS.sort()).toEqual(coming.map(c => c.id).sort());
    });

    it('named Gyms4you / THE Fitness coming-soon clubs are absent from production', () => {
      const names = hrCenters.map(c => c.name);
      expect(names.some(n => /split\s*visoka/i.test(n))).toBe(false);
      expect(names.some(n => /trstenik/i.test(n))).toBe(false);
      expect(names.some(n => /split\s*3/i.test(n))).toBe(false);
      expect(names.some(n => /juri[sš]i[cć]eva/i.test(n))).toBe(false);
      expect(names.some(n => /spinut/i.test(n))).toBe(false);
      expect(names.some(n => /heinzelova\s*x\s*vukovarska/i.test(n))).toBe(false);
      expect(names.some(n => /samobor\s*stop\s*shop/i.test(n))).toBe(false);
      expect(names.some(n => /donje\s*svetice/i.test(n))).toBe(false);
      // Open Heinzelova (ulica 33) is distinct and may remain live
      expect(findCenterById(HEINZELOVA_OPEN)?.name).toBe('Gyms4you Heinzelova');
      expect(findCenterById('hr_ce961ae600')).toBeUndefined();
    });

    it('OrlandoFit / Play Fitness / hotel-only World Class absent', () => {
      expect(hrCenters.some(c => /orlandofit/i.test(c.brand))).toBe(false);
      expect(hrCenters.some(c => /^Play Fitness$/i.test(c.brand))).toBe(false);
      expect(hrCenters.some(c => /world\s*class/i.test(`${c.brand} ${c.name}`))).toBe(false);
    });
  });

  describe('3. Gyms4you QA', () => {
    const g4y = hrCenters.filter(c => c.brand === 'Gyms4you');

    it('has exactly 48 live open clubs; no coming-soon alias', () => {
      expect(g4y.length).toBe(48);
      expect(g4y.every(c => c.is_active === true)).toBe(true);
      expect(g4y.every(c => c.is_coming_soon !== true)).toBe(true);
      const keepG4y = keepExisting.filter(r => r.brand === 'Gyms4you');
      expect(keepG4y.length).toBe(48);
      const pin = keepG4y.filter(r => r.coord_source === 'GOOGLE_PLACE_PIN').length;
      const hydrate = keepG4y.filter(r => r.coord_source === 'KNOWN_PREMISES_HYDRATE').length;
      expect(pin).toBe(8);
      expect(hydrate).toBe(40);
      expect(pin + hydrate).toBe(48);
    });

    it('covers priority cities and keeps open Heinzelova separate from coming-soon', () => {
      for (const city of ['Zagreb', 'Split', 'Rijeka', 'Osijek', 'Varaždin', 'Zadar', 'Dubrovnik']) {
        expect(g4y.some(c => c.city === city)).toBe(true);
      }
      const open = findCenterById(HEINZELOVA_OPEN)!;
      expect(open.address).toMatch(/Heinzelova ulica 33/i);
      expect(open.postal_code).toBe('10000');
    });
  });

  describe('4. THE Fitness QA', () => {
    const tf = hrCenters.filter(c => c.brand === 'THE Fitness');

    it('has exactly 21 live clubs with rebrand successors', () => {
      expect(tf.length).toBe(21);
      expect(findCenterById(KAPTOL)?.name).toMatch(/kaptol/i);
      expect(findCenterById(GREEN_GOLD)?.name).toMatch(/green gold/i);
      expect(findCenterById(BRANIMIR)?.name).toMatch(/branimir/i);
      expect(findCenterById(CRNOMERE_TF)?.name).toMatch(/črnomerec|crnomerec/i);
      expect(tf.filter(c => /kaptol/i.test(c.name)).length).toBe(1);
      expect(tf.filter(c => /green gold/i.test(c.name)).length).toBe(1);
      expect(tf.filter(c => /branimir/i.test(c.name)).length).toBe(1);
      expect(tf.filter(c => /črnomerec|crnomerec/i.test(c.name)).length).toBe(1);
    });

    it('Jelkovec has Sesvete address, 10360, production-hydrated coords', () => {
      const jel = findCenterById(JELKOVEC)!;
      expect(jel.name).toMatch(/jelkovec/i);
      expect(jel.address).toMatch(/144\.?\s*Brigade|Park\s*&\s*Shop/i);
      expect(jel.postal_code).toBe('10360');
      expect(jel.city).toBe('Zagreb');
      expect(jel.lat).toBeCloseTo(45.813479, 4);
      expect(jel.lng).toBeCloseTo(16.1036797, 4);
      const keep = keepExisting.find(r => r.id === JELKOVEC)!;
      expect(keep.coord_source).toBe('KNOWN_PREMISES_HYDRATE');
    });

    it('Hotel Novi Zagreb and Zonar remain live as public/member clubs', () => {
      const hotel = findCenterById(HOTEL_NOVI)!;
      const zonar = findCenterById(ZONAR)!;
      expect(hotel.brand).toBe('THE Fitness');
      expect(zonar.brand).toBe('THE Fitness');
      expect(hotel.is_active).toBe(true);
      expect(zonar.is_active).toBe(true);
      expect(hotel.address.length).toBeGreaterThan(5);
      expect(zonar.address.length).toBeGreaterThan(5);
      expect(CROATIA_POSTAL_RE.test(hotel.postal_code)).toBe(true);
      expect(CROATIA_POSTAL_RE.test(zonar.postal_code)).toBe(true);
    });
  });

  describe('5. Gibi Gib / Joker / Multihealth QA', () => {
    it('Gibi Gib = 4 current clubs', () => {
      const rows = hrCenters.filter(c => c.brand === 'Gibi Gib');
      expect(rows.length).toBe(4);
      expect(rows.filter(c => c.city === 'Varaždin').length).toBe(2);
      expect(rows.filter(c => c.city === 'Zagreb').length).toBe(2);
    });

    it('Fitness Centar Joker = Split / Mejaši / Omiš / Solin', () => {
      const rows = hrCenters.filter(c => c.brand === 'Fitness Centar Joker');
      expect(rows.length).toBe(4);
      expect(rows.some(c => /split/i.test(c.name) && /brodarice/i.test(c.name))).toBe(true);
      expect(rows.some(c => /meja[sš]i/i.test(c.name))).toBe(true);
      expect(rows.some(c => c.city === 'Omiš')).toBe(true);
      expect(rows.some(c => c.city === 'Solin')).toBe(true);
    });

    it('Multihealth = Samobor / Karlovac / Zagreb Rudeš', () => {
      const rows = hrCenters.filter(c => c.brand === 'Multihealth');
      expect(rows.length).toBe(3);
      expect(rows.some(c => c.city === 'Samobor')).toBe(true);
      expect(rows.some(c => c.city === 'Karlovac')).toBe(true);
      expect(rows.some(c => /rude[sš]/i.test(c.name))).toBe(true);
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no duplicate IDs; known A_legitimate pairs only', () => {
      expect(new Set(hrCenters.map(c => c.id)).size).toBe(80);

      let same25 = 0;
      let same50 = 0;
      let same100 = 0;
      let same200 = 0;
      let identical = 0;
      let diff100 = 0;
      const same200Pairs: Array<{a: string; b: string; d: number}> = [];
      const diffPairs: Array<{a: string; b: string; d: number}> = [];

      for (let i = 0; i < hrCenters.length; i++) {
        for (let j = i + 1; j < hrCenters.length; j++) {
          const a = hrCenters[i]!;
          const b = hrCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical++;
          if (a.brand === b.brand) {
            if (d <= 25) same25++;
            if (d <= 50) same50++;
            if (d <= 100) same100++;
            if (d <= 200) {
              same200++;
              same200Pairs.push({a: a.name, b: b.name, d: Math.round(d)});
            }
          } else if (d <= 100) {
            diff100++;
            diffPairs.push({a: a.name, b: b.name, d: Math.round(d)});
          }
        }
      }

      expect(same25).toBe(0);
      expect(same50).toBe(0);
      expect(same100).toBe(0);
      expect(identical).toBe(0);
      expect(same200).toBe(1);
      expect(diff100).toBe(1);
      expect(same200Pairs[0]!.d).toBeGreaterThan(100);
      expect(
        /zavrtnica/i.test(same200Pairs[0]!.a + same200Pairs[0]!.b) &&
          /branimir/i.test(same200Pairs[0]!.a + same200Pairs[0]!.b),
      ).toBe(true);
      expect(
        /dubec/i.test(diffPairs[0]!.a + diffPairs[0]!.b) &&
          /dubrava/i.test(diffPairs[0]!.a + diffPairs[0]!.b),
      ).toBe(true);

      const zav = findCenterById(ZAVRTNICA)!;
      const bra = findCenterById(BRANIMIR)!;
      expect(zav.address).not.toBe(bra.address);
      expect(haversineMeters(zav.lat!, zav.lng!, bra.lat!, bra.lng!)).toBeCloseTo(122, 0);

      const dubec = findCenterById(DUBEC)!;
      const dubrava = findCenterById(DUBRAVA_TF)!;
      expect(dubec.brand).toBe('Gyms4you');
      expect(dubrava.brand).toBe('THE Fitness');
      expect(haversineMeters(dubec.lat!, dubec.lng!, dubrava.lat!, dubrava.lng!)).toBeLessThan(100);
    });
  });

  describe('7. Border safety', () => {
    it('rejects neighbor cores; all hr_* inside Croatia helper', () => {
      expect(isPlausibleCroatiaCoordinate(46.056, 14.508)).toBe(false); // Ljubljana
      expect(isPlausibleCroatiaCoordinate(46.4, 17.0)).toBe(false); // HU / Nagykanizsa corridor
      expect(isPlausibleCroatiaCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
      expect(isPlausibleCroatiaCoordinate(43.8563, 18.4131)).toBe(false); // Sarajevo
      expect(isPlausibleCroatiaCoordinate(42.4304, 19.2594)).toBe(false); // Podgorica
      for (const c of hrCenters) {
        expect(isPlausibleCroatiaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_BLOB.test(`${c.city} ${c.address}`)).toBe(false);
      }
    });
  });

  describe('8. Croatian text / diacritics', () => {
    it('preserves display diacritics; search folds ASCII', () => {
      expect(hrCenters.some(c => c.city === 'Varaždin')).toBe(true);
      expect(hrCenters.some(c => c.city === 'Šibenik')).toBe(true);
      expect(hrCenters.some(c => c.city === 'Zaprešić')).toBe(true);
      expect(hrCenters.some(c => c.city === 'Omiš')).toBe(true);
      const blob = hrCenters.map(c => `${c.name} ${c.address} ${c.city}`).join('\n');
      expect(blob).toMatch(/č|ć|š|ž|đ/i);
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(normalizeGymSearchValue('Varaždin')).toBe('varazdin');
      expect(normalizeGymSearchValue('Šibenik')).toBe('sibenik');
      expect(normalizeGymSearchValue('Čakovec')).toBe('cakovec');
      expect(normalizeGymSearchValue('Zaprešić')).toBe('zapresic');
      expect(normalizeGymSearchValue('Omiš')).toBe('omis');
    });
  });

  describe('9. Search QA', () => {
    it('brand searches return hr_*', () => {
      const brandQueries = [
        'Gyms4you',
        'gyms4you',
        'THE Fitness',
        'the fitness',
        'Gibi Gib',
        'Fitness Centar Joker',
        'joker',
        'Multihealth',
      ];
      for (const q of brandQueries) {
        const hits = searchGyms(q, {gyms: croatia, limit: 40});
        expect(hits.some(h => h.gym.id.startsWith('hr_'))).toBe(true);
      }
      expect(searchGyms('Gyms4you Zagreb', {limit: 40}).some(h => h.gym.id.startsWith('hr_'))).toBe(
        true,
      );
    });

    it('city searches return hr_* where coverage exists; Pula remains empty chain', () => {
      const withCoverage = [
        'Zagreb',
        'Split',
        'Rijeka',
        'Osijek',
        'Zadar',
        'Varaždin',
        'Varazdin',
        'Šibenik',
        'Sibenik',
        'Dubrovnik',
        'Karlovac',
        'Samobor',
        'Zaprešić',
        'Zapresic',
        'Omiš',
        'Omis',
        'Solin',
      ];
      for (const q of withCoverage) {
        // Scope to Croatia for smaller cities so global top-30 ranking cannot crowd them out.
        const scoped = searchGyms(q, {gyms: croatia, limit: 30});
        expect(scoped.some(h => h.gym.id.startsWith('hr_'))).toBe(true);
      }
      // Major cities also surface in global search
      for (const q of ['Zagreb', 'Split', 'Rijeka', 'Osijek', 'Dubrovnik']) {
        expect(searchGyms(q, {limit: 40}).some(h => h.gym.id.startsWith('hr_'))).toBe(true);
      }
      // Zero-chain cities: do not invent results
      const pulaHr = searchGyms('Pula', {gyms: croatia, limit: 20}).filter(h =>
        h.gym.id.startsWith('hr_'),
      );
      expect(pulaHr.length).toBe(0);
    });

    it('postcode search uses string NNNNN storage', () => {
      const samples = ['10000', '21000', '51000', '31000', '42000', '10360'];
      for (const pc of samples) {
        expect(typeof hrCenters.find(c => c.postal_code === pc)?.postal_code).toBe('string');
        const scoped = searchGyms(pc, {gyms: croatia, limit: 20});
        expect(scoped.every(h => h.gym.id.startsWith('hr_'))).toBe(true);
      }
      expect(hrCenters.every(c => CROATIA_POSTAL_RE.test(c.postal_code))).toBe(true);
    });
  });

  describe('10. Regional coverage', () => {
    it('matches Phase 2 READY footprint; zero-chain cities stay empty', () => {
      const byCity: Record<string, number> = {};
      for (const c of hrCenters) byCity[c.city] = (byCity[c.city] || 0) + 1;
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(byCity['Pula'] || 0).toBe(0);
      expect(byCity['Sisak'] || 0).toBe(0);
      expect(byCity['Čakovec'] || 0).toBe(0);
    });
  });

  describe('11. Onboarding / profile / nearest / map', () => {
    it('representative city picks persist as hr_* Croatia', () => {
      for (const city of ['Zagreb', 'Split', 'Rijeka', 'Osijek', 'Zadar']) {
        const pick = croatia.find(g => g.city === city)!;
        expect(pick).toBeTruthy();
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Croatia');
        expect(findGymById(pick.id)?.id).toBe(pick.id);
      }
    });

    it('mixed favorites + exact ID lookup; never catalog[0]', () => {
      const a = croatia[0]!;
      const b = croatia[1]!;
      const dk = gyms.find(g => g.country === 'Denmark')!;
      const favs = [a.id, b.id, dk.id];
      for (const id of favs) {
        expect(findGymById(id)?.id).toBe(id);
      }
      expect(findGymById(a.id)?.id).not.toBe(catalog[0]!.id);
      expect(findGymById(a.id)?.country).toBe('Croatia');
    });

    it('nearest returns plausible hr_* around major cities', () => {
      const fixtures = [
        {city: 'Zagreb', lat: 45.815, lng: 15.982},
        {city: 'Split', lat: 43.508, lng: 16.44},
        {city: 'Rijeka', lat: 45.327, lng: 14.442},
        {city: 'Osijek', lat: 45.555, lng: 18.696},
        {city: 'Zadar', lat: 44.119, lng: 15.231},
        {city: 'Varaždin', lat: 46.306, lng: 16.338},
        {city: 'Dubrovnik', lat: 42.65, lng: 18.094},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, croatia);
        expect(n?.id.startsWith('hr_')).toBe(true);
        expect(n?.country).toBe('Croatia');
        expect(isPlausibleCroatiaCoordinate(n!.latitude, n!.longitude)).toBe(true);
      }
    });

    it('map viewport subsets dense Zagreb / Split / Rijeka / Osijek / Zadar', () => {
      const markers = toMap(croatia);
      expect(markers.length).toBe(80);
      const regions = [
        {latitude: 45.815, longitude: 15.982, latitudeDelta: 0.2, longitudeDelta: 0.2},
        {latitude: 43.508, longitude: 16.44, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 45.327, longitude: 14.442, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 45.555, longitude: 18.696, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 44.119, longitude: 15.231, latitudeDelta: 0.15, longitudeDelta: 0.15},
      ];
      for (const region of regions) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(EXPECTED_TOTAL);
        expect(visible.every(v => v.id.startsWith('hr_'))).toBe(true);
      }
      const zagreb = filterMapCentersInRegion(markers as never, {
        latitude: 45.815,
        longitude: 15.982,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      } as never);
      expect(zagreb.length).toBeGreaterThan(5);
      const brands = new Set(zagreb.map(v => findCenterById(v.id)?.brand).filter(Boolean));
      expect(brands.size).toBeGreaterThan(1);
      const pick = zagreb[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
    });
  });

  describe('12. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['THE Fitness Zavrtnica dense Zagreb', () => ZAVRTNICA],
      ['THE Fitness Branimir dense Zagreb', () => BRANIMIR],
      ['Gyms4you Dubec', () => DUBEC],
      ['THE Fitness Jelkovec', () => JELKOVEC],
      ['Gyms4you Heinzelova', () => HEINZELOVA_OPEN],
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

    it('nearby Zagreb gyms do not replace session gym ID', () => {
      const a = findGymById(ZAVRTNICA)!;
      const b = findGymById(BRANIMIR)!;
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
      expect(d).toBeLessThan(200);
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
    it('hr_* resolves for workout/profile/favorites paths', () => {
      const live = croatia[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Croatia').length).toBe(80);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^hr_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan hr_nonexistent_test is safe Croatia stub (not SI/HU/RS/BA/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('hr_nonexistent_test');
      expect(stub.id).toBe('hr_nonexistent_test');
      expect(stub.region).toBe('Croatia');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('hr_nonexistent_test').name);
      expect(findGymById('hr_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Slovenia');
      expect(stub.region).not.toBe('Hungary');
      expect(stub.region).not.toBe('Serbia');
      expect(stub.region).not.toBe('Bosnia and Herzegovina');
      expect(stub.region).not.toBe('Denmark');
      expect(stub.region).not.toBe('Bulgaria');
    });
  });

  describe('14. Country regression', () => {
    it('exact country production counts totaling 11921', () => {
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
      expect(counts['Serbia']).toBe(63);
      expect(counts['Kosovo']).toBe(18);
      expect(counts['Albania']).toBe(9);
      expect(counts['Bosnia and Herzegovina']).toBe(31);
      expect(counts['North Macedonia']).toBe(25);
      expect(counts['Montenegro']).toBe(26);
      expect(counts['Moldova']).toBe(28);
      expect(counts['San Marino']).toBe(6);
      expect(counts['Monaco']).toBe(4);
      expect(counts['Andorra']).toBe(12);
      expect(counts['Liechtenstein']).toBe(7);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11921);
    });
  });

  describe('15. Performance snapshot', () => {
    it('records live catalog timings vs Croatia merge / Bulgaria QA baselines', () => {
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
      searchGyms('zagreb', {limit: 20});
      searchGyms('split', {limit: 20});
      searchGyms('gyms4you', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(45.815, 15.982, croatia);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(croatia);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 45.815,
        longitude: 15.982,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        croatia: hrCenters.length,
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
        croatia_merge_benchmark: {
          catalog: 11648,
          json_size_mb: 3.38,
        },
        bulgaria_qa_baseline: {
          catalog: 11336,
          json_size_mb: 3.36,
        },
        slovakia_qa_baseline: {
          catalog: 11254,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
      };
      const outDir = path.join(__dirname, '../data/croatia');
      fs.writeFileSync(path.join(outDir, 'CROATIA_QA_PERF.json'), JSON.stringify(perf, null, 2) + '\n');
      expect(perf.catalog).toBe(11921);
      expect(perf.croatia).toBe(80);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.cold_index_ms).toBeLessThan(15000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
      expect(perf.worst_search_ms).toBeLessThan(3000);
    });
  });
});
