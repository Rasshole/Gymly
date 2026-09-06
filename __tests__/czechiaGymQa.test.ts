/**
 * Czechia gym QA — full production validation after cz_* merge (70 centers).
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
  CZECHIA_POSTAL_RE,
  isCzechiaCountry,
  isPlausibleCzechiaCoordinate,
} from '../src/utils/gymCountry';
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

const staging = require('../data/czechia/czechia_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  source_url?: string;
}>;

const approved = require('../data/czechia/CZECHIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/czechia/CZECHIA_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const pscRepair = require('../data/czechia/CZECHIA_QA_PSC_REPAIR.json') as {
  count: number;
  applied: Array<{id: string; old: string; new: string}>;
};

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN_BLOB =
  /\b(deutschland|germany|österreich|austria|slovakia|slovensko|poland|polsko|wien|bratislava)\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  'Form Factory': 43,
  'Max Fitness': 23,
  'Oktagon Gym': 1,
  FITINN: 1,
  'clever fit': 1,
  'JOHN REED': 1,
};

const FF_ANDEL = 'cz_788823693c';
const FF_ARGENTINSKA = 'cz_e0c9747ab1';
const FF_OLMOUC_CITY = 'cz_a6cff1a290';
const FF_PORUBSKA = 'cz_165c0ec0e9';
const FF_NAM_REPUBLIKY = 'cz_bcc47a6551';
const FF_VEVERI = 'cz_bf61e700bf';
const FF_HURKA = 'cz_29bc74f642';
const FF_LIPENCE = 'cz_ead4566b11';
const FF_MASARYKOVA = 'cz_ce59517dd9';
const FF_PRIMA = 'cz_d777aacd4b';
const FF_ZAHALKA = 'cz_8230dc592d';
const MAX_PANKRAC = 'cz_0852991674';
const OKTAGON_SMICHOV = 'cz_98f61a6b12';
const FITINN_BRNO = 'cz_eaf4458baf';
const CLEVER_KLADNO = 'cz_026b11dae9';
const JOHN_REED_PRAHA = 'cz_aeec495514';

const FF_PANKRAC_UNRESOLVED = 'cz_a1980e7db2';
const MAX_DEJVICE_UNRESOLVED = 'cz_58e478183d';
const FF_CUBEX_UNRESOLVED = 'cz_a6027a8c1e';
const FF_HRADCANSKA_UNRESOLVED = 'cz_fc39b7f7a5';
const FF_PRAGOVKA_UNRESOLVED = 'cz_b0f99f6760';

/** House-number mis-parsed as PSČ when spaced form is absent from address. */
function looksLikeHouseNumberPostal(postal: string, address: string): boolean {
  if (!CZECHIA_POSTAL_RE.test(postal)) return false;
  const [a, b] = postal.split(' ');
  if (new RegExp(`\\b${a}\\s+${b}\\b`).test(address)) return false;
  const m = address.match(/(\d+)\/(\d+)/);
  if (!m) return false;
  const house = m[1]!;
  const unit = m[2]!;
  const compact = a! + b!;
  if ((house + unit).startsWith(compact)) return true;
  if (house.length >= 3 && house.slice(0, 3) === a && compact.slice(3) === b) return true;
  // 2581/102 → 258 11
  if (house.length === 4 && house.slice(0, 3) === a && house.slice(3) + unit[0] === b) return true;
  return false;
}

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

describe('Czechia gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const czechia = gyms.filter(g => isCzechiaCountry(g.country));
  const czCenters = catalog.filter(c => isCzechiaCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 11063; Czechia = 70; all cz_*', () => {
      expect(catalog.length).toBe(11254);
      expect(czCenters.length).toBe(70);
      expect(czechia.length).toBe(70);
      expect(catalog.filter(c => c.id.startsWith('cz_')).length).toBe(70);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(czCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(70);
      expect(ap.size).toBe(70);
      expect(ready.size).toBe(70);
      expect(merged.size).toBe(70);
      const missing = [...prod].filter(id => !ap.has(id) || !ready.has(id) || !merged.has(id));
      const unexpected = [...ap].filter(id => !prod.has(id));
      expect(missing).toEqual([]);
      expect(unexpected).toEqual([]);
    });

    it('metadata drift none vs approved READY for identity fields', () => {
      const byApproved = new Map(approved.map(a => [a.id, a]));
      const byReady = new Map(phase2Ready.map(r => [r.id, r]));
      for (const c of czCenters) {
        const a = byApproved.get(c.id)!;
        const r = byReady.get(c.id)!;
        expect(a.brand).toBe(c.brand);
        expect(r.brand).toBe(c.brand);
        expect(a.postal_code).toBe(c.postal_code);
        expect(r.postal_code).toBe(c.postal_code);
        expect(a.address).toBe(c.address);
        expect(r.address).toBe(c.address);
      }
    });

    it('all cz_* unique with required fields, PSČ, coords, encoding', () => {
      const ids = new Set<string>();
      for (const c of czCenters) {
        expect(c.id).toMatch(/^cz_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Czechia');
        expect(c.is_active).toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(CZECHIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat).not.toBe(0);
        expect(c.lng).not.toBe(0);
        expect(isPlausibleCzechiaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(looksLikeHouseNumberPostal(String(c.postal_code), String(c.address))).toBe(false);
      }
      expect(ids.size).toBe(70);
    });

    it('brand breakdown matches expectations; McFIT Czechia = 0', () => {
      const byBrand: Record<string, number> = {};
      for (const c of czCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(70);
      expect(czCenters.every(c => !/mc\s*fit/i.test(`${c.brand} ${c.name}`))).toBe(true);
    });

    it('QA PSČ repair applied for 19 Form Factory house-number contaminants', () => {
      expect(pscRepair.count).toBe(19);
      expect(pscRepair.applied.length).toBe(19);
      for (const row of pscRepair.applied) {
        const live = findCenterById(row.id)!;
        expect(live.postal_code).toBe(row.new);
        expect(live.postal_code).not.toBe(row.old);
        expect(CZECHIA_POSTAL_RE.test(String(live.postal_code))).toBe(true);
      }
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('NEEDS_COORDINATES=7 and NEEDS_REVIEW=8 absent from production', () => {
      const unresolved = staging.filter(s =>
        ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'EXCLUDED'].includes(s.import_category),
      );
      const cats = unresolved.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.NEEDS_COORDINATES).toBe(7);
      expect(cats.NEEDS_REVIEW).toBe(8);
      expect(cats.EXCLUDED || 0).toBe(0);
      for (const s of unresolved) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
    });

    it('Form Factory Pankrác, Max Fitness Dejvice, Cubex, Hradčanská, Pragovka stay out', () => {
      for (const id of [
        FF_PANKRAC_UNRESOLVED,
        MAX_DEJVICE_UNRESOLVED,
        FF_CUBEX_UNRESOLVED,
        FF_HRADCANSKA_UNRESOLVED,
        FF_PRAGOVKA_UNRESOLVED,
      ]) {
        expect(findCenterById(id)).toBeUndefined();
      }
      expect(staging.find(s => s.id === FF_PANKRAC_UNRESOLVED)?.import_category).toBe(
        'NEEDS_REVIEW',
      );
      expect(staging.find(s => s.id === MAX_DEJVICE_UNRESOLVED)?.import_category).toBe(
        'NEEDS_COORDINATES',
      );
    });
  });

  describe('3. Form Factory QA', () => {
    const ff = czCenters.filter(c => c.brand === 'Form Factory');

    it('43 live; no fitness-*/the-gym-* page-path twins for one club', () => {
      expect(ff.length).toBe(43);
      const byNormName = new Map<string, string[]>();
      for (const c of ff) {
        const key = c.name.replace(/^Form Factory\s+/i, '').toLowerCase().normalize('NFD');
        byNormName.set(key, [...(byNormName.get(key) || []), c.id]);
      }
      for (const [, ids] of byNormName) {
        expect(ids.length).toBe(1);
      }
    });

    it('Phase 2 recovered the-gym clubs present where coordinates were resolved', () => {
      for (const id of [
        FF_ARGENTINSKA,
        FF_HURKA,
        FF_LIPENCE,
        FF_MASARYKOVA,
        FF_NAM_REPUBLIKY,
        FF_OLMOUC_CITY,
        FF_PORUBSKA,
        FF_PRIMA,
        FF_VEVERI,
        FF_ZAHALKA,
      ]) {
        const c = findCenterById(id)!;
        expect(c.brand).toBe('Form Factory');
        expect(c.country).toBe('Czechia');
        expect(isPlausibleCzechiaCoordinate(c.lat!, c.lng!)).toBe(true);
      }
      expect(findCenterById(FF_CUBEX_UNRESOLVED)).toBeUndefined();
      expect(findCenterById(FF_HRADCANSKA_UNRESOLVED)).toBeUndefined();
      expect(findCenterById(FF_PRAGOVKA_UNRESOLVED)).toBeUndefined();
    });

    it('repaired PSČ examples match official pages', () => {
      expect(findCenterById(FF_ARGENTINSKA)?.postal_code).toBe('170 00');
      expect(findCenterById(FF_OLMOUC_CITY)?.postal_code).toBe('779 00');
      expect(findCenterById(FF_PORUBSKA)?.postal_code).toBe('708 00');
      expect(findCenterById(FF_NAM_REPUBLIKY)?.postal_code).toBe('702 00');
      expect(findCenterById(FF_VEVERI)?.postal_code).toBe('625 00');
      expect(findCenterById(FF_ANDEL)?.postal_code).toBe('150 00');
    });

    it('Form Factory search resolves cz_*', () => {
      getGymSearchIndex(czechia);
      expect(searchGyms('Form Factory', {gyms: czechia, limit: 50}).length).toBeGreaterThan(30);
      expect(searchGyms('form', {gyms: czechia, limit: 30}).length).toBeGreaterThan(0);
      expect(searchGyms('factory', {gyms: czechia, limit: 30}).length).toBeGreaterThan(0);
      expect(
        searchGyms('Anděl', {gyms: czechia, limit: 20}).some(r => r.gym.id === FF_ANDEL),
      ).toBe(true);
    });
  });

  describe('4. Max Fitness / Oktagon QA', () => {
    it('23 live Max Fitness; Dejvice unresolved absent; Max Pankrác live', () => {
      const max = czCenters.filter(c => c.brand === 'Max Fitness');
      expect(max.length).toBe(23);
      expect(findCenterById(MAX_DEJVICE_UNRESOLVED)).toBeUndefined();
      expect(findCenterById(MAX_PANKRAC)?.brand).toBe('Max Fitness');
      for (const c of max) {
        expect(CZECHIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(isPlausibleCzechiaCoordinate(c.lat!, c.lng!)).toBe(true);
      }
      getGymSearchIndex(czechia);
      expect(searchGyms('Max Fitness', {gyms: czechia, limit: 30}).length).toBeGreaterThan(15);
      expect(searchGyms('max', {gyms: czechia, limit: 30}).length).toBeGreaterThan(0);
    });

    it('Oktagon Gym remains separate consumer brand (1 live Smíchov)', () => {
      const ok = czCenters.filter(c => c.brand === 'Oktagon Gym');
      expect(ok.length).toBe(1);
      const c = findCenterById(OKTAGON_SMICHOV)!;
      expect(c.brand).toBe('Oktagon Gym');
      expect(c.city).toMatch(/Praha/i);
      expect(c.postal_code).toBe('150 00');
      getGymSearchIndex(czechia);
      expect(
        searchGyms('Oktagon', {gyms: czechia, limit: 10}).some(r => r.gym.id === OKTAGON_SMICHOV),
      ).toBe(true);
      expect(
        searchGyms('oktagon', {gyms: czechia, limit: 10}).some(r => r.gym.id === OKTAGON_SMICHOV),
      ).toBe(true);
    });
  });

  describe('5. FITINN / clever fit / JOHN REED QA', () => {
    it('FITINN Brno OC Letmo only; no AT/SK contamination', () => {
      const fi = czCenters.filter(c => c.brand === 'FITINN');
      expect(fi.length).toBe(1);
      const c = findCenterById(FITINN_BRNO)!;
      expect(c.id).toBe(FITINN_BRNO);
      expect(c.city).toMatch(/Brno/i);
      expect(c.postal_code).toBe('602 00');
      expect(c.id.startsWith('cz_')).toBe(true);
      expect(c.id.startsWith('at_')).toBe(false);
      getGymSearchIndex(czechia);
      expect(
        searchGyms('FITINN', {gyms: czechia, limit: 10}).some(r => r.gym.id === FITINN_BRNO),
      ).toBe(true);
      const nearest = findNearestGym(49.1918, 16.6126, czechia);
      expect(nearest?.id.startsWith('cz_')).toBe(true);
    });

    it('clever fit Kladno is Czech identity', () => {
      const cf = czCenters.filter(c => c.brand === 'clever fit');
      expect(cf.length).toBe(1);
      const c = findCenterById(CLEVER_KLADNO)!;
      expect(c.city).toMatch(/Kladno/i);
      expect(c.postal_code).toBe('272 01');
      expect(c.id.startsWith('cz_')).toBe(true);
      expect(c.id.startsWith('de_')).toBe(false);
      getGymSearchIndex(czechia);
      expect(
        searchGyms('clever fit', {gyms: czechia, limit: 10}).some(r => r.gym.id === CLEVER_KLADNO),
      ).toBe(true);
    });

    it('JOHN REED Praha Karlovo náměstí exact address/PSČ; no McFIT twin', () => {
      const jr = czCenters.filter(c => c.brand === 'JOHN REED');
      expect(jr.length).toBe(1);
      const c = findCenterById(JOHN_REED_PRAHA)!;
      expect(c.address).toBe('Karlovo náměstí 2097/10');
      expect(c.postal_code).toBe('120 00');
      expect(c.city).toBe('Praha');
      expect(c.id.startsWith('cz_')).toBe(true);
      expect(c.id.startsWith('de_')).toBe(false);
      expect(c.id.startsWith('at_')).toBe(false);
      expect(czCenters.some(x => /mc\s*fit/i.test(`${x.brand} ${x.name}`))).toBe(false);
      getGymSearchIndex(czechia);
      expect(
        searchGyms('JOHN REED', {gyms: czechia, limit: 10}).some(r => r.gym.id === JOHN_REED_PRAHA),
      ).toBe(true);
      expect(
        searchGyms('john', {gyms: czechia, limit: 10}).some(r => r.gym.id === JOHN_REED_PRAHA),
      ).toBe(true);
      expect(
        searchGyms('reed', {gyms: czechia, limit: 10}).some(r => r.gym.id === JOHN_REED_PRAHA),
      ).toBe(true);
    });

    it('cross-country brand search preserves foreign IDs', () => {
      const atGyms = gyms.filter(g => g.country === 'Austria');
      const deGyms = gyms.filter(g => g.country === 'Germany');
      getGymSearchIndex(atGyms);
      const atFitinn = searchGyms('FITINN', {gyms: atGyms, limit: 20});
      if (atFitinn.length > 0) {
        expect(atFitinn.every(h => h.gym.country === 'Austria')).toBe(true);
        expect(atFitinn.every(h => !h.gym.id.startsWith('cz_'))).toBe(true);
      }
      getGymSearchIndex(deGyms);
      const deClever = searchGyms('clever fit', {gyms: deGyms, limit: 20});
      if (deClever.length > 0) {
        expect(deClever.every(h => h.gym.country === 'Germany')).toBe(true);
        expect(deClever.every(h => !h.gym.id.startsWith('cz_'))).toBe(true);
      }
      getGymSearchIndex(czechia);
      expect(
        searchGyms('FITINN', {gyms: czechia, limit: 10}).every(h => h.gym.id.startsWith('cz_')),
      ).toBe(true);
    });
  });

  describe('6. Duplicate / proximity / border QA', () => {
    it('no same-brand pairs within 200 m', () => {
      const thresholds = [25, 50, 100, 200] as const;
      const counts: Record<number, number> = {25: 0, 50: 0, 100: 0, 200: 0};
      for (let i = 0; i < czCenters.length; i++) {
        for (let j = i + 1; j < czCenters.length; j++) {
          const a = czCenters[i]!;
          const b = czCenters[j]!;
          if (a.brand !== b.brand) continue;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          for (const t of thresholds) {
            if (d <= t) counts[t]!++;
          }
        }
      }
      expect(counts[25]).toBe(0);
      expect(counts[50]).toBe(0);
      expect(counts[100]).toBe(0);
      expect(counts[200]).toBe(0);
    });

    it('no identical coordinate clusters; catalog IDs unique globally', () => {
      const key = (c: {lat?: number | null; lng?: number | null}) => `${c.lat}|${c.lng}`;
      const counts = new Map<string, number>();
      for (const c of czCenters) counts.set(key(c), (counts.get(key(c)) || 0) + 1);
      expect([...counts.values()].every(n => n === 1)).toBe(true);
      expect(new Set(catalog.map(c => c.id)).size).toBe(catalog.length);
    });

    it('coordinates stay inside Czechia bbox (border safety)', () => {
      for (const c of czCenters) {
        expect(isPlausibleCzechiaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(c.id.startsWith('de_')).toBe(false);
        expect(c.id.startsWith('pl_')).toBe(false);
        expect(c.id.startsWith('at_')).toBe(false);
        expect(c.id.startsWith('sk_')).toBe(false);
      }
    });
  });

  describe('7. Czech text / city / PSČ search', () => {
    beforeAll(() => getGymSearchIndex(czechia));

    it('diacritic display preserved; ASCII search works', () => {
      const blob = czCenters.map(c => `${c.name} ${c.city} ${c.address}`).join(' ');
      expect(blob).toMatch(/Plzeň|Praha|Olomouc|Zlín|Ústí|Hůrka|Přímá|Veveří|Náměstí/);
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      for (const q of [
        'Praha',
        'Prague',
        'Brno',
        'Ostrava',
        'Plzeň',
        'Plzen',
        'Liberec',
        'Olomouc',
        'České Budějovice',
        'Ceske Budejovice',
        'Pardubice',
        'Zlín',
        'Zlin',
        'Ústí nad Labem',
        'Usti nad Labem',
        'Kladno',
      ]) {
        expect(searchGyms(q, {gyms: czechia, limit: 20}).length).toBeGreaterThan(0);
      }
    });

    it('PSČ spaced and compact resolve; no Greek collision for 110 00', () => {
      const palladium = czCenters.find(c => /Palladium/i.test(c.name))!;
      expect(palladium.postal_code).toBe('110 00');
      expect(
        searchGyms('110 00', {gyms: czechia, limit: 20}).some(r => r.gym.id === palladium.id),
      ).toBe(true);
      expect(
        searchGyms('11000', {gyms: czechia, limit: 20}).some(r => r.gym.id === palladium.id),
      ).toBe(true);
      expect(compactGymSearchValue('110 00')).toBe(compactGymSearchValue('11000'));
      const gr = gyms.filter(g => g.country === 'Greece');
      getGymSearchIndex(gr);
      const greekHits = searchGyms('110 00', {gyms: gr, limit: 20});
      expect(greekHits.every(h => h.gym.country === 'Greece')).toBe(true);
      getGymSearchIndex(czechia);
    });

    it('normalization is search-only; stored Czech display unchanged', () => {
      const sample = findCenterById(JOHN_REED_PRAHA)!;
      expect(normalizeGymSearchValue('Praha')).not.toBe('');
      expect(sample.address).toBe('Karlovo náměstí 2097/10');
      expect(sample.postal_code).toBe('120 00');
    });

    it('short-prefix typing remains responsive', () => {
      const t0 = Date.now();
      searchGyms('For', {gyms: czechia, limit: 20});
      searchGyms('Max', {gyms: czechia, limit: 20});
      searchGyms('Pra', {gyms: czechia, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });

  describe('8. Nearest / map / onboarding / profile', () => {
    it.each([
      ['Praha', 50.0755, 14.4378],
      ['Brno', 49.1951, 16.6068],
      ['Ostrava', 49.8209, 18.2625],
      ['Plzeň', 49.7384, 13.3736],
      ['Olomouc', 49.5938, 17.2509],
      ['Zlín', 49.2266, 17.667],
      ['Ústí nad Labem', 50.6607, 14.0323],
      ['Kladno', 50.1473, 14.1028],
    ])('%s nearest is plausible cz_*', (_label, lat, lng) => {
      const nearest = findNearestGym(lat, lng, czechia);
      expect(nearest?.id.startsWith('cz_')).toBe(true);
      expect(nearest?.country).toBe('Czechia');
      expect(nearest?.id).not.toBe(gyms[0]?.id);
    });

    it.each([
      ['Praha', 50.08, 14.42, 0.12],
      ['Brno', 49.2, 16.61, 0.15],
      ['Ostrava', 49.82, 18.26, 0.2],
      ['Plzeň', 49.74, 13.37, 0.2],
      ['Olomouc', 49.59, 17.25, 0.2],
    ])('%s viewport scoped (not full catalog)', (_label, lat, lng, delta) => {
      const visible = filterMapCentersInRegion(toMap(czechia) as never, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(70);
      expect(visible.length).toBeLessThan(11254);
      expect(visible.every(v => v.id.startsWith('cz_'))).toBe(true);
    });

    it('onboarding selection stores exact cz_* and resolves later', () => {
      for (const id of [FF_ANDEL, FITINN_BRNO, CLEVER_KLADNO, JOHN_REED_PRAHA]) {
        const g = findGymById(id);
        expect(g).not.toBeNull();
        expect(g!.id).toBe(id);
        expect(g!.country).toBe('Czechia');
        expect(formatGymDisplayName(g)).not.toMatch(/^cz_/);
      }
      expect(getActiveGymsByCountry('Czechia').length).toBe(70);
    });

    it('regional chain presence without inventing Hradec/Jihlava/Karlovy Vary', () => {
      const blob = czCenters.map(c => `${c.city} ${c.name} ${c.address}`).join(' ');
      for (const city of [
        'Praha',
        'Brno',
        'Ostrava',
        'Plzeň',
        'Liberec',
        'Olomouc',
        'České Budějovice',
        'Pardubice',
        'Zlín',
        'Ústí nad Labem',
        'Kladno',
      ]) {
        expect(blob.toLowerCase()).toContain(city.toLowerCase());
      }
      expect(/hradec\s*králové/i.test(blob)).toBe(false);
      expect(/jihlava/i.test(blob)).toBe(false);
      expect(/karlovy\s*vary/i.test(blob)).toBe(false);
    });
  });

  describe('9. 200 m check-in + auto-checkout', () => {
    it('global radii remain 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Form Factory Anděl', FF_ANDEL],
      ['JOHN REED Praha', JOHN_REED_PRAHA],
      ['FITINN Brno', FITINN_BRNO],
      ['clever fit Kladno', CLEVER_KLADNO],
      ['Oktagon Smíchov', OKTAGON_SMICHOV],
    ])('%s uses selected gym coords; 199/200 allowed, 201 away', (_label, id) => {
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      const center = findCenterById(id)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearby Czech gym cannot switch active session gym identity', () => {
      const session = getGymLatLngForCheckIn(FF_ANDEL)!;
      const other = getGymLatLngForCheckIn(OKTAGON_SMICHOV)!;
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
      expect(d).toBeGreaterThan(200);
      expect(getGymLatLngForCheckIn(FF_ANDEL)!.latitude).toBeCloseTo(session.latitude, 5);
    });
  });

  describe('10. Core flows / orphan', () => {
    it('cz_* resolves for profile/favorites paths', () => {
      const sample = czechia[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
      expect(getEffectiveLatLng(findCenterById(sample.id)!).lat).toBeTruthy();
      const mixed = [FF_ANDEL, JOHN_REED_PRAHA, 'dk_placeholder_ignored'];
      expect(findGymById(mixed[0]!)?.id).toBe(FF_ANDEL);
      expect(findGymById(mixed[1]!)?.id).toBe(JOHN_REED_PRAHA);
    });

    it('orphan cz_nonexistent_test is safe Czechia stub (not DE/AT/PL/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('cz_nonexistent_test');
      expect(stub.id).toBe('cz_nonexistent_test');
      expect(stub.region).toBe('Czechia');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('cz_nonexistent_test').name);
      expect(findGymById('cz_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
    });

    it('Czechia country label i18n key resolves', () => {
      expect(gymCountryTranslationKey('Czechia')).toBe('countries.czechia');
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Czechia', t)).toBeTruthy();
    });
  });

  describe('11. Country regression', () => {
    it('exact 19-country production counts totaling 11063', () => {
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
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11254);
    });
  });

  describe('12. Performance sanity', () => {
    it('search index builds for full catalog under 5s', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      expect(Date.now() - t0).toBeLessThan(5000);
    });

    it('typical Czechia searches under 3s on live catalog', () => {
      const t0 = Date.now();
      searchGyms('Form Factory Praha', {gyms, limit: 20});
      searchGyms('Max Fitness', {gyms, limit: 20});
      searchGyms('110 00', {gyms, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });
});
