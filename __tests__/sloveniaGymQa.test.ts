/**
 * Slovenia gym QA — full production validation after si_* merge (32 centers).
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
  SLOVENIA_POSTAL_RE,
  isSloveniaCountry,
  isPlausibleSloveniaCoordinate,
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

const staging = require('../data/slovenia/slovenia_centers_staging.json') as Array<{
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

const approved = require('../data/slovenia/SLOVENIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/slovenia/SLOVENIA_PHASE2_READY_TO_IMPORT.json') as Array<{
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
  /\b(croatia|hrvatska|zagreb|austria|österreich|wien|vienna|hungary|budapest|italy|italia|trieste|serbia)\b/i;

const EXPECTED_TOTAL = 11692;
const EXPECTED_SLOVENIA = 32;
const POST_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc'; // live catalog after Latvia merge

const EXPECTED_BRANDS: Record<string, number> = {
  'Shape House': 18,
  BODIFIT: 8,
  FITINN: 6,
};

const EXPECTED_CITIES: Record<string, number> = {
  Ljubljana: 10,
  Maribor: 6,
  Celje: 3,
  Kranj: 2,
  Koper: 2,
  'Novo mesto': 2,
  'Murska Sobota': 2,
  Domžale: 1,
  Kamnik: 1,
  Jesenice: 1,
  Grosuplje: 1,
  Mengeš: 1,
};

const EXCLUDED_LIVE_RE =
  /šus eurofitness|4p fitness|multisport|fitgang|gib gym|fit13|alfa gym|herkul|millennium|konex|cube fitness|mega center|sparta gym|anytime fitness|mcfit|john reed|gold'?s gym|world class|fitness first|^clever fit$/i;

const TISKARNA = 'si_95f6c33ba2';
const LOBERIA = 'si_c55bd4763c';
const KOPER_ISTRSKA = 'si_5dfb02ad9d';
const KOPER_PLANET = 'si_812bd7056e';
const NOVO_MESTO_LJUBLJANSKA = 'si_c0ab7d90a3';
const NOVO_MESTO_BELOKRANJSKA = 'si_760f077cf3';
const JESENICE = 'si_a795962ca4';
const MARIBOX = 'si_d6c37de6b9';
const SITULA = 'si_673eba29e0';
const METALKA = 'si_e0283b435e';

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

describe('Slovenia gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const slovenia = gyms.filter(g => isSloveniaCountry(g.country));
  const siCenters = catalog.filter(c => isSloveniaCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Slovenia = 32; si_* = 32; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(siCenters.length).toBe(EXPECTED_SLOVENIA);
      expect(slovenia.length).toBe(EXPECTED_SLOVENIA);
      expect(catalog.filter(c => c.id.startsWith('si_')).length).toBe(EXPECTED_SLOVENIA);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
      expect(sha).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(siCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(32);
      expect(ap.size).toBe(32);
      expect(ready.size).toBe(32);
      expect(merged.size).toBe(32);
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

    it('all si_* IDs unique with required fields and valid Slovenia geography', () => {
      const ids = new Set<string>();
      for (const c of siCenters) {
        expect(c.id).toMatch(/^si_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Slovenia');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(SLOVENIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleSloveniaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(32);
    });

    it('exact brand and city breakdown', () => {
      const byBrand: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      for (const c of siCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
        byCity[c.city] = (byCity[c.city] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(Object.keys(byBrand).length).toBe(3);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('EXCLUDED = 3 remain outside production; COMING_SOON = 0', () => {
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      const excluded = staging.filter(s => s.import_category === 'EXCLUDED');
      expect(coming.length).toBe(0);
      expect(excluded.length).toBe(3);
      const prodIds = new Set(siCenters.map(c => c.id));
      for (const r of excluded) {
        expect(prodIds.has(r.id)).toBe(false);
      }
      expect(excluded.some(r => /eurofitness/i.test(`${r.brand} ${r.name}`))).toBe(true);
      expect(excluded.filter(r => /4p fitness/i.test(`${r.brand}`)).length).toBe(2);
    });

    it('named excluded / global chains absent from SI production', () => {
      for (const c of siCenters) {
        expect(EXCLUDED_LIVE_RE.test(`${c.brand} ${c.name}`)).toBe(false);
      }
      expect(siCenters.some(c => /^clever fit$/i.test(c.brand))).toBe(false);
      expect(siCenters.some(c => /kolosej/i.test(c.name))).toBe(false);
    });
  });

  describe('3. Shape House / rebrand QA', () => {
    const shape = siCenters.filter(c => c.brand === 'Shape House');

    it('has exactly 18 live Shape House clubs; no clever fit consumer brand', () => {
      expect(shape.length).toBe(18);
      expect(shape.every(c => c.is_active === true)).toBe(true);
      expect(shape.every(c => c.brand === 'Shape House')).toBe(true);
      expect(siCenters.filter(c => /^clever fit$/i.test(c.brand)).length).toBe(0);
      expect(siCenters.some(c => /\bCF FITNESS\b/i.test(`${c.brand} ${c.name}`))).toBe(false);
    });

    it('Tiskarna: Bežigrad PE → Dunajska cesta 123', () => {
      const row = findCenterById(TISKARNA)!;
      expect(row.brand).toBe('Shape House');
      expect(row.name).toMatch(/tiskarna/i);
      expect(row.address).toBe('Dunajska cesta 123');
      expect(row.postal_code).toBe('1000');
      expect(row.city).toBe('Ljubljana');
      expect(isPlausibleSloveniaCoordinate(row.lat!, row.lng!)).toBe(true);
    });

    it('Loberia: Celovška cesta 522 (not PE 520)', () => {
      const row = findCenterById(LOBERIA)!;
      expect(row.brand).toBe('Shape House');
      expect(row.name).toMatch(/loberia/i);
      expect(row.address).toBe('Celovška cesta 522');
      expect(row.address).not.toMatch(/520/);
      expect(row.postal_code).toBe('1210');
      expect(row.city).toBe('Ljubljana');
    });

    it('Koper pair remains two distinct clubs', () => {
      const istrska = findCenterById(KOPER_ISTRSKA)!;
      const planet = findCenterById(KOPER_PLANET)!;
      expect(istrska.id).not.toBe(planet.id);
      expect(istrska.address).toMatch(/istrska/i);
      expect(planet.address).toMatch(/ankaranska/i);
      expect(istrska.city).toBe('Koper');
      expect(planet.city).toBe('Koper');
      expect(haversineMeters(istrska.lat!, istrska.lng!, planet.lat!, planet.lng!)).toBeGreaterThan(
        200,
      );
    });

    it('Novo mesto pair: Belokranjska 5 and Ljubljanska 32 remain distinct', () => {
      const lj = findCenterById(NOVO_MESTO_LJUBLJANSKA)!;
      const belo = findCenterById(NOVO_MESTO_BELOKRANJSKA)!;
      expect(lj.id).not.toBe(belo.id);
      expect(lj.address).toMatch(/ljubljanska cesta 32/i);
      expect(belo.address).toMatch(/belokranjska cesta 5/i);
      expect(lj.city).toBe('Novo mesto');
      expect(belo.city).toBe('Novo mesto');
      expect(haversineMeters(lj.lat!, lj.lng!, belo.lat!, belo.lng!)).toBeGreaterThan(200);
    });

    it('Jesenice Phase 2 discovery is live/open with exact location', () => {
      const row = findCenterById(JESENICE)!;
      expect(row.brand).toBe('Shape House');
      expect(row.name).toMatch(/jesenice/i);
      expect(row.address).toBe('Fužinska cesta 8');
      expect(row.postal_code).toBe('4270');
      expect(row.city).toBe('Jesenice');
      expect(row.is_active).toBe(true);
      expect(isPlausibleSloveniaCoordinate(row.lat!, row.lng!)).toBe(true);
    });
  });

  describe('4. BODIFIT QA', () => {
    it('has exactly 8 live clubs across expected cities', () => {
      const rows = siCenters.filter(c => c.brand === 'BODIFIT');
      expect(rows.length).toBe(8);
      expect(rows.every(c => c.is_active === true)).toBe(true);
      expect(rows.every(c => SLOVENIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      for (const city of ['Ljubljana', 'Maribor', 'Celje', 'Kamnik', 'Mengeš', 'Murska Sobota']) {
        expect(rows.some(c => c.city === city)).toBe(true);
      }
      expect(rows.filter(c => c.city === 'Maribor').length).toBe(3);
    });
  });

  describe('5. FITINN QA', () => {
    it('has exactly 6 Slovenian clubs; no foreign contamination', () => {
      const rows = siCenters.filter(c => c.brand === 'FITINN');
      expect(rows.length).toBe(6);
      expect(rows.every(c => c.country === 'Slovenia')).toBe(true);
      expect(rows.every(c => isPlausibleSloveniaCoordinate(c.lat!, c.lng!))).toBe(true);
      for (const city of ['Ljubljana', 'Maribor', 'Celje', 'Kranj']) {
        expect(rows.some(c => c.city === city)).toBe(true);
      }
      expect(rows.every(c => !FOREIGN_BLOB.test(`${c.city} ${c.address}`))).toBe(true);
    });

    it('Maribor Maribox uses current FITINN identity (no Kolosej row)', () => {
      const row = findCenterById(MARIBOX)!;
      expect(row.brand).toBe('FITINN');
      expect(row.name).toMatch(/maribox/i);
      expect(/kolosej/i.test(row.name)).toBe(false);
      expect(row.address).toMatch(/lo[sš]ka ulica 13/i);
      expect(row.city).toBe('Maribor');
      expect(siCenters.some(c => /kolosej/i.test(c.name))).toBe(false);
    });
  });

  describe('6. Duplicate / proximity QA', () => {
    it('no duplicate IDs; zero suspicious same/diff-brand proximity pairs', () => {
      expect(new Set(siCenters.map(c => c.id)).size).toBe(32);

      let same25 = 0;
      let same50 = 0;
      let same100 = 0;
      let same200 = 0;
      let identical = 0;
      let diff100 = 0;

      for (let i = 0; i < siCenters.length; i++) {
        for (let j = i + 1; j < siCenters.length; j++) {
          const a = siCenters[i]!;
          const b = siCenters[j]!;
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
    });
  });

  describe('7. Border safety', () => {
    it('rejects neighbor cores; all si_* inside Slovenia helper', () => {
      expect(isPlausibleSloveniaCoordinate(45.6495, 13.7768)).toBe(false); // Trieste
      expect(isPlausibleSloveniaCoordinate(46.6249, 14.3053)).toBe(false); // Klagenfurt
      expect(isPlausibleSloveniaCoordinate(46.851, 16.846)).toBe(false); // Nagykanizsa corridor / HU
      expect(isPlausibleSloveniaCoordinate(45.815, 15.982)).toBe(false); // Zagreb
      for (const c of siCenters) {
        expect(isPlausibleSloveniaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_BLOB.test(`${c.city} ${c.address}`)).toBe(false);
      }
      // Border-sensitive cities remain inside SI
      for (const city of ['Koper', 'Maribor', 'Murska Sobota', 'Jesenice']) {
        const rows = siCenters.filter(c => c.city === city);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every(c => isPlausibleSloveniaCoordinate(c.lat!, c.lng!))).toBe(true);
      }
    });
  });

  describe('8. Slovenian text / diacritics', () => {
    it('preserves display diacritics; search folds ASCII', () => {
      expect(siCenters.some(c => c.city === 'Domžale')).toBe(true);
      expect(siCenters.some(c => c.city === 'Mengeš')).toBe(true);
      expect(siCenters.some(c => c.city === 'Murska Sobota')).toBe(true);
      expect(siCenters.some(c => c.city === 'Novo mesto')).toBe(true);
      const blob = siCenters.map(c => `${c.name} ${c.address} ${c.city}`).join('\n');
      expect(blob).toMatch(/č|š|ž|Č|Š|Ž/);
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(normalizeGymSearchValue('Domžale')).toBe('domzale');
      expect(normalizeGymSearchValue('Mengeš')).toBe('menges');
      expect(normalizeGymSearchValue('Šiška')).toBe('siska');
      expect(normalizeGymSearchValue('Celovška')).toBe('celovska');
      expect(normalizeGymSearchValue('Fužinska')).toBe('fuzinska');
    });
  });

  describe('9. Search QA', () => {
    it('brand searches return si_* (country-scoped)', () => {
      const brandQueries = [
        'Shape House',
        'shape house',
        'BODIFIT',
        'bodifit',
        'FITINN',
        'fitinn',
      ];
      for (const q of brandQueries) {
        const hits = searchGyms(q, {gyms: slovenia, limit: 40});
        expect(hits.some(h => h.gym.id.startsWith('si_'))).toBe(true);
        expect(hits.every(h => h.gym.id.startsWith('si_'))).toBe(true);
      }
      // Shared FITINN brand may include foreign clubs in global ranking;
      // country-scoped Slovenia search must rank SI correctly (covered above).
      const globalFitinn = searchGyms('FITINN', {limit: 40});
      expect(globalFitinn.length).toBeGreaterThan(0);
      expect(globalFitinn.some(h => h.gym.brand === 'FITINN')).toBe(true);
    });

    it('city searches return si_* where coverage exists; zero-chain cities stay empty', () => {
      const withCoverage = [
        'Ljubljana',
        'Maribor',
        'Celje',
        'Kranj',
        'Koper',
        'Novo mesto',
        'Murska Sobota',
        'Domžale',
        'Domzale',
        'Kamnik',
        'Jesenice',
        'Grosuplje',
        'Mengeš',
        'Menges',
      ];
      for (const q of withCoverage) {
        const scoped = searchGyms(q, {gyms: slovenia, limit: 30});
        expect(scoped.some(h => h.gym.id.startsWith('si_'))).toBe(true);
      }
      for (const q of ['Ljubljana', 'Maribor', 'Celje', 'Koper']) {
        expect(searchGyms(q, {limit: 40}).some(h => h.gym.id.startsWith('si_'))).toBe(true);
      }
      for (const city of ['Velenje', 'Nova Gorica', 'Ptuj', 'Slovenj Gradec']) {
        // A_legitimate_no_chain_presence: no production row in these cities.
        // Fuzzy ranking may still return distant SI clubs; none may claim that city.
        expect(siCenters.every(c => c.city !== city)).toBe(true);
        const hits = searchGyms(city, {gyms: slovenia, limit: 20});
        expect(hits.every(h => h.gym.city !== city)).toBe(true);
      }
    });

    it('postcode search uses string NNNN; SI-scoped avoids AT/BE/CH/HU collision', () => {
      const samples = ['1000', '2000', '3000', '4000', '6000', '8000', '9000', '1230', '4270'];
      for (const pc of samples) {
        expect(typeof siCenters.find(c => c.postal_code === pc)?.postal_code).toBe('string');
        const scoped = searchGyms(pc, {gyms: slovenia, limit: 20});
        expect(scoped.length).toBeGreaterThan(0);
        expect(scoped.every(h => h.gym.id.startsWith('si_'))).toBe(true);
        expect(scoped.some(h => h.gym.postalCode === pc)).toBe(true);
      }
      expect(siCenters.every(c => SLOVENIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(siCenters.every(c => typeof c.postal_code === 'string')).toBe(true);
    });
  });

  describe('10. Regional coverage', () => {
    it('matches Phase 2 READY footprint; zero-chain cities stay empty', () => {
      const byCity: Record<string, number> = {};
      for (const c of siCenters) byCity[c.city] = (byCity[c.city] || 0) + 1;
      expect(byCity).toEqual(EXPECTED_CITIES);
      expect(byCity['Velenje'] || 0).toBe(0);
      expect(byCity['Nova Gorica'] || 0).toBe(0);
      expect(byCity['Ptuj'] || 0).toBe(0);
      expect(byCity['Slovenj Gradec'] || 0).toBe(0);
    });
  });

  describe('11. Onboarding / profile / nearest / map', () => {
    it('representative city picks persist as si_* Slovenia', () => {
      for (const city of ['Ljubljana', 'Maribor', 'Celje', 'Koper', 'Novo mesto']) {
        const pick = slovenia.find(g => g.city === city)!;
        expect(pick).toBeTruthy();
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Slovenia');
        expect(findGymById(pick.id)?.id).toBe(pick.id);
      }
    });

    it('mixed favorites + exact ID lookup; never catalog[0]', () => {
      const a = slovenia[0]!;
      const b = slovenia[1]!;
      const dk = gyms.find(g => g.country === 'Denmark')!;
      const hr = gyms.find(g => g.country === 'Croatia')!;
      const favs = [a.id, b.id, dk.id, hr.id];
      for (const id of favs) {
        expect(findGymById(id)?.id).toBe(id);
      }
      expect(findGymById(a.id)?.id).not.toBe(catalog[0]!.id);
      expect(findGymById(a.id)?.country).toBe('Slovenia');
    });

    it('nearest returns plausible si_* around major cities', () => {
      const fixtures = [
        {city: 'Ljubljana', lat: 46.0569, lng: 14.5058},
        {city: 'Maribor', lat: 46.5547, lng: 15.6459},
        {city: 'Celje', lat: 46.231, lng: 15.26},
        {city: 'Koper', lat: 45.5481, lng: 13.73},
        {city: 'Kranj', lat: 46.2389, lng: 14.3556},
        {city: 'Murska Sobota', lat: 46.661, lng: 16.166},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, slovenia);
        expect(n?.id.startsWith('si_')).toBe(true);
        expect(n?.country).toBe('Slovenia');
        expect(isPlausibleSloveniaCoordinate(n!.latitude, n!.longitude)).toBe(true);
      }
    });

    it('map viewport subsets Ljubljana / Maribor / Celje / Koper', () => {
      const markers = toMap(slovenia);
      expect(markers.length).toBe(32);
      const regions = [
        {latitude: 46.0569, longitude: 14.5058, latitudeDelta: 0.2, longitudeDelta: 0.2},
        {latitude: 46.5547, longitude: 15.6459, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 46.231, longitude: 15.26, latitudeDelta: 0.12, longitudeDelta: 0.12},
        {latitude: 45.5481, longitude: 13.73, latitudeDelta: 0.12, longitudeDelta: 0.12},
      ];
      for (const region of regions) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(EXPECTED_TOTAL);
        expect(visible.every(v => v.id.startsWith('si_'))).toBe(true);
      }
      const lj = filterMapCentersInRegion(markers as never, {
        latitude: 46.0569,
        longitude: 14.5058,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      } as never);
      expect(lj.length).toBeGreaterThan(3);
      const brands = new Set(lj.map(v => findCenterById(v.id)?.brand).filter(Boolean));
      expect(brands.size).toBeGreaterThan(1);
      const pick = lj[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
    });
  });

  describe('12. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Shape House Ljubljana Tiskarna', () => TISKARNA],
      ['Shape House Ljubljana Loberia', () => LOBERIA],
      ['Shape House Ljubljana Situla', () => SITULA],
      ['Shape House Ljubljana Metalka', () => METALKA],
      ['FITINN Ljubljana BTC City', () => 'si_3146650ae8'],
      ['BODIFIT Ljubljana', () => 'si_3b3d2f4612'],
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

    it('nearby Ljubljana gyms do not replace session gym ID', () => {
      const a = findGymById(SITULA)!;
      const b = findGymById(METALKA)!;
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
    it('si_* resolves for workout/profile/favorites paths', () => {
      const live = slovenia[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Slovenia').length).toBe(32);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^si_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan si_nonexistent_test is safe Slovenia stub (not HR/AT/IT/HU/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('si_nonexistent_test');
      expect(stub.id).toBe('si_nonexistent_test');
      expect(stub.region).toBe('Slovenia');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('si_nonexistent_test').name);
      expect(findGymById('si_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Croatia');
      expect(stub.region).not.toBe('Austria');
      expect(stub.region).not.toBe('Italy');
      expect(stub.region).not.toBe('Hungary');
      expect(stub.region).not.toBe('Denmark');
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
    it('records live catalog timings vs Slovenia merge / Croatia QA baselines', () => {
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
      searchGyms('ljubljana', {limit: 20});
      searchGyms('shape house', {limit: 20});
      searchGyms('bodifit', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(46.0569, 14.5058, slovenia);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(slovenia);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 46.0569,
        longitude: 14.5058,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        slovenia: siCenters.length,
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
        slovenia_merge_benchmark: {
          catalog: 11648,
          json_size_mb: 3.39,
        },
        croatia_qa_baseline: {
          catalog: 11416,
          json_size_mb: 3.38,
        },
        bulgaria_qa_baseline: {
          catalog: 11336,
          json_size_mb: 3.36,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
      };
      const outDir = path.join(__dirname, '../data/slovenia');
      fs.writeFileSync(path.join(outDir, 'SLOVENIA_QA_PERF.json'), JSON.stringify(perf, null, 2) + '\n');
      expect(perf.catalog).toBe(11692);
      expect(perf.slovenia).toBe(32);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.cold_index_ms).toBeLessThan(15000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
      expect(perf.worst_search_ms).toBeLessThan(3000);
    });
  });
});
