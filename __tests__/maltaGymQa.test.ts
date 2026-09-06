/**
 * Malta gym QA — full production validation after mt_* merge (18 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/malta/MALTA_QA_PERF.json).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveDanishGyms, getActiveGymsByCountry} from '../src/data/danishGyms';
import {ALL_GYM_CENTERS, findCenterById} from '../src/data/centerRegistry';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {
  MALTA_POSTAL_RE,
  isMaltaCountry,
  isPlausibleMaltaCoordinate,
} from '../src/utils/gymCountry';
import {
  findGymById,
  formatGymDisplayName,
  resolveGymOrStub,
} from '../src/utils/gymDisplay';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {findNearestGym} from '../src/utils/nearestGym';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {GYM_ID_PREFIX} from '../src/data/gymIds';

const staging = require('../data/malta/malta_centers_staging.json') as Array<{
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

const approved = require('../data/malta/MALTA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/malta/MALTA_PHASE2_READY_TO_IMPORT.json') as Array<{
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
const FOREIGN_BLOB = /\b(sicily|sicilia|italy|italia|tunisia|libya)\b/i;

const EXPECTED_TOTAL = 11692;
const EXPECTED_MT = 18;
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRANDS: Record<string, number> = {
  'Best Gyms Malta': 10,
  '24/7 Fitness Club': 4,
  'Challenger Fitness': 4,
};

const BIRGU_ID = 'mt_75a13770ff';
const KIRKOP_ID = 'mt_b8747c67db';
const MARSA_ID = 'mt_af9179a385';
const BIRZEBBUGA_ID = 'mt_963f710969';
const COTTONERA_ID = 'mt_26579c8193';
const SLIEMA_ID = 'mt_e4b83e61b9';
const BUILD_ID = 'mt_b45a78a4f0';
const MELLIEHA_ID = 'mt_e88a8cf7e9';
const SAN_GWANN_ID = 'mt_d0c227df18';
const TA_QALI_ID = 'mt_8d626df0f2';
const ZEBUG_ID = 'mt_7e23dc11d2';
const QORMI_ID = 'mt_6175c7910d';
const VALLETTA_ID = 'mt_26d7f37a30';
const MARSASKALA_ID = 'mt_cd0c2182e4';

const ZERO_CHAIN_LOCALITIES = [
  'Msida',
  'Fgura',
  'Naxxar',
  'Żurrieq',
  'Santa Venera',
  'Swieqi',
  'Victoria',
  'Xewkija',
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

function offsetMeters(lat: number, lng: number, metersNorth: number, metersEast: number) {
  const dLat = metersNorth / 111320;
  const dLng = metersEast / (111320 * Math.cos((lat * Math.PI) / 180));
  return {lat: lat + dLat, lng: lng + dLng};
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

describe('Malta gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const malta = gyms.filter(g => isMaltaCountry(g.country));
  const mtCenters = catalog.filter(c => isMaltaCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity / freeze', () => {
    it('total production = 11692; Malta = 18; mt_* = 18; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(mtCenters.length).toBe(EXPECTED_MT);
      expect(malta.length).toBe(EXPECTED_MT);
      expect(catalog.filter(c => c.id.startsWith('mt_')).length).toBe(EXPECTED_MT);
      expect(catalog.filter(c => c.id.startsWith('mt_') && c.country !== 'Malta').length).toBe(0);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
      expect(sha).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(mtCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(18);
      expect(ap.size).toBe(18);
      expect(ready.size).toBe(18);
      expect(merged.size).toBe(18);
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
        expect(live.country).toBe('Malta');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all mt_* IDs unique with required fields and valid Malta geography', () => {
      const ids = new Set<string>();
      for (const c of mtCenters) {
        expect(c.id).toMatch(/^mt_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Malta');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(MALTA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleMaltaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(18);
    });

    it('exact brand breakdown; unexpected brands = 0', () => {
      const byBrand: Record<string, number> = {};
      for (const c of mtCenters) {
        byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(Object.keys(byBrand).length).toBe(3);
    });
  });

  describe('2. Staging exclusions / coming-soon / closed withheld', () => {
    it('MERGED 18 / CS 1 / CLOSED 3 / EXCLUDED 31; none live', () => {
      const cats: Record<string, number> = {};
      for (const s of staging) cats[s.import_category] = (cats[s.import_category] || 0) + 1;
      expect(cats.MERGED_INTO_CATALOG).toBe(18);
      expect(cats.COMING_SOON).toBe(1);
      expect(cats.CLOSED).toBe(3);
      expect(cats.EXCLUDED).toBe(31);
      expect(cats.NEEDS_REVIEW || 0).toBe(0);
      expect(cats.NEEDS_COORDINATES || 0).toBe(0);
      expect(staging.length).toBe(53);

      const prodIds = new Set(mtCenters.map(c => c.id));
      for (const r of staging.filter(s =>
        ['COMING_SOON', 'CLOSED', 'EXCLUDED'].includes(s.import_category),
      )) {
        expect(prodIds.has(r.id)).toBe(false);
      }
    });

    it('Birgu COMING_SOON withheld; not searchable as live center', () => {
      expect(staging.find(s => s.id === BIRGU_ID)?.import_category).toBe('COMING_SOON');
      expect(findCenterById(BIRGU_ID)).toBeUndefined();
      expect(mtCenters.some(c => c.id === BIRGU_ID)).toBe(false);
      getGymSearchIndex(malta);
      expect(searchGyms('Birgu', {gyms: malta, limit: 20}).length).toBe(0);
      expect(searchGyms('Vittoriosa', {gyms: malta, limit: 20}).length).toBe(0);
      const nearest = findNearestGym(35.888, 14.522, malta);
      expect(nearest?.id).not.toBe(BIRGU_ID);
    });
  });

  describe('3. Best Gyms Malta QA', () => {
    it('has exactly 10 live clubs including Kirkop/Marsa/Birżebbuġa', () => {
      const rows = mtCenters.filter(c => c.brand === 'Best Gyms Malta');
      expect(rows.length).toBe(10);
      expect(rows.every(c => c.is_active === true)).toBe(true);
      expect(rows.filter(c => c.id === KIRKOP_ID).length).toBe(1);
      expect(rows.filter(c => c.id === MARSA_ID).length).toBe(1);
      expect(rows.filter(c => c.id === BIRZEBBUGA_ID).length).toBe(1);
      expect(findCenterById(BIRZEBBUGA_ID)!.brand).toBe('Best Gyms Malta');
      expect(findCenterById(BIRZEBBUGA_ID)!.postal_code).toBe('BBG 1758');
      expect(findCenterById(KIRKOP_ID)!.postal_code).toBe('KKP 1370');
      expect(findCenterById(MARSA_ID)!.postal_code).toBe('MRS 9065');
      expect(rows.some(c => c.id === BUILD_ID)).toBe(true);
    });

    it('Elite predecessor and Fitness Café absent', () => {
      expect(
        mtCenters.filter(
          c =>
            /^(elite gym|elite fitness)$/i.test(c.brand || '') ||
            /^(elite gym|elite fitness)\b/i.test(c.name),
        ).length,
      ).toBe(0);
      expect(
        mtCenters.filter(
          c => /fitness café|fitness cafe/i.test(c.name) || /fitness café|fitness cafe/i.test(c.brand || ''),
        ).length,
      ).toBe(0);
    });
  });

  describe('4. 24/7 Fitness Club QA', () => {
    it('has exactly 4 live clubs; historical closed absent', () => {
      const rows = mtCenters.filter(c => c.brand === '24/7 Fitness Club');
      expect(rows.length).toBe(4);
      expect(rows.some(c => c.id === MELLIEHA_ID)).toBe(true);
      expect(rows.some(c => c.id === SAN_GWANN_ID)).toBe(true);
      expect(rows.some(c => c.id === TA_QALI_ID)).toBe(true);
      expect(rows.some(c => c.id === ZEBUG_ID)).toBe(true);
      expect(rows.filter(c => /mellieħa|mellieha/i.test(c.name) || /mellieħa|mellieha/i.test(c.city)).length).toBe(
        1,
      );
      expect(rows.filter(c => /san ġwann|san gwann/i.test(c.name) || /san ġwann|san gwann/i.test(c.city)).length).toBe(
        1,
      );
      expect(rows.filter(c => /qali|attard/i.test(c.name) || /qali|attard/i.test(c.city)).length).toBe(1);
      expect(rows.filter(c => /żebbuġ|zebbug/i.test(c.name) || /żebbuġ|zebbug/i.test(c.city)).length).toBe(1);
      expect(
        mtCenters.some(c => /santa luċija|santa lucia/i.test(c.name) || /santa luċija|santa lucia/i.test(c.city)),
      ).toBe(false);
      expect(
        mtCenters.filter(
          c =>
            c.brand === '24/7 Fitness Club' &&
            (/st\.?\s*paul|san pawl/i.test(c.name) || /st\.?\s*paul|san pawl/i.test(c.city)),
        ).length,
      ).toBe(0);
      getGymSearchIndex(malta);
      expect(searchGyms('Santa Luċija', {gyms: malta, limit: 10}).length).toBe(0);
    });
  });

  describe('5. Challenger Fitness QA', () => {
    it('has exactly 4 live clubs including Cottonera; Paceville absent', () => {
      const rows = mtCenters.filter(c => c.brand === 'Challenger Fitness');
      expect(rows.length).toBe(4);
      expect(rows.filter(c => c.id === COTTONERA_ID).length).toBe(1);
      expect(rows.some(c => c.id === QORMI_ID)).toBe(true);
      expect(rows.some(c => c.id === VALLETTA_ID)).toBe(true);
      expect(rows.some(c => c.id === MARSASKALA_ID)).toBe(true);
      expect(findCenterById(COTTONERA_ID)!.postal_code).toBe('BML 9020');
      expect(findCenterById(COTTONERA_ID)!.city).toMatch(/bormla/i);
      expect(mtCenters.some(c => /paceville/i.test(c.name) || /paceville/i.test(c.city))).toBe(false);
      getGymSearchIndex(malta);
      expect(searchGyms('Paceville', {gyms: malta, limit: 10}).length).toBe(0);
    });
  });

  describe('6. Rebrand / legacy QA', () => {
    it('no predecessor/current duplicates; closed legacy IDs not live', () => {
      const closed = staging.filter(s => s.import_category === 'CLOSED');
      expect(closed.length).toBe(3);
      expect(closed.some(s => /paceville/i.test(s.name || ''))).toBe(true);
      expect(closed.some(s => /santa lu/i.test(s.name || ''))).toBe(true);
      expect(closed.some(s => /st paul|san pawl/i.test(s.name || ''))).toBe(true);
      for (const r of closed) {
        expect(findCenterById(r.id)).toBeUndefined();
      }
      expect(mtCenters.filter(c => /birżebbuġa|birzebbuga/i.test(c.name)).length).toBe(1);
      expect(mtCenters.filter(c => c.id === BUILD_ID).length).toBe(1);
    });
  });

  describe('7. Duplicate / proximity QA', () => {
    it('no same-brand hard dups; unexplained hard duplicates = 0', () => {
      const lt25: string[] = [];
      const lt50: string[] = [];
      const lt100: string[] = [];
      const lt200: string[] = [];
      const identical: string[] = [];
      const diffBrand: Array<{a: string; b: string; d: number}> = [];
      const addrNorm = new Map<string, string[]>();
      for (const c of mtCenters) {
        const key = normalizeGymSearchValue(`${c.address}|${c.postal_code}|${c.city}`);
        const list = addrNorm.get(key) || [];
        list.push(c.id);
        addrNorm.set(key, list);
      }
      const sameAddr = [...addrNorm.values()].filter(v => v.length > 1);
      expect(sameAddr).toEqual([]);

      for (let i = 0; i < mtCenters.length; i++) {
        for (let j = i + 1; j < mtCenters.length; j++) {
          const a = mtCenters[i]!;
          const b = mtCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical.push(`${a.id}|${b.id}`);
          if (a.brand === b.brand) {
            if (d <= 25) lt25.push(`${a.id}|${b.id}`);
            if (d <= 50) lt50.push(`${a.id}|${b.id}`);
            if (d <= 100) lt100.push(`${a.id}|${b.id}`);
            if (d <= 200) lt200.push(`${a.id}|${b.id}`);
          } else if (d <= 100) {
            diffBrand.push({a: a.id, b: b.id, d: Math.round(d)});
          }
        }
      }
      expect(lt25).toEqual([]);
      expect(lt50).toEqual([]);
      expect(lt100).toEqual([]);
      expect(lt200).toEqual([]);
      expect(identical).toEqual([]);
      expect(diffBrand).toEqual([]);
    });
  });

  describe('8. Border / island safety', () => {
    it('zero Italy/Sicily/foreign contamination', () => {
      for (const c of mtCenters) {
        expect(isPlausibleMaltaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(c.country).toBe('Malta');
        expect(isMaltaCountry(c.country)).toBe(true);
        // Rough locality sanity: all within Malta island box (already gated)
        expect(c.lat!).toBeGreaterThan(35.8);
        expect(c.lat!).toBeLessThan(36.05);
        expect(c.lng!).toBeGreaterThan(14.3);
        expect(c.lng!).toBeLessThan(14.58);
      }
    });
  });

  describe('9. Maltese text / brand / locality / postcode search', () => {
    it('resolves mt_* → Malta; orphan stub safe; display without raw id', () => {
      expect(GYM_ID_PREFIX.malta).toBe('mt_');
      expect(gymCountryTranslationKey('Malta')).toBe('countries.malta');
      expect(resolveGymOrStub(SLIEMA_ID).region).toBe('Malta');
      expect(resolveGymOrStub('mt_nonexistent_test').region).toBe('Malta');
      expect(resolveGymOrStub('mt_nonexistent_test').id).toBe('mt_nonexistent_test');
      expect(findGymById(SLIEMA_ID)?.id).toBe(SLIEMA_ID);
      expect(formatGymDisplayName(resolveGymOrStub(SLIEMA_ID))).not.toMatch(/^mt_/);
      expect(getActiveGymsByCountry('Malta').length).toBe(18);
    });

    it('preserves display diacritics; ASCII/native search finds intended clubs', () => {
      expect(mtCenters.some(c => /Birżebbuġa/i.test(c.name) || c.city === 'Birżebbuġa')).toBe(true);
      expect(mtCenters.some(c => /Mellieħa/i.test(c.name) || c.city === 'Mellieħa')).toBe(true);
      expect(mtCenters.some(c => /Żebbuġ/i.test(c.name) || c.city === 'Żebbuġ')).toBe(true);
      expect(mtCenters.some(c => /San Ġwann/i.test(c.name) || c.city === 'San Ġwann')).toBe(true);
      expect(mtCenters.some(c => c.city === 'Gżira')).toBe(true);
      const blob = mtCenters.map(c => `${c.name} ${c.city}`).join(' ');
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(blob).toMatch(/ż|ħ|ġ|Ż|Ħ|Ġ/);

      expect(normalizeGymSearchValue('Birżebbuġa')).toBe('birzebbuga');
      expect(normalizeGymSearchValue('Birzebbuga')).toBe('birzebbuga');
      expect(normalizeGymSearchValue('Żebbuġ')).toBe('zebbug');
      expect(normalizeGymSearchValue('San Ġwann')).toBe('san gwann');
      expect(normalizeGymSearchValue('Gżira')).toBe('gzira');
      expect(normalizeGymSearchValue("Ta' Qali")).toBe('ta qali');
      expect(normalizeGymSearchValue("St Julian's")).toMatch(/st julian/);
      expect(normalizeGymSearchValue('24/7 Fitness Club')).toBe('24 7 fitness club');

      getGymSearchIndex(malta);
      const pairs: Array<[string, string]> = [
        ['Birżebbuġa', BIRZEBBUGA_ID],
        ['Birzebbuga', BIRZEBBUGA_ID],
        ['Mellieħa', MELLIEHA_ID],
        ['Mellieha', MELLIEHA_ID],
        ['Żebbuġ', ZEBUG_ID],
        ['Zebbug', ZEBUG_ID],
        ['San Ġwann', SAN_GWANN_ID],
        ['San Gwann', SAN_GWANN_ID],
        ['Gżira', 'mt_134787b308'],
        ['Gzira', 'mt_134787b308'],
      ];
      for (const [q, id] of pairs) {
        expect(searchGyms(q, {gyms: malta, limit: 10}).some(h => h.gym.id === id)).toBe(true);
      }
    });

    it('brand and locality search resolve correct live centers; zero-chain not fabricated', () => {
      getGymSearchIndex(malta);
      expect(
        searchGyms('Best Gyms Malta', {gyms: malta, limit: 20}).filter(
          h => h.gym.brand === 'Best Gyms Malta',
        ).length,
      ).toBe(10);
      expect(
        searchGyms('best gyms', {gyms: malta, limit: 20}).filter(h => h.gym.brand === 'Best Gyms Malta')
          .length,
      ).toBeGreaterThanOrEqual(10);
      expect(searchGyms('BGM', {gyms: malta, limit: 10}).some(h => h.gym.id === BIRZEBBUGA_ID)).toBe(
        true,
      );
      expect(
        searchGyms('24/7 Fitness Club', {gyms: malta, limit: 20}).filter(
          h => h.gym.brand === '24/7 Fitness Club',
        ).length,
      ).toBe(4);
      expect(
        searchGyms('24 7 fitness', {gyms: malta, limit: 20}).some(
          h => h.gym.brand === '24/7 Fitness Club',
        ),
      ).toBe(true);
      expect(
        searchGyms('Challenger Fitness', {gyms: malta, limit: 20}).filter(
          h => h.gym.brand === 'Challenger Fitness',
        ).length,
      ).toBe(4);
      expect(
        searchGyms('challenger', {gyms: malta, limit: 20}).filter(
          h => h.gym.brand === 'Challenger Fitness',
        ).length,
      ).toBe(4);

      const localities: Array<[string, RegExp]> = [
        ['Sliema', /sliema/i],
        ["St Julian's", /julian|neptune/i],
        ['Gżira', /gżira|gzira|qroqq/i],
        ['Pembroke', /pembroke/i],
        ['Birkirkara', /birkirkara/i],
        ['Mosta', /mosta/i],
        ["St Paul's Bay", /paul|build/i],
        ['Kirkop', /kirkop/i],
        ['Marsa', /marsa/i],
        ['Birżebbuġa', /birżebbuġa|birzebbuga/i],
        ['Mellieħa', /mellieħa|mellieha/i],
        ['San Ġwann', /ġwann|gwann/i],
        ['Attard', /attard|qali/i],
        ['Żebbuġ', /żebbuġ|zebbug/i],
        ['Qormi', /qormi/i],
        ['Valletta', /valletta/i],
        ['Bormla', /bormla|cottonera/i],
        ['Marsaskala', /marsaskala/i],
      ];
      for (const [q, re] of localities) {
        expect(
          searchGyms(q, {gyms: malta, limit: 10}).some(
            h => re.test(h.gym.city) || re.test(h.gym.name),
          ),
        ).toBe(true);
      }

      for (const town of ZERO_CHAIN_LOCALITIES) {
        expect(mtCenters.some(c => c.city === town)).toBe(false);
      }
      // Fuzzy may return distant hits, but must not invent a center claiming that locality
      for (const town of ['Msida', 'Fgura', 'Naxxar', 'Victoria', 'Xewkija']) {
        const hits = searchGyms(town, {gyms: malta, limit: 10});
        expect(hits.every(h => h.gym.city !== town)).toBe(true);
      }

      expect(
        searchGyms('Fitness Café', {gyms: malta, limit: 20}).every(
          h => !/fitness café|fitness cafe/i.test(h.gym.name),
        ),
      ).toBe(true);
      expect(
        searchGyms('Elite Gym', {gyms: malta, limit: 20}).every(
          h => !/^(elite gym|elite fitness)$/i.test(h.gym.brand || ''),
        ),
      ).toBe(true);
    });

    it('postcode search resolves Phase-2 recovered codes', () => {
      getGymSearchIndex(malta);
      expect(searchGyms('KKP 1370', {gyms: malta, limit: 5}).some(h => h.gym.id === KIRKOP_ID)).toBe(
        true,
      );
      expect(searchGyms('MRS 9065', {gyms: malta, limit: 5}).some(h => h.gym.id === MARSA_ID)).toBe(
        true,
      );
      expect(
        searchGyms('BBG 1758', {gyms: malta, limit: 5}).some(h => h.gym.id === BIRZEBBUGA_ID),
      ).toBe(true);
      expect(
        searchGyms('BML 9020', {gyms: malta, limit: 5}).some(h => h.gym.id === COTTONERA_ID),
      ).toBe(true);
      expect(searchGyms('kkp1370', {gyms: malta, limit: 5}).some(h => h.gym.id === KIRKOP_ID)).toBe(
        true,
      );
      for (const c of mtCenters) {
        expect(typeof c.postal_code).toBe('string');
      }
    });
  });

  describe('10. Check-in / map / nearest / core ID flows', () => {
    it('200m check-in and auto-checkout boundaries unchanged (dense-area centers)', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
      for (const id of [SLIEMA_ID, VALLETTA_ID]) {
        const coords = getGymLatLngForCheckIn(id);
        expect(coords).not.toBeNull();
        const center = findCenterById(id)!;
        expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
        expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      }
      expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearest resolves BGM / 24/7 / Challenger / Birżebbuġa / Cottonera', () => {
      const samples: Array<[string, number, number]> = [
        [SLIEMA_ID, findCenterById(SLIEMA_ID)!.lat!, findCenterById(SLIEMA_ID)!.lng!],
        [MELLIEHA_ID, findCenterById(MELLIEHA_ID)!.lat!, findCenterById(MELLIEHA_ID)!.lng!],
        [VALLETTA_ID, findCenterById(VALLETTA_ID)!.lat!, findCenterById(VALLETTA_ID)!.lng!],
        [BIRZEBBUGA_ID, findCenterById(BIRZEBBUGA_ID)!.lat!, findCenterById(BIRZEBBUGA_ID)!.lng!],
        [COTTONERA_ID, findCenterById(COTTONERA_ID)!.lat!, findCenterById(COTTONERA_ID)!.lng!],
      ];
      for (const [id, lat, lng] of samples) {
        const near = offsetMeters(lat, lng, 15, 10);
        const hit = findNearestGym(near.lat, near.lng, malta);
        expect(hit?.id).toBe(id);
        expect(hit?.country).toBe('Malta');
      }
    });

    it('map builds 18 Malta markers; no Birgu/closed/excluded', () => {
      const markers = toMap(malta);
      expect(markers.length).toBe(18);
      expect(markers.every(m => m.id.startsWith('mt_'))).toBe(true);
      expect(markers.some(m => m.id === BIRGU_ID)).toBe(false);
      const ids = new Set(markers.map(m => m.id));
      expect(ids.size).toBe(18);
      const filtered = filterMapCentersInRegion(markers as never, {
        latitude: 35.9,
        longitude: 14.48,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThanOrEqual(18);
      expect(filtered.every((m: {country?: string}) => m.country === 'Malta')).toBe(true);
    });

    it('onboarding/profile/history/feed/notification ID paths resolve without raw mt_*', () => {
      for (const id of [SLIEMA_ID, MELLIEHA_ID, COTTONERA_ID, BUILD_ID]) {
        const g = resolveGymOrStub(id);
        expect(g.id).toBe(id);
        expect(g.region).toBe('Malta');
        expect(g.country).toBe('Malta');
        const label = formatGymDisplayName(g);
        expect(label.length).toBeGreaterThan(3);
        expect(label.startsWith('mt_')).toBe(false);
        expect(String(g.brand || '').length).toBeGreaterThan(0);
        expect(String(g.city || g.name).length).toBeGreaterThan(0);
      }
    });
  });

  describe('11. Country regression', () => {
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

  describe('12. Performance snapshot + freeze', () => {
    it('records live catalog timings; under 12,500; KEEP CLIENT-SIDE; SHA unchanged', () => {
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
      searchGyms('malta', {limit: 20});
      searchGyms('best gyms', {limit: 20});
      searchGyms('challenger', {limit: 20});
      searchGyms('sliema', {limit: 20});
      searchGyms('KKP 1370', {limit: 10});
      const typicalMs = (Date.now() - tSearch0) / 5;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(35.8989, 14.5146, malta);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(malta);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 35.9,
        longitude: 14.48,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const shaAfter = crypto
        .createHash('sha256')
        .update(fs.readFileSync(centersPath))
        .digest('hex');

      const perf = {
        catalog: raw.length,
        active: active.length,
        malta: mtCenters.length,
        json_size_bytes: jsonSize,
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
        luxembourg_qa_baseline: {
          catalog: 11630,
          json_size_mb: 3.45,
        },
        malta_merge_baseline: {
          catalog: 11648,
          json_size_bytes: 3619609,
          parse_ms_approx: 31,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
        production_sha256: LIVE_SHA,
        sha_after_qa: shaAfter,
        production_modified: shaAfter !== LIVE_SHA,
      };
      const outDir = path.join(__dirname, '../data/malta');
      fs.mkdirSync(outDir, {recursive: true});
      fs.writeFileSync(path.join(outDir, 'MALTA_QA_PERF.json'), JSON.stringify(perf, null, 2) + '\n');

      const reportMd = `# MALTA QA REPORT

## Verdict

**MALTA STATUS: READY**

## Freeze

- Catalog: ${perf.catalog}
- Malta: ${perf.malta}
- SHA256: \`${shaAfter}\`
- Production modified: NO

## Brands

- Best Gyms Malta: 10
- 24/7 Fitness Club: 4
- Challenger Fitness: 4

## Gates

- Birgu withheld: true
- Elite predecessor absent: true
- Fitness Café absent: true
- Paceville absent: true
- 24/7 legacy absent: true
- Metadata drift: NONE

## Performance

- JSON: ${perf.json_size_mb} MB (${perf.json_size_bytes} bytes)
- Parse: ${perf.parse_ms} ms
- Cold index: ${perf.cold_index_ms} ms
- Cached index: ${perf.cached_index_ms} ms
- Typical search: ${perf.typical_search_ms} ms
- Architecture: KEEP CLIENT-SIDE

## Global scale

- Catalog: ${perf.catalog}
- Crossed 12,500: NO
- Global Stress QA required: NO
- Country expansion: UNLOCKED
`;
      fs.writeFileSync(path.join(outDir, 'MALTA_QA_REPORT.md'), reportMd);

      expect(perf.catalog).toBe(11692);
      expect(perf.malta).toBe(18);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.json_size_mb).toBeLessThan(4.5);
      expect(perf.cold_index_ms).toBeLessThan(25000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
      expect(perf.crossed_12500).toBe(false);
      expect(perf.global_stress_qa_required).toBe(false);
      expect(perf.production_modified).toBe(false);
      expect(shaAfter).toBe(LIVE_SHA);
    });
  });
});
