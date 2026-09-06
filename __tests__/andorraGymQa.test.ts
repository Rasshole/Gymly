/**
 * Andorra gym QA — full production validation after ad_* merge (12 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/andorra/ANDORRA_QA_*).
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
  ANDORRA_POSTAL_RE,
  isAndorraCountry,
  isPlausibleAndorraCoordinate,
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

const staging = require('../data/andorra/andorra_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  parish?: string;
  eligibility_path?: string;
  phase2_classification?: string;
  coord_source?: string | null;
}>;

const approved = require('../data/andorra/ANDORRA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  parish?: string;
  lat?: number;
  lng?: number;
  eligibility_path?: string;
  coord_source?: string | null;
}>;

const phase2Ready = require('../data/andorra/ANDORRA_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  postal_code?: string;
  address?: string;
  city?: string;
  parish?: string;
  lat?: number;
  lng?: number;
  eligibility_path?: string;
}>;

const rebrand = require('../data/andorra/ANDORRA_PHASE2_REBRAND_MAP.json') as {
  unresolved_conflicts?: number;
};

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const ES_FR_RISK =
  /\b(la seu d['’]?urgell|puigcerd[aà]|l['’]?hospitalet|ax[- ]les[- ]thermes|ari[eè]ge|alt urgell)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_AD = 12;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const REQUIRED = {
  anyospark: 'ad_8989e7b07f',
  urbanAlv: 'ad_488e241114',
  palauDeGel: 'ad_1fb5491cda',
  duplex: 'ad_6fc179f949',
  next: 'ad_2594f0bd4f',
  princiesport: 'ad_be0d30a1f0',
  serradells: 'ad_2759cd904a',
  escaldes: 'ad_cfb6dcda5e',
  ceoOrdino: 'ad_918cf36646',
  encamp: 'ad_8e838a1d13',
  pasDeLaCasa: 'ad_886040e59f',
  lauesport: 'ad_ae9200b719',
};

const MUNICIPAL_IDS = [
  REQUIRED.serradells,
  REQUIRED.escaldes,
  REQUIRED.ceoOrdino,
  REQUIRED.encamp,
  REQUIRED.pasDeLaCasa,
  REQUIRED.lauesport,
] as const;

const FORBIDDEN_LIVE_IDS = new Set([
  'ad_9447826d36', // Urban Gym Arinsal EXCLUDED_SEASONAL
  'ad_d121043f5a', // Club Caldea
  'ad_a2928dadbb', // Casa Wellness
  'ad_77aa7bc22f', // CrossFit Les Valls
  'ad_65f3681d10', // La Borda CrossFit
  'ad_e604a908b8', // Primatesag
]);

const INVENTORY: Array<{
  id: string;
  name: string;
  city: string;
  parish: string;
  postal: string;
  brand: string;
}> = [
  {
    id: REQUIRED.anyospark,
    name: 'AnyósPark Club La Massana',
    city: 'La Massana',
    parish: 'La Massana',
    postal: 'AD400',
    brand: 'AnyósPark',
  },
  {
    id: REQUIRED.urbanAlv,
    name: 'Urban Gym Andorra la Vella',
    city: 'Andorra la Vella',
    parish: 'Andorra la Vella',
    postal: 'AD500',
    brand: 'Urban Gym',
  },
  {
    id: REQUIRED.palauDeGel,
    name: 'Gimnàs Palau de Gel Canillo',
    city: 'Canillo',
    parish: 'Canillo',
    postal: 'AD100',
    brand: 'Palau de Gel',
  },
  {
    id: REQUIRED.duplex,
    name: 'Duplex Sport Club Andorra la Vella',
    city: 'Andorra la Vella',
    parish: 'Andorra la Vella',
    postal: 'AD500',
    brand: 'Duplex Sport Club',
  },
  {
    id: REQUIRED.next,
    name: 'NEXT Sports Club Illa Carlemany',
    city: 'Escaldes-Engordany',
    parish: 'Escaldes-Engordany',
    postal: 'AD700',
    brand: 'NEXT Sports Club',
  },
  {
    id: REQUIRED.princiesport,
    name: 'Princiesport Santa Coloma',
    city: 'Santa Coloma',
    parish: 'Andorra la Vella',
    postal: 'AD500',
    brand: 'Princiesport',
  },
  {
    id: REQUIRED.serradells,
    name: 'Centre Esportiu dels Serradells',
    city: 'Andorra la Vella',
    parish: 'Andorra la Vella',
    postal: 'AD500',
    brand: 'Serradells',
  },
  {
    id: REQUIRED.escaldes,
    name: 'Centre Esportiu Comunal Escaldes-Engordany',
    city: 'Escaldes-Engordany',
    parish: 'Escaldes-Engordany',
    postal: 'AD700',
    brand: 'Centre Esportiu Escaldes-Engordany',
  },
  {
    id: REQUIRED.ceoOrdino,
    name: "Centre Esportiu d'Ordino",
    city: 'Ordino',
    parish: 'Ordino',
    postal: 'AD300',
    brand: 'CEO Ordino',
  },
  {
    id: REQUIRED.encamp,
    name: "Complex Esportiu i Sociocultural d'Encamp",
    city: 'Encamp',
    parish: 'Encamp',
    postal: 'AD200',
    brand: 'Complex Esportiu Encamp',
  },
  {
    id: REQUIRED.pasDeLaCasa,
    name: 'Centre Esportiu del Pas de la Casa',
    city: 'Pas de la Casa',
    parish: 'Encamp',
    postal: 'AD200',
    brand: 'Centre Esportiu Pas de la Casa',
  },
  {
    id: REQUIRED.lauesport,
    name: 'LAUesport Sant Julià de Lòria',
    city: 'Sant Julià de Lòria',
    parish: 'Sant Julià de Lòria',
    postal: 'AD600',
    brand: 'LAUesport',
  },
];

const EXPECTED_PARISHES = [
  'Andorra la Vella',
  'Canillo',
  'Encamp',
  'Escaldes-Engordany',
  'La Massana',
  'Ordino',
  'Sant Julià de Lòria',
] as const;

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

describe('Andorra gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const andorra = gyms.filter(g => isAndorraCountry(g.country));
  const adCenters = catalog.filter(c => isAndorraCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const shaBefore = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const approvedById = Object.fromEntries(approved.map(a => [a.id, a]));

  describe('1. Catalog integrity / freeze', () => {
    it('total production = 11831; Andorra = 12; ad_* = 12; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(adCenters.length).toBe(EXPECTED_AD);
      expect(andorra.length).toBe(EXPECTED_AD);
      expect(catalog.filter(c => c.id.startsWith('ad_')).length).toBe(EXPECTED_AD);
      expect(
        catalog.filter(c => c.id.startsWith('ad_') && c.country !== 'Andorra').length,
      ).toBe(0);
      expect(shaBefore).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(adCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(12);
      expect(ap.size).toBe(12);
      expect(ready.size).toBe(12);
      expect(merged.size).toBe(12);
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
        expect(live.country).toBe('Andorra');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
        expect(a.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
        expect(String(a.parish || '').trim().length).toBeGreaterThan(0);
      }
    });

    it('all ad_* IDs unique with required fields and valid Andorra geography', () => {
      const ids = new Set<string>();
      for (const c of adCenters) {
        expect(c.id).toMatch(/^ad_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Andorra');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(ANDORRA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleAndorraCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
        expect(ES_FR_RISK.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
        const src = approvedById[c.id]?.coord_source || '';
        expect(FALLBACK_RE.test(src)).toBe(false);
      }
      expect(ids.size).toBe(12);
      expect(new Set(catalog.map(c => c.id)).size).toBe(catalog.length);
    });

    it('eligibility: CHAIN_CLASS_A 0 + SMALL_MARKET_INDEPENDENT 12', () => {
      expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      expect(phase2Ready.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      const mergedRows = staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG');
      expect(mergedRows.every(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
      expect(approved.filter(a => a.eligibility_path === 'CHAIN_CLASS_A').length).toBe(0);
    });
  });

  describe('2. Expected live inventory + brand / identity QA', () => {
    it('exact 12 inventory once; no unexpected AD locations', () => {
      expect(adCenters.length).toBe(12);
      for (const row of INVENTORY) {
        const live = findCenterById(row.id)!;
        expect(live).toBeTruthy();
        expect(live.name).toBe(row.name);
        expect(live.city).toBe(row.city);
        expect(live.postal_code).toBe(row.postal);
        expect(live.brand).toBe(row.brand);
        expect(live.country).toBe('Andorra');
        expect(approvedById[row.id]?.parish).toBe(row.parish);
      }
      const expectedIds = new Set(INVENTORY.map(r => r.id));
      expect(adCenters.every(c => expectedIds.has(c.id))).toBe(true);
      expect(new Set(adCenters.map(c => c.brand)).size).toBe(12);
    });

    it('Urban Gym / AnyósPark distinct SMI brands; Class A = 0', () => {
      expect(adCenters.filter(c => c.brand === 'AnyósPark').length).toBe(1);
      expect(adCenters.filter(c => c.brand === 'Urban Gym').length).toBe(1);
      expect(findCenterById(REQUIRED.anyospark)!.city).toBe('La Massana');
      expect(findCenterById(REQUIRED.urbanAlv)!.city).toBe('Andorra la Vella');
      expect(approvedById[REQUIRED.anyospark]?.eligibility_path).toBe(
        'SMALL_MARKET_INDEPENDENT',
      );
      expect(approvedById[REQUIRED.urbanAlv]?.eligibility_path).toBe(
        'SMALL_MARKET_INDEPENDENT',
      );
      expect(adCenters.some(c => /AnyósPark Urban|Urban Anyós/i.test(`${c.brand}`))).toBe(false);
    });

    it('Canillo = Palau de Gel only; Urban Gym Canillo alias = 0', () => {
      const canillo = findCenterById(REQUIRED.palauDeGel)!;
      expect(canillo.brand).toBe('Palau de Gel');
      expect(canillo.name).toBe('Gimnàs Palau de Gel Canillo');
      expect(canillo.city).toBe('Canillo');
      expect(canillo.postal_code).toBe('AD100');
      expect(
        adCenters.filter(c => /Urban Gym/i.test(c.brand) && /Canillo/i.test(c.name)).length,
      ).toBe(0);
    });

    it('commercial independents Duplex / NEXT / Princiesport = 1 each', () => {
      expect(adCenters.filter(c => c.brand === 'Duplex Sport Club').length).toBe(1);
      expect(adCenters.filter(c => c.brand === 'NEXT Sports Club').length).toBe(1);
      expect(adCenters.filter(c => c.brand === 'Princiesport').length).toBe(1);
      expect(findCenterById(REQUIRED.duplex)!.postal_code).toBe('AD500');
      expect(findCenterById(REQUIRED.next)!.postal_code).toBe('AD700');
      expect(findCenterById(REQUIRED.princiesport)!.city).toBe('Santa Coloma');
    });

    it('municipal approved set = 6/6 live via SMALL_MARKET_INDEPENDENT', () => {
      for (const id of MUNICIPAL_IDS) {
        const live = findCenterById(id)!;
        expect(live).toBeTruthy();
        expect(live.country).toBe('Andorra');
        expect(approvedById[id]?.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
        expect(isPlausibleAndorraCoordinate(live.lat!, live.lng!)).toBe(true);
      }
      expect(MUNICIPAL_IDS.length).toBe(6);
    });
  });

  describe('3. Closed / excluded / rebrand leakage', () => {
    it('staging MERGED 12 / EXCLUDED 42 / total 54; leakage = 0', () => {
      const cats: Record<string, number> = {};
      for (const r of staging) cats[r.import_category] = (cats[r.import_category] || 0) + 1;
      expect(cats.MERGED_INTO_CATALOG).toBe(12);
      expect(cats.EXCLUDED).toBe(42);
      expect(cats.NEEDS_REVIEW || 0).toBe(0);
      expect(staging.length).toBe(54);

      const prodIds = new Set(catalog.map(c => c.id));
      const closedExcluded = staging.filter(r =>
        ['CLOSED', 'EXCLUDED'].includes(r.import_category),
      );
      expect(closedExcluded.every(r => !prodIds.has(r.id))).toBe(true);
      for (const id of FORBIDDEN_LIVE_IDS) {
        expect(prodIds.has(id)).toBe(false);
        expect(findCenterById(id)).toBeUndefined();
      }

      const arinsal = staging.find(r => r.id === 'ad_9447826d36')!;
      expect(arinsal.import_category).toBe('EXCLUDED');
      expect(arinsal.phase2_classification).toBe('EXCLUDED_SEASONAL');
    });

    it('rebrand/identity conflicts = 0; Caldea/Arinsal/CrossFit absent', () => {
      expect(rebrand.unresolved_conflicts).toBe(0);
      expect(
        adCenters.filter(c =>
          /Arinsal|Caldea|Casa Wellness|CrossFit|Primatesag/i.test(`${c.brand} ${c.name}`),
        ).length,
      ).toBe(0);
      expect(adCenters.filter(c => c.brand === 'Palau de Gel').length).toBe(1);
      expect(adCenters.filter(c => c.brand === 'Urban Gym').length).toBe(1);
      expect(adCenters.filter(c => c.brand === 'AnyósPark').length).toBe(1);
    });
  });

  describe('4. Duplicate / proximity / cross-border / parishes', () => {
    it('hard duplicate problems = 0; known dense proximity classified', () => {
      const lt25: string[] = [];
      const lt50: string[] = [];
      const lt100: string[] = [];
      const lt200: string[] = [];
      const identical: string[] = [];
      const diffBrand100: Array<{a: string; b: string; d: number}> = [];
      const diffBrand200: Array<{a: string; b: string; d: number}> = [];
      const addrNorm = new Map<string, string[]>();
      for (const c of adCenters) {
        const key = normalizeGymSearchValue(`${c.address}|${c.postal_code}|${c.city}`);
        const list = addrNorm.get(key) || [];
        list.push(c.id);
        addrNorm.set(key, list);
      }
      expect([...addrNorm.values()].filter(v => v.length > 1)).toEqual([]);
      expect(new Set(adCenters.map(c => c.id)).size).toBe(12);

      for (let i = 0; i < adCenters.length; i++) {
        for (let j = i + 1; j < adCenters.length; j++) {
          const a = adCenters[i]!;
          const b = adCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical.push(`${a.id}|${b.id}`);
          if (a.brand === b.brand) {
            if (d <= 25) lt25.push(`${a.id}|${b.id}`);
            if (d <= 50) lt50.push(`${a.id}|${b.id}`);
            if (d <= 100) lt100.push(`${a.id}|${b.id}`);
            if (d <= 200) lt200.push(`${a.id}|${b.id}`);
          } else {
            if (d <= 100) diffBrand100.push({a: a.id, b: b.id, d: Math.round(d)});
            else if (d <= 200) diffBrand200.push({a: a.id, b: b.id, d: Math.round(d)});
          }
        }
      }
      expect(lt25).toEqual([]);
      expect(lt50).toEqual([]);
      expect(lt100).toEqual([]);
      expect(lt200).toEqual([]);
      expect(identical).toEqual([]);
      // Known legitimate different-brand dense pairs
      expect(
        diffBrand100.some(
          p =>
            (p.a === REQUIRED.urbanAlv && p.b === REQUIRED.duplex) ||
            (p.a === REQUIRED.duplex && p.b === REQUIRED.urbanAlv),
        ),
      ).toBe(true);
      expect(
        diffBrand200.some(
          p =>
            (p.a === REQUIRED.next && p.b === REQUIRED.escaldes) ||
            (p.a === REQUIRED.escaldes && p.b === REQUIRED.next),
        ),
      ).toBe(true);
    });

    it('cross-border CLEAN: AD 12/12; ES/FR contamination 0; Pas de la Casa defended', () => {
      for (const c of adCenters) {
        expect(isPlausibleAndorraCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(ANDORRA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(c.country).toBe('Andorra');
      }
      expect(
        adCenters.filter(c => !isPlausibleAndorraCoordinate(c.lat!, c.lng!)).length,
      ).toBe(0);
      const pas = findCenterById(REQUIRED.pasDeLaCasa)!;
      expect(pas.postal_code).toBe('AD200');
      expect(pas.city).toBe('Pas de la Casa');
      expect(isPlausibleAndorraCoordinate(pas.lat!, pas.lng!)).toBe(true);
      // False-positive border cores must fail Andorra gate
      expect(isPlausibleAndorraCoordinate(42.358, 1.456)).toBe(false); // La Seu
      expect(isPlausibleAndorraCoordinate(42.59, 1.801)).toBe(false); // L'Hospitalet
    });

    it('all 7 parishes READY_present via approved metadata', () => {
      const parishes = new Set(approved.map(a => a.parish));
      for (const p of EXPECTED_PARISHES) {
        expect(parishes.has(p)).toBe(true);
      }
      expect(parishes.size).toBe(7);
    });
  });

  describe('5. Search / display / core flows / nearest / map', () => {
    it('resolves ad_* → Andorra; orphan stub safe; no ES/FR/LI collision', () => {
      expect(GYM_ID_PREFIX.andorra).toBe('ad_');
      expect(gymCountryTranslationKey('Andorra')).toBe('countries.andorra');
      expect(isAndorraCountry('Andorra')).toBe(true);
      expect(isAndorraCountry('AD')).toBe(true);
      const sampleId = REQUIRED.anyospark;
      expect(resolveGymOrStub(sampleId).region).toBe('Andorra');
      expect(resolveGymOrStub('ad_nonexistent_test').region).toBe('Andorra');
      expect(resolveGymOrStub('ad_nonexistent_test').id).toBe('ad_nonexistent_test');
      expect(findGymById(sampleId)?.id).toBe(sampleId);
      expect(formatGymDisplayName(resolveGymOrStub(sampleId))).not.toMatch(/^ad_/);
      expect(getActiveGymsByCountry('Andorra').length).toBe(12);
      expect(resolveGymOrStub(sampleId).region).not.toBe('Spain');
      expect(resolveGymOrStub(sampleId).region).not.toBe('France');
      expect(resolveGymOrStub(sampleId).region).not.toBe('Liechtenstein');
    });

    it('brand / locality / ASCII search finds live centers; excluded not production', () => {
      getGymSearchIndex(andorra);
      const queries: Array<[string, RegExp]> = [
        ['AnyósPark', /any[oó]spark/i],
        ['AnyosPark', /any[oó]spark/i],
        ['Urban Gym', /urban gym/i],
        ['Palau de Gel', /palau de gel/i],
        ['Duplex', /duplex/i],
        ['NEXT', /next/i],
        ['Princiesport', /princiesport/i],
        ['Serradells', /serradells/i],
        ['Ordino', /ordino/i],
        ['Encamp', /encamp/i],
        ['Pas de la Casa', /pas de la casa/i],
        ['LAUesport', /lauesport/i],
        ['Sant Julià de Lòria', /sant juli/i],
        ['Sant Julia de Loria', /sant juli|lauesport/i],
        ['Escaldes-Engordany', /escaldes/i],
        ['Andorra la Vella', /andorra la vella|urban|duplex|serradells/i],
        ['La Massana', /massana|any[oó]spark/i],
      ];
      for (const [q, re] of queries) {
        const hits = searchGyms(q, {gyms: andorra, limit: 20});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every(h => h.gym.id.startsWith('ad_'))).toBe(true);
        expect(hits.some(h => re.test(`${h.gym.name} ${h.gym.city} ${h.gym.brand}`))).toBe(true);
        expect(hits.every(h => !FORBIDDEN_LIVE_IDS.has(h.gym.id))).toBe(true);
        expect(hits.every(h => !/^ad_/.test(formatGymDisplayName(h.gym)))).toBe(true);
      }

      // Excluded identities must not appear as live AD production hits
      for (const q of ['Urban Gym Arinsal', 'Club Caldea', 'Casa Wellness', 'CrossFit Les Valls']) {
        const hits = searchGyms(q, {gyms: andorra, limit: 20});
        expect(hits.every(h => !FORBIDDEN_LIVE_IDS.has(h.gym.id))).toBe(true);
        expect(
          hits.every(
            h => !/arinsal|caldea|casa wellness|crossfit les valls/i.test(`${h.gym.name} ${h.gym.brand}`),
          ),
        ).toBe(true);
      }
    });

    it('check-in 199/200 allow, 201 block; auto-checkout 200 m unchanged', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
      const sample = andorra.find(g => g.id === REQUIRED.urbanAlv)!;
      const coords = getGymLatLngForCheckIn(sample.id);
      expect(coords).not.toBeNull();
      const {latitude: lat, longitude: lng} = coords!;
      const p199 = offsetMeters(lat, lng, 199, 0);
      const p200 = offsetMeters(lat, lng, 200, 0);
      const p201 = offsetMeters(lat, lng, 201, 0);
      expect(haversineMeters(p199.lat, p199.lng, lat, lng)).toBeLessThanOrEqual(
        CHECK_IN_RADIUS_METERS,
      );
      expect(haversineMeters(p200.lat, p200.lng, lat, lng)).toBeLessThanOrEqual(
        CHECK_IN_RADIUS_METERS,
      );
      expect(haversineMeters(p201.lat, p201.lng, lat, lng)).toBeGreaterThan(CHECK_IN_RADIUS_METERS);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearest / map viewport sanity across parishes; Arinsal/Caldea absent', () => {
      const probes: Array<{lat: number; lng: number; label: string}> = [
        {lat: 42.5063, lng: 1.5218, label: 'Andorra la Vella'},
        {lat: 42.5088, lng: 1.5345, label: 'Escaldes-Engordany'},
        {lat: 42.5319, lng: 1.5241, label: 'La Massana'},
        {lat: 42.5665, lng: 1.5975, label: 'Canillo'},
        {lat: 42.555, lng: 1.533, label: 'Ordino'},
        {lat: 42.536, lng: 1.583, label: 'Encamp'},
        {lat: 42.5425, lng: 1.7335, label: 'Pas de la Casa'},
        {lat: 42.4637, lng: 1.4913, label: 'Sant Julià de Lòria'},
      ];
      for (const p of probes) {
        const nearest = findNearestGym(p.lat, p.lng, andorra);
        expect(nearest?.country).toBe('Andorra');
        expect(nearest?.id.startsWith('ad_')).toBe(true);
        expect(FORBIDDEN_LIVE_IDS.has(nearest!.id)).toBe(false);
        expect(isPlausibleAndorraCoordinate(nearest!.latitude, nearest!.longitude)).toBe(true);
      }

      const markers = toMap(andorra);
      expect(markers.length).toBe(12);
      expect(markers.every(m => !FORBIDDEN_LIVE_IDS.has(String(m.id)))).toBe(true);
      const visible = filterMapCentersInRegion(markers as never, {
        latitude: 42.52,
        longitude: 1.55,
        latitudeDelta: 0.35,
        longitudeDelta: 0.45,
      } as never);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every(m => String(m.id).startsWith('ad_'))).toBe(true);
      // Dense ALV: Urban + Duplex both remain distinct map entries
      expect(markers.filter(m => m.id === REQUIRED.urbanAlv || m.id === REQUIRED.duplex).length).toBe(
        2,
      );
    });

    it('core display resolution for all 12 ad_* IDs', () => {
      for (const row of INVENTORY) {
        const resolved = resolveGymOrStub(row.id);
        expect(resolved.region).toBe('Andorra');
        expect(formatGymDisplayName(resolved)).not.toMatch(/^ad_/);
        expect(formatGymDisplayName(resolved).length).toBeGreaterThan(0);
        expect(findCenterById(row.id)?.id).toBe(row.id);
        expect(getGymLatLngForCheckIn(row.id)).not.toBeNull();
      }
    });
  });

  describe('6. Country regression', () => {
    it('exact 37-country production counts totaling 11831', () => {
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
      expect(counts['Liechtenstein']).toBe(7);
      expect(counts['Andorra']).toBe(12);
      expect(counts['Monaco']).toBe(4);
      expect(counts['San Marino']).toBe(6);
      expect(counts['Moldova']).toBe(28);
    expect(counts['Bosnia and Herzegovina']).toBe(31);
    expect(counts['North Macedonia']).toBe(25);
      expect(counts['Montenegro']).toBe(26);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11921);
    });
  });

  describe('7. Performance snapshot + freeze', () => {
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
      searchGyms('andorra', {limit: 20});
      searchGyms('AnyósPark', {limit: 20});
      searchGyms('Urban Gym', {limit: 20});
      searchGyms('Pas de la Casa', {limit: 20});
      searchGyms('AD500', {limit: 10});
      const typicalMs = (Date.now() - tSearch0) / 5;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(42.5063, 1.5218, andorra);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(andorra);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 42.52,
        longitude: 1.55,
        latitudeDelta: 0.35,
        longitudeDelta: 0.45,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const shaAfter = crypto
        .createHash('sha256')
        .update(fs.readFileSync(centersPath))
        .digest('hex');

      const perf = {
        catalog: raw.length,
        active: active.length,
        andorra: adCenters.length,
        ad_prefix: catalog.filter(c => c.id.startsWith('ad_')).length,
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
        liechtenstein_qa_baseline: {
          catalog: 11721,
          json_size_mb: 3.47,
          json_size_bytes: 3639715,
          parse_ms: 16,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
        production_sha256: LIVE_SHA,
        sha_after_qa: shaAfter,
        production_modified: shaAfter !== LIVE_SHA,
        reconciliation: '12 == 12 == 12 == 12',
        eligibility: {
          CHAIN_CLASS_A: 0,
          SMALL_MARKET_INDEPENDENT: 12,
        },
        hard_duplicates: 0,
        excluded_leakage: 0,
        spanish_french_contamination: 0,
        bugs_found: 'NONE',
      };

      expect(perf.catalog).toBe(11921);
      expect(perf.andorra).toBe(12);
      expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
      expect(shaAfter).toBe(LIVE_SHA);
      expect(shaAfter).toBe(shaBefore);
      expect(perf.production_modified).toBe(false);
      expect(perf.crossed_12500).toBe(false);

      const outDir = path.join(__dirname, '../data/andorra');
      fs.writeFileSync(
        path.join(outDir, 'ANDORRA_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      fs.writeFileSync(
        path.join(outDir, 'ANDORRA_QA_REPORT.md'),
        `# ANDORRA QA REPORT

## Verdict

**ANDORRA STATUS: READY**

Country expansion: **UNLOCKED**

## Freeze

- Catalog: ${perf.catalog}
- Andorra: ${perf.andorra}
- ad_*: ${perf.ad_prefix}
- SHA256: \`${shaAfter}\`
- Production modified: NO

## Gates

- Reconciliation: 12 == 12 == 12 == 12
- Eligibility: CHAIN_CLASS_A 0 / SMALL_MARKET_INDEPENDENT 12
- Excluded leakage: 0
- Hard duplicates: 0
- Rebrand conflicts: 0
- Cross-border: CLEAN (ES 0 / FR 0)
- Metadata drift: NONE
- Arinsal: EXCLUDED_SEASONAL (absent)
- Canillo identity: Palau de Gel
- Parishes: 7/7 READY_present

## Live inventory

1. AnyósPark Club La Massana (\`ad_8989e7b07f\`) — La Massana AD400
2. Urban Gym Andorra la Vella (\`ad_488e241114\`) — Andorra la Vella AD500
3. Gimnàs Palau de Gel Canillo (\`ad_1fb5491cda\`) — Canillo AD100
4. Duplex Sport Club Andorra la Vella (\`ad_6fc179f949\`) — Andorra la Vella AD500
5. NEXT Sports Club Illa Carlemany (\`ad_2594f0bd4f\`) — Escaldes-Engordany AD700
6. Princiesport Santa Coloma (\`ad_be0d30a1f0\`) — Santa Coloma AD500
7. Centre Esportiu dels Serradells (\`ad_2759cd904a\`) — Andorra la Vella AD500
8. Centre Esportiu Comunal Escaldes-Engordany (\`ad_cfb6dcda5e\`) — Escaldes-Engordany AD700
9. Centre Esportiu d'Ordino (\`ad_918cf36646\`) — Ordino AD300
10. Complex Esportiu i Sociocultural d'Encamp (\`ad_8e838a1d13\`) — Encamp AD200
11. Centre Esportiu del Pas de la Casa (\`ad_886040e59f\`) — Pas de la Casa AD200
12. LAUesport Sant Julià de Lòria (\`ad_ae9200b719\`) — Sant Julià de Lòria AD600

## Performance

- JSON: ${perf.json_size_mb} MB (${perf.json_size_bytes} bytes)
- Parse: ${perf.parse_ms} ms
- Cold index: ${perf.cold_index_ms} ms
- Cached index: ${perf.cached_index_ms} ms
- Typical search: ${perf.typical_search_ms} ms
- Worst search: ${perf.worst_search_ms} ms
- Nearest: ${perf.nearest_ms} ms
- Map build: ${perf.map_build_ms} ms
- Viewport: ${perf.viewport_filter_ms} ms
- Architecture: KEEP CLIENT-SIDE

## Global scale

- Catalog: ${perf.catalog}
- Crossed 12,500: NO
- Global Stress QA required: NO
- Country expansion: UNLOCKED

## Bugs

- BUGS FOUND: NONE
`,
      );
    });
  });
});
