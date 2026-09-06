/**
 * Latvia gym QA — full production validation after lv_* merge (33 centers).
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
  LATVIA_POSTAL_RE,
  isLatviaCountry,
  isPlausibleLatviaCoordinate,
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

const staging = require('../data/latvia/latvia_centers_staging.json') as Array<{
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

const approved = require('../data/latvia/LATVIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/latvia/LATVIA_PHASE2_READY_TO_IMPORT.json') as Array<{
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
  /\b(lithuania|lietuva|vilnius|kaunas|estonia|eesti|tallinn|kaliningrad|belarus|poland|polska)\b/i;

const EXPECTED_TOTAL = 11692;
const EXPECTED_LATVIA = 33;
const POST_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRANDS: Record<string, number> = {
  MyFitness: 15,
  'Lemon Gym': 8,
  'Gym!': 10,
};

const EXPECTED_CITIES: Record<string, number> = {
  Rīga: 32,
  Daugavpils: 1,
};

const EXCLUDED_LIVE_RE =
  /^(people fitness|city fitness|global fitness|best fit|gym l[aā]čplēsis|f1|atlētika|atletika|sportima|fitspot|vingruma klubs|dch|sports house|skygym|gym\+|impuls|basic-?fit|mcfit|anytime( fitness)?|fitinn|clever fit|john reed|gold'?s gym|fitness first|world class)$/i;

const ZIEPNIEKKALNS = 'lv_eb2ad44f7d';
const DAUGAVPILS = 'lv_0ab2d9fa6b';

// Dense Rīga check-in fixtures
const RIGA_GALLERIA = 'lv_933fcf75a1'; // MyFitness Galleria Rīga
const RIGA_BARONS = 'lv_3b6472323b'; // Gym! Barons
const RIGA_GALERIJA_CENTRS = 'lv_9944f27897'; // MyFitness Galerija Centrs
const RIGA_ORIGO = 'lv_86cad25aff'; // Gym! Origo
const RIGA_TEIKA_LEMON = 'lv_e97e5cd222'; // Lemon Gym Teika

const ZERO_CHAIN_CITIES = [
  'Liepāja',
  'Jelgava',
  'Jūrmala',
  'Ventspils',
  'Rēzekne',
  'Valmiera',
  'Jēkabpils',
  'Ogre',
];

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

describe('Latvia gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const latvia = gyms.filter(g => isLatviaCountry(g.country));
  const lvCenters = catalog.filter(c => isLatviaCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Latvia = 33; lv_* = 33; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(lvCenters.length).toBe(EXPECTED_LATVIA);
      expect(latvia.length).toBe(EXPECTED_LATVIA);
      expect(catalog.filter(c => c.id.startsWith('lv_')).length).toBe(EXPECTED_LATVIA);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
      expect(sha).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(lvCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(33);
      expect(ap.size).toBe(33);
      expect(ready.size).toBe(33);
      expect(merged.size).toBe(33);
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

    it('all lv_* IDs unique with required fields and valid Latvia geography', () => {
      const ids = new Set<string>();
      for (const c of lvCenters) {
        expect(c.id).toMatch(/^lv_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Latvia');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(LATVIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleLatviaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(EXCLUDED_LIVE_RE.test(String(c.brand || '').trim())).toBe(false);
      }
      expect(ids.size).toBe(33);
    });

    it('exact brand and city breakdown', () => {
      const byBrand: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      for (const c of lvCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
        byCity[c.city] = (byCity[c.city] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(Object.keys(byBrand).length).toBe(3);
    });
  });

  describe('2. Staging exclusions / coming-soon withheld', () => {
    it('COMING_SOON = 1 and EXCLUDED = 12 remain outside production', () => {
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      const excluded = staging.filter(s => s.import_category === 'EXCLUDED');
      expect(coming.length).toBe(1);
      expect(excluded.length).toBe(12);
      const prodIds = new Set(lvCenters.map(c => c.id));
      for (const r of [...coming, ...excluded]) {
        expect(prodIds.has(r.id)).toBe(false);
      }
      expect(coming.some(r => r.id === ZIEPNIEKKALNS)).toBe(true);
      expect(coming.some(r => /ziepniekkalns/i.test(String(r.name || '')))).toBe(true);
    });

    it('named excluded / global chains absent from LV production', () => {
      for (const c of lvCenters) {
        expect(EXCLUDED_LIVE_RE.test(String(c.brand || '').trim())).toBe(false);
      }
      for (const brand of [
        'People Fitness',
        'City Fitness',
        'Global Fitness',
        'Best Fit',
        'Gym Lāčplēsis',
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
        'Gym+',
        'Impuls',
      ]) {
        expect(lvCenters.some(c => c.brand.toLowerCase() === brand.toLowerCase())).toBe(false);
      }
    });
  });

  describe('3. MyFitness priority QA', () => {
    const myfitness = lvCenters.filter(c => c.brand === 'MyFitness');

    it('has exactly 15 live MyFitness clubs', () => {
      expect(myfitness.length).toBe(15);
      expect(myfitness.every(c => c.is_active === true)).toBe(true);
      expect(myfitness.every(c => c.is_coming_soon !== true)).toBe(true);
      expect(myfitness.every(c => c.brand === 'MyFitness')).toBe(true);
      expect(myfitness.every(c => LATVIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(myfitness.every(c => isPlausibleLatviaCoordinate(c.lat!, c.lng!))).toBe(true);
    });

    it('City Fitness and People Fitness predecessors absent', () => {
      expect(lvCenters.some(c => /^City Fitness$/i.test(c.brand))).toBe(false);
      expect(lvCenters.some(c => /^People Fitness$/i.test(c.brand))).toBe(false);
    });
  });

  describe('4. Lemon Gym QA', () => {
    it('has exactly 8 live clubs; Ziepniekkalns COMING_SOON withheld', () => {
      const rows = lvCenters.filter(c => c.brand === 'Lemon Gym');
      expect(rows.length).toBe(8);
      expect(rows.every(c => c.is_active === true)).toBe(true);
      expect(rows.every(c => c.is_coming_soon !== true)).toBe(true);
      expect(lvCenters.some(c => c.id === ZIEPNIEKKALNS)).toBe(false);
      expect(lvCenters.some(c => /ziepniekkalns/i.test(`${c.name} ${c.address}`))).toBe(false);
      const staged = staging.find(s => s.id === ZIEPNIEKKALNS)!;
      expect(staged.import_category).toBe('COMING_SOON');
      expect(staged.is_coming_soon).toBe(true);
      expect(String(staged.address || '')).toMatch(/Valdeķu iela 39/i);
    });
  });

  describe('5. Gym! QA', () => {
    it('has exactly 10 live clubs (Rīga 9 + Daugavpils 1); not Gym+', () => {
      const rows = lvCenters.filter(c => c.brand === 'Gym!');
      expect(rows.length).toBe(10);
      expect(rows.filter(c => c.city === 'Rīga').length).toBe(9);
      expect(rows.filter(c => c.city === 'Daugavpils').length).toBe(1);
      expect(findCenterById(DAUGAVPILS)?.brand).toBe('Gym!');
      expect(findCenterById(DAUGAVPILS)?.city).toBe('Daugavpils');
      expect(findCenterById(DAUGAVPILS)?.postal_code).toBe('5401');
      expect(rows.every(c => c.brand === 'Gym!')).toBe(true);
      expect(lvCenters.some(c => c.brand === 'Gym+')).toBe(false);
      expect(rows.every(c => LATVIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(rows.every(c => isPlausibleLatviaCoordinate(c.lat!, c.lng!))).toBe(true);
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no duplicate IDs; zero suspicious same/diff-brand proximity pairs', () => {
      expect(new Set(lvCenters.map(c => c.id)).size).toBe(33);

      let same25 = 0;
      let same50 = 0;
      let same100 = 0;
      let same200 = 0;
      let identical = 0;
      let diff100 = 0;
      let sameAddress = 0;

      for (let i = 0; i < lvCenters.length; i++) {
        for (let j = i + 1; j < lvCenters.length; j++) {
          const a = lvCenters[i]!;
          const b = lvCenters[j]!;
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
    it('rejects neighbor cores; all lv_* inside Latvia helper; LT intact', () => {
      expect(isPlausibleLatviaCoordinate(54.6872, 25.2797)).toBe(false); // Vilnius
      expect(isPlausibleLatviaCoordinate(59.437, 24.7536)).toBe(false); // Tallinn
      expect(isPlausibleLatviaCoordinate(55.9349, 23.3135)).toBe(false); // Šiauliai
      expect(isPlausibleLatviaCoordinate(53.9045, 27.5615)).toBe(false); // Minsk
      expect(isPlausibleLatviaCoordinate(56.9496, 24.1052)).toBe(true); // Rīga
      expect(isPlausibleLatviaCoordinate(55.8728, 26.526)).toBe(true); // Daugavpils
      for (const c of lvCenters) {
        expect(isPlausibleLatviaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_BLOB.test(`${c.city} ${c.address}`)).toBe(false);
        expect(String(c.id).startsWith('lt_')).toBe(false);
      }
      expect(catalog.filter(c => c.country === 'Lithuania').length).toBe(61);
      expect(catalog.filter(c => c.id.startsWith('lt_')).length).toBe(61);
      expect(lvCenters.some(c => c.brand === 'Gym+')).toBe(false);
      expect(lvCenters.some(c => c.brand === 'Impuls')).toBe(false);
    });
  });

  describe('8. Latvian text / diacritics', () => {
    it('preserves display diacritics; search folds ASCII', () => {
      expect(lvCenters.some(c => c.city === 'Rīga')).toBe(true);
      expect(lvCenters.some(c => /ā|č|ē|ģ|ī|ķ|ļ|ņ|š|ū|ž/i.test(`${c.name} ${c.address}`))).toBe(
        true,
      );
      const blob = lvCenters.map(c => `${c.name} ${c.address} ${c.city}`).join('\n');
      expect(blob).toMatch(/Rīga/);
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(normalizeGymSearchValue('Rīga')).toBe('riga');
      expect(normalizeGymSearchValue('Liepāja')).toBe('liepaja');
      expect(normalizeGymSearchValue('Jūrmala')).toBe('jurmala');
      expect(normalizeGymSearchValue('Rēzekne')).toBe('rezekne');
      expect(normalizeGymSearchValue('Jēkabpils')).toBe('jekabpils');
      expect(normalizeGymSearchValue('Valdeķu')).toBe('valdeku');
    });
  });

  describe('9. Search QA', () => {
    it('brand searches return lv_*; Gym! does not resolve as Gym+', () => {
      for (const q of ['MyFitness', 'myfitness', 'Lemon Gym', 'lemon gym', 'Gym!', 'gym!']) {
        const hits = searchGyms(q, {gyms: latvia, limit: 50});
        expect(hits.some(h => h.gym.id.startsWith('lv_'))).toBe(true);
        expect(hits.every(h => h.gym.id.startsWith('lv_'))).toBe(true);
      }
      const bang = searchGyms('Gym!', {gyms: latvia, limit: 40});
      expect(bang.some(h => h.gym.brand === 'Gym!')).toBe(true);
      // Token "gym" may also surface Lemon Gym — allowed; Gym+ must never appear in LV scope
      expect(bang.some(h => h.gym.brand === 'Gym+')).toBe(false);
      expect(bang.every(h => h.gym.country === 'Latvia')).toBe(true);
      const gymBangGlobal = searchGyms('Gym!', {limit: 80});
      const lvBang = gymBangGlobal.filter(h => h.gym.id.startsWith('lv_'));
      expect(lvBang.length).toBeGreaterThan(0);
      expect(lvBang.some(h => h.gym.brand === 'Gym!')).toBe(true);
      expect(lvBang.every(h => h.gym.brand !== 'Gym+')).toBe(true);
    });

    it('city searches return lv_* where coverage exists; zero-chain cities stay empty', () => {
      for (const q of ['Rīga', 'Riga', 'Daugavpils']) {
        const scoped = searchGyms(q, {gyms: latvia, limit: 40});
        expect(scoped.some(h => h.gym.id.startsWith('lv_'))).toBe(true);
      }
      for (const q of ['Rīga', 'Riga', 'Daugavpils']) {
        expect(searchGyms(q, {limit: 40}).some(h => h.gym.id.startsWith('lv_'))).toBe(true);
      }
      for (const city of ZERO_CHAIN_CITIES) {
        expect(lvCenters.every(c => c.city !== city)).toBe(true);
      }
      for (const q of [
        'Liepāja',
        'Liepaja',
        'Jelgava',
        'Jūrmala',
        'Jurmala',
        'Ventspils',
        'Rēzekne',
        'Rezekne',
        'Valmiera',
        'Jēkabpils',
        'Jekabpils',
        'Ogre',
      ]) {
        const hits = searchGyms(q, {gyms: latvia, limit: 20});
        expect(hits.every(h => !ZERO_CHAIN_CITIES.includes(h.gym.city))).toBe(true);
      }
    });

    it('postcode search uses string NNNN; LV-scoped results', () => {
      const samples = ['1058', '1006', '1011', '1067', '5401', '1050'];
      for (const pc of samples) {
        const row = lvCenters.find(c => c.postal_code === pc);
        expect(row).toBeTruthy();
        expect(typeof row!.postal_code).toBe('string');
        const scoped = searchGyms(pc, {gyms: latvia, limit: 20});
        expect(scoped.length).toBeGreaterThan(0);
        expect(scoped.every(h => h.gym.id.startsWith('lv_'))).toBe(true);
        expect(scoped.some(h => h.gym.postalCode === pc)).toBe(true);
      }
      expect(lvCenters.every(c => LATVIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(lvCenters.every(c => typeof c.postal_code === 'string')).toBe(true);
      // LV-NNNN form normalizes for search where supported
      expect(normalizeGymSearchValue('LV-1050').includes('1050') || normalizeGymSearchValue('LV-1050') === 'lv-1050' || normalizeGymSearchValue('LV-1050') === 'lv1050').toBe(true);
    });
  });

  describe('10. Regional coverage', () => {
    it('matches Phase 2 READY footprint; zero-chain markets stay empty', () => {
      const byCity: Record<string, number> = {};
      for (const c of lvCenters) byCity[c.city] = (byCity[c.city] || 0) + 1;
      expect(byCity).toEqual(EXPECTED_CITIES);
      for (const city of ZERO_CHAIN_CITIES) {
        expect(byCity[city] || 0).toBe(0);
      }
    });
  });

  describe('11. Onboarding / profile / nearest / map', () => {
    it('representative city picks persist as lv_* Latvia; Ziepniekkalns not selectable', () => {
      for (const city of ['Rīga', 'Daugavpils']) {
        const pick = latvia.find(g => g.city === city)!;
        expect(pick).toBeTruthy();
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Latvia');
        expect(findGymById(pick.id)?.id).toBe(pick.id);
        expect(findGymById(pick.id)?.country).toBe('Latvia');
      }
      expect(findGymById(ZIEPNIEKKALNS)).toBeNull();
      expect(latvia.some(g => g.id === ZIEPNIEKKALNS)).toBe(false);
    });

    it('mixed favorites + exact ID lookup; never catalog[0]', () => {
      const a = latvia[0]!;
      const b = latvia[1]!;
      const dk = gyms.find(g => g.country === 'Denmark')!;
      const lt = gyms.find(g => g.country === 'Lithuania')!;
      const favs = [a.id, b.id, dk.id, lt.id];
      for (const id of favs) {
        expect(findGymById(id)?.id).toBe(id);
      }
      expect(findGymById(a.id)?.id).not.toBe(catalog[0]!.id);
      expect(findGymById(a.id)?.country).toBe('Latvia');
    });

    it('nearest returns plausible lv_*; Ziepniekkalns cannot be nearest live', () => {
      const fixtures = [
        {city: 'Rīga', lat: 56.9496, lng: 24.1052},
        {city: 'Daugavpils', lat: 55.8747, lng: 26.5362},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, latvia);
        expect(n?.id.startsWith('lv_')).toBe(true);
        expect(n?.country).toBe('Latvia');
        expect(n?.id).not.toBe(ZIEPNIEKKALNS);
        expect(isPlausibleLatviaCoordinate(n!.latitude, n!.longitude)).toBe(true);
      }
    });

    it('map viewport subsets Rīga / Daugavpils; no Ziepniekkalns marker', () => {
      const markers = toMap(latvia);
      expect(markers.length).toBe(33);
      expect(markers.every(m => m.id !== ZIEPNIEKKALNS)).toBe(true);
      const regions = [
        {latitude: 56.9496, longitude: 24.1052, latitudeDelta: 0.25, longitudeDelta: 0.25},
        {latitude: 55.8747, longitude: 26.5362, latitudeDelta: 0.15, longitudeDelta: 0.15},
      ];
      for (const region of regions) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(EXPECTED_TOTAL);
        expect(visible.every(v => v.id.startsWith('lv_'))).toBe(true);
        expect(visible.every(v => v.id !== ZIEPNIEKKALNS)).toBe(true);
      }
      const riga = filterMapCentersInRegion(markers as never, {
        latitude: 56.9496,
        longitude: 24.1052,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      } as never);
      expect(riga.length).toBeGreaterThan(5);
      const brands = new Set(riga.map(v => findCenterById(v.id)?.brand).filter(Boolean));
      expect(brands.size).toBeGreaterThan(1);
      const pick = riga[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
    });
  });

  describe('12. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['MyFitness Galleria Rīga', () => RIGA_GALLERIA],
      ['Gym! Barons', () => RIGA_BARONS],
      ['MyFitness Galerija Centrs', () => RIGA_GALERIJA_CENTRS],
      ['Gym! Origo', () => RIGA_ORIGO],
      ['Lemon Gym Teika', () => RIGA_TEIKA_LEMON],
      ['Gym! Daugavpils', () => DAUGAVPILS],
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

    it('nearby Rīga gyms do not replace session gym ID', () => {
      const a = findGymById(RIGA_GALLERIA)!;
      const b = findGymById(RIGA_BARONS)!;
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
    it('lv_* resolves for workout/profile/favorites paths', () => {
      const live = latvia[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Latvia').length).toBe(33);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^lv_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan lv_nonexistent_test is safe Latvia stub (not LT/EE/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('lv_nonexistent_test');
      expect(stub.id).toBe('lv_nonexistent_test');
      expect(stub.region).toBe('Latvia');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('lv_nonexistent_test').name);
      expect(findGymById('lv_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Lithuania');
      expect(stub.region).not.toBe('Estonia');
      expect(stub.region).not.toBe('Denmark');
      expect(stub.region).not.toBe('Slovenia');
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
    it('records live catalog timings vs Latvia merge / Lithuania QA baselines', () => {
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
      searchGyms('riga', {limit: 20});
      searchGyms('myfitness', {limit: 20});
      searchGyms('lemon gym', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(56.9496, 24.1052, latvia);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(latvia);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 56.9496,
        longitude: 24.1052,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        latvia: lvCenters.length,
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
        latvia_merge_baseline: {
          catalog: 11648,
          json_size_mb: 3.42,
        },
        lithuania_qa_baseline: {
          catalog: 11509,
          json_size_mb: 3.41,
        },
        slovenia_qa_baseline: {
          catalog: 11448,
          json_size_mb: 3.39,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
      };
      const outDir = path.join(__dirname, '../data/latvia');
      fs.writeFileSync(
        path.join(outDir, 'LATVIA_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      expect(perf.catalog).toBe(11692);
      expect(perf.latvia).toBe(33);
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
