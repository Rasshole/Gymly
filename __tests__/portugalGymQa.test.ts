/**
 * Portugal gym QA — full production validation after pt_* merge (247 centers).
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
  isPlausiblePortugalCoordinate,
  isPortugalCountry,
  PORTUGAL_POSTAL_RE,
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

const staging = require('../data/portugal/portugal_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
}>;

const approved = require('../data/portugal/PORTUGAL_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  lat?: number;
  lng?: number;
}>;
const phase2Ready = require('../data/portugal/PORTUGAL_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
}>;

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center/i;
const LEGACY_RE = /\b(fitness\s*hut|pump\s*fitness|virgin\s*active|kalorias)\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  'Fitness UP': 51,
  VivaGym: 46,
  Element: 46,
  'Fitness Factory': 44,
  Solinca: 19,
  'Solinca Light': 16,
  'Holmes Place': 12,
  'Be-Fit': 10,
  Balance: 2,
  Lemonfit: 1,
};

const CARCAVELOS_ID = 'pt_c7293231c5';
const PAREDE_ID = 'pt_33927a6b65';
const PORTELA_LOURES_ID = 'pt_030a7b76ff';
const SOLINCA_COLOMBO_ID = 'pt_e9644e220f';
const VIVAGYM_PICOAS_ID = 'pt_88f14f9770';
const FITNESSUP_PICOAS_ID = 'pt_c81da3a8bf';

const PORTELA_LOURES_OFFICIAL = {lat: 38.7834895, lng: -9.110755};

const MADEIRA_IDS = [
  'pt_d1573ba977', // Be-Fit CentroMar
  'pt_532415ebbc', // Be-Fit Plaza Madeira
  'pt_8e9361add0', // FF Funchal
  'pt_0ed3aa6000', // FF Caniço
  'pt_2c594cd30b', // FF Santo António
];
const AZORES_IDS = [
  'pt_34bec26868', // Element Angra
  'pt_7d40ef811b', // FF Arrifes
];

const FF_WITHHELD = [
  {id: 'pt_36956a7053', city: 'Alenquer'},
  {id: 'pt_573fbbba9e', city: 'Palmela'},
  {id: 'pt_41e469ddda', city: 'São João da Madeira'},
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

function normalizeBrand(b: string): string {
  return String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAddr(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function islandOf(lat: number, lng: number): 'Madeira' | 'Azores' | 'mainland' | null {
  if (lat >= 32.35 && lat <= 33.2 && lng >= -17.35 && lng <= -16.2) return 'Madeira';
  if (lat >= 36.85 && lat <= 39.8 && lng >= -31.35 && lng <= -24.9) return 'Azores';
  if (lat >= 36.9 && lat <= 42.2 && lng >= -9.6 && lng <= -6.15) return 'mainland';
  return null;
}

describe('Portugal gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const portugal = gyms.filter(g => isPortugalCountry(g.country));
  const ptCenters = catalog.filter(c => isPortugalCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 10772; Portugal = 247', () => {
      expect(catalog.length).toBe(11254);
      expect(ptCenters.length).toBe(247);
      expect(portugal.length).toBe(247);
      expect(catalog.filter(c => c.id.startsWith('pt_')).length).toBe(247);
    });

    it('all pt_* IDs unique with required fields and valid PT geography', () => {
      const ids = new Set<string>();
      for (const c of ptCenters) {
        expect(c.id.startsWith('pt_')).toBe(true);
        expect(c.id).toMatch(/^pt_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Portugal');
        expect(c.is_active).toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(PORTUGAL_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lng!).toBeLessThan(0);
        expect(isPlausiblePortugalCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(islandOf(c.lat!, c.lng!)).not.toBeNull();
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(LEGACY_RE.test(c.brand || '')).toBe(false);
        expect(LEGACY_RE.test(c.name || '')).toBe(false);
      }
    });
  });

  describe('2. Brand breakdown', () => {
    it('matches canonical READY contract', () => {
      const byBrand: Record<string, number> = {};
      for (const c of ptCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      }
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(247);
    });
  });

  describe('3. Merge reconciliation', () => {
    it('approved, phase2 ready, staging MERGED, and production IDs match', () => {
      const approvedIds = new Set(approved.map(r => r.id));
      const readyIds = new Set(phase2Ready.map(r => r.id));
      const mergedIds = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      const prodIds = new Set(ptCenters.map(c => c.id));
      expect(approvedIds.size).toBe(247);
      expect(readyIds.size).toBe(247);
      expect(mergedIds.size).toBe(247);
      expect(prodIds.size).toBe(247);
      for (const id of approvedIds) {
        expect(readyIds.has(id)).toBe(true);
        expect(mergedIds.has(id)).toBe(true);
        expect(prodIds.has(id)).toBe(true);
      }
      for (const id of prodIds) {
        expect(mergedIds.has(id)).toBe(true);
      }
    });
  });

  describe('4. Staging exclusions', () => {
    it('unresolved staging categories are absent from production', () => {
      const excluded = staging.filter(s =>
        ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(
          s.import_category,
        ),
      );
      expect(excluded.filter(s => s.import_category === 'NEEDS_COORDINATES').length).toBe(36);
      expect(excluded.filter(s => s.import_category === 'NEEDS_REVIEW').length).toBe(26);
      expect(excluded.filter(s => s.import_category === 'COMING_SOON').length).toBe(0);
      expect(excluded.filter(s => s.import_category === 'CLOSED').length).toBe(2);
      expect(excluded.filter(s => s.import_category === 'DUPLICATE').length).toBe(5);
      for (const s of excluded) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
    });

    it('known Fitness Factory problem rows remain withheld (incl. flipped +lng)', () => {
      for (const row of FF_WITHHELD) {
        expect(findCenterById(row.id)).toBeUndefined();
        const staged = staging.find(s => s.id === row.id)!;
        expect(staged.import_category).toBe('NEEDS_REVIEW');
        expect(String(staged.city || '')).toContain(row.city.split(' ')[0]!);
      }
      const palmela = staging.find(s => s.id === 'pt_573fbbba9e')!;
      const sjm = staging.find(s => s.id === 'pt_41e469ddda')!;
      expect(palmela.lng!).toBeGreaterThan(0);
      expect(sjm.lng!).toBeGreaterThan(0);
    });
  });

  describe('5. QA repair — Portela Loures coordinates', () => {
    it('Fitness UP Portela Loures is at Complexo de Piscinas da Portela, not Colombo', () => {
      const portela = findCenterById(PORTELA_LOURES_ID)!;
      const colombo = findCenterById(SOLINCA_COLOMBO_ID)!;
      expect(portela.brand).toBe('Fitness UP');
      expect(portela.postal_code).toBe('2685-232');
      expect(portela.lat).toBeCloseTo(PORTELA_LOURES_OFFICIAL.lat, 5);
      expect(portela.lng).toBeCloseTo(PORTELA_LOURES_OFFICIAL.lng, 5);
      const d = haversineMeters(portela.lat!, portela.lng!, colombo.lat!, colombo.lng!);
      expect(d).toBeGreaterThan(5000);
      const approvedRow = approved.find(r => r.id === PORTELA_LOURES_ID)!;
      expect(approvedRow.lat).toBeCloseTo(PORTELA_LOURES_OFFICIAL.lat, 5);
      expect(approvedRow.lng).toBeCloseTo(PORTELA_LOURES_OFFICIAL.lng, 5);
    });
  });

  describe('6. Duplicate / proximity', () => {
    it('no duplicate IDs or same-brand same-address pairs', () => {
      const keys = new Set<string>();
      for (const c of ptCenters) {
        const k = [
          normalizeAddr(c.address || ''),
          c.postal_code,
          normalizeAddr(c.city || ''),
          normalizeBrand(c.brand || ''),
        ].join('|');
        expect(keys.has(k)).toBe(false);
        keys.add(k);
      }
    });

    it('Carcavelos and Parede are legitimate separate Fitness UP clubs (~103 m)', () => {
      const a = findCenterById(CARCAVELOS_ID)!;
      const b = findCenterById(PAREDE_ID)!;
      expect(a.brand).toBe('Fitness UP');
      expect(b.brand).toBe('Fitness UP');
      expect(a.postal_code).toBe('2775-717');
      expect(b.postal_code).toBe('2775-232');
      expect(normalizeAddr(a.address)).not.toBe(normalizeAddr(b.address));
      const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
      expect(d).toBeGreaterThan(90);
      expect(d).toBeLessThan(150);
    });

    it('Picoas VivaGym and Fitness UP remain distinct different-brand clubs', () => {
      const a = findCenterById(VIVAGYM_PICOAS_ID)!;
      const b = findCenterById(FITNESSUP_PICOAS_ID)!;
      expect(a.brand).toBe('VivaGym');
      expect(b.brand).toBe('Fitness UP');
      expect(normalizeAddr(a.address)).not.toBe(normalizeAddr(b.address));
      const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
      expect(d).toBeLessThan(120);
      expect(d).toBeGreaterThan(20);
    });

    it('no identical-coordinate clusters; no same-brand ≤100 m', () => {
      let same25 = 0;
      let same50 = 0;
      let same100 = 0;
      let identical = 0;
      for (let i = 0; i < ptCenters.length; i++) {
        for (let j = i + 1; j < ptCenters.length; j++) {
          const a = ptCenters[i]!;
          const b = ptCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (Math.abs(a.lat! - b.lat!) < 1e-7 && Math.abs(a.lng! - b.lng!) < 1e-7) {
            identical += 1;
          }
          if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
          if (d <= 25) same25 += 1;
          else if (d <= 50) same50 += 1;
          else if (d <= 100) same100 += 1;
        }
      }
      expect(identical).toBe(0);
      expect(same25).toBe(0);
      expect(same50).toBe(0);
      expect(same100).toBe(0);
    });
  });

  describe('7. Madeira island QA', () => {
    it('exactly 5 Madeira gyms with Madeira coordinates and postcodes', () => {
      const madeira = ptCenters.filter(c => islandOf(c.lat!, c.lng!) === 'Madeira');
      expect(madeira.length).toBe(5);
      expect(madeira.map(c => c.id).sort()).toEqual([...MADEIRA_IDS].sort());
      for (const id of MADEIRA_IDS) {
        const c = findCenterById(id)!;
        expect(islandOf(c.lat!, c.lng!)).toBe('Madeira');
        expect(PORTUGAL_POSTAL_RE.test(c.postal_code)).toBe(true);
        expect(c.postal_code.startsWith('90') || c.postal_code.startsWith('91')).toBe(true);
        expect(getGymLatLngForCheckIn(id)).not.toBeNull();
        expect(findGymById(id)?.id).toBe(id);
      }
    });

    it('Funchal search and nearest resolve to Madeira gyms', () => {
      const hits = searchGyms('Funchal', {
        gyms: portugal,
        limit: 20,
        userLat: 32.6669,
        userLng: -16.9241,
      });
      expect(hits.some(h => h.gym.id.startsWith('pt_'))).toBe(true);
      const nearest = findNearestGym(32.6669, -16.9241, portugal);
      expect(nearest?.id.startsWith('pt_')).toBe(true);
      expect(islandOf(nearest!.latitude, nearest!.longitude)).toBe('Madeira');
    });
  });

  describe('8. Azores island QA', () => {
    it('exactly 2 Azores gyms with Azores coordinates', () => {
      const azores = ptCenters.filter(c => islandOf(c.lat!, c.lng!) === 'Azores');
      expect(azores.length).toBe(2);
      expect(azores.map(c => c.id).sort()).toEqual([...AZORES_IDS].sort());
      for (const id of AZORES_IDS) {
        const c = findCenterById(id)!;
        expect(islandOf(c.lat!, c.lng!)).toBe('Azores');
        expect(c.lng!).toBeLessThan(-24);
        expect(getGymLatLngForCheckIn(id)).not.toBeNull();
      }
    });

    it('Angra / Arrifes nearest stay on Azores', () => {
      const angra = findNearestGym(38.6595, -27.219, portugal);
      expect(angra?.id).toBe('pt_34bec26868');
      const pd = findNearestGym(37.7412, -25.6756, portugal);
      expect(pd?.id).toBe('pt_7d40ef811b');
    });
  });

  describe('9. Search — brands and cities', () => {
    const brands = Object.keys(EXPECTED_BRANDS);

    it.each(brands)('%s returns pt_* near Lisboa', brand => {
      const hits = searchGyms(brand, {limit: 40, userLat: 38.7223, userLng: -9.1393});
      expect(hits.some(h => h.gym.id.startsWith('pt_'))).toBe(true);
    });

    it.each(['fit', 'fitn', 'fitness', 'viv', 'viva', 'elem', 'sol', 'lis', 'lisb', 'porto'])(
      'incremental typing %s returns results',
      q => {
        const t0 = Date.now();
        const hits = searchGyms(q, {limit: 30, userLat: 38.7223, userLng: -9.1393, gyms: portugal});
        expect(Date.now() - t0).toBeLessThan(1500);
        expect(hits.length).toBeGreaterThan(0);
      },
    );

    it.each([
      ['Lisboa', 38.7223, -9.1393],
      ['Lisbon', 38.7223, -9.1393],
      ['Porto', 41.1579, -8.6291],
      ['Vila Nova de Gaia', 41.1239, -8.6118],
      ['Gaia', 41.1239, -8.6118],
      ['Braga', 41.5454, -8.4265],
      ['Coimbra', 40.2033, -8.4103],
      ['Aveiro', 40.6405, -8.6538],
      ['Faro', 37.0194, -7.9322],
      ['Setúbal', 38.5244, -8.8882],
      ['Funchal', 32.6669, -16.9241],
      ['Angra do Heroísmo', 38.6595, -27.219],
      ['Ponta Delgada', 37.7412, -25.6756],
    ])('%s returns pt_*', (city, lat, lng) => {
      const hits = searchGyms(city, {limit: 40, userLat: lat, userLng: lng});
      expect(hits.filter(h => h.gym.id.startsWith('pt_')).length).toBeGreaterThan(0);
    });

    it('ASCII/diacritic folding does not mutate stored display text', () => {
      expect(normalizeGymSearchValue('São João')).toBe('sao joao');
      expect(normalizeGymSearchValue('João')).toBe('joao');
      expect(normalizeGymSearchValue('Évora')).toBe('evora');
      expect(normalizeGymSearchValue('Santarém')).toBe('santarem');
      const sjm = ptCenters.find(c => (c.city || '').includes('São João da Madeira'));
      if (sjm) {
        expect(sjm.city).toContain('São');
        expect(sjm.city).not.toBe(normalizeGymSearchValue(sjm.city));
      }
    });
  });

  describe('10. Postcode search', () => {
    it('formatted and compact Portuguese postcodes resolve pt_*', () => {
      const sample = ptCenters.find(c => c.postal_code === '1050-010') || ptCenters[0]!;
      const formatted = searchGyms(sample.postal_code, {
        limit: 20,
        userLat: sample.lat!,
        userLng: sample.lng!,
      });
      expect(formatted.some(h => h.gym.id.startsWith('pt_'))).toBe(true);
      const compact = compactGymSearchValue(sample.postal_code);
      expect(compact).toMatch(/^\d{7}$/);
      const compactHits = searchGyms(compact, {
        limit: 20,
        userLat: sample.lat!,
        userLng: sample.lng!,
        gyms: portugal,
      });
      expect(compactHits.some(h => h.gym.id === sample.id || h.gym.id.startsWith('pt_'))).toBe(
        true,
      );
    });

    it('AT 1010 / BE 1000 / CH 8001 still resolve their own prefixes', () => {
      expect(searchGyms('1010', {limit: 20}).some(h => h.gym.id.startsWith('at_'))).toBe(true);
      expect(searchGyms('1000', {limit: 20}).some(h => h.gym.id.startsWith('be_'))).toBe(true);
      expect(searchGyms('8001', {limit: 20}).some(h => h.gym.id.startsWith('ch_'))).toBe(true);
    });
  });

  describe('11. Nearest', () => {
    const points: Array<[string, number, number]> = [
      ['Lisbon', 38.7223, -9.1393],
      ['Porto', 41.1579, -8.6291],
      ['Braga', 41.5454, -8.4265],
      ['Coimbra', 40.2033, -8.4103],
      ['Faro', 37.0194, -7.9322],
      ['Funchal', 32.6669, -16.9241],
      ['Angra', 38.6595, -27.219],
      ['Ponta Delgada', 37.7412, -25.6756],
    ];

    it.each(points)('%s nearest is pt_* and geographically plausible', (_label, lat, lng) => {
      const nearest = findNearestGym(lat, lng, portugal);
      expect(nearest?.id.startsWith('pt_')).toBe(true);
      expect(nearest?.country).toBe('Portugal');
      const d = calculateDistance(lat, lng, nearest!.latitude, nearest!.longitude);
      expect(d).toBeLessThan(25000);
      expect(nearest!.id).not.toBe(gyms[0]!.id);
    });
  });

  describe('12. Map viewport', () => {
    function toMap(gs: typeof portugal) {
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

    it.each([
      ['Lisbon', 38.7223, -9.1393, 0.4],
      ['Porto', 41.1579, -8.6291, 0.4],
      ['Braga', 41.5454, -8.4265, 0.35],
      ['Algarve', 37.1, -8.0, 0.8],
      ['Madeira', 32.66, -16.92, 0.35],
      ['Azores', 38.0, -27.0, 2.5],
    ])('%s viewport is scoped (not full catalog)', (_label, lat, lng, delta) => {
      const visible = filterMapCentersInRegion(toMap(portugal) as never, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(247);
      expect(visible.length).toBeLessThan(10772);
      expect(visible.every(v => v.id.startsWith('pt_'))).toBe(true);
    });

    it('dense Lisbon pins remain individually addressable by ID', () => {
      const a = findGymById(VIVAGYM_PICOAS_ID)!;
      const b = findGymById(FITNESSUP_PICOAS_ID)!;
      expect(a.id).not.toBe(b.id);
      expect(a.latitude).not.toBeCloseTo(b.latitude, 5);
    });
  });

  describe('13. 200 m check-in + auto-checkout', () => {
    it('global radii remain 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['mainland Picoas', FITNESSUP_PICOAS_ID],
      ['Madeira Funchal', 'pt_8e9361add0'],
      ['Azores Arrifes', 'pt_7d40ef811b'],
      ['dense Carcavelos', CARCAVELOS_ID],
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

    it('nearby gym does not replace session gym ID for check-in math', () => {
      const session = getGymLatLngForCheckIn(CARCAVELOS_ID)!;
      const other = getGymLatLngForCheckIn(PAREDE_ID)!;
      expect(session.latitude).not.toBeCloseTo(other.latitude, 5);
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
      expect(d).toBeGreaterThan(90);
    });
  });

  describe('14. Core flows / orphan', () => {
    it('pt_* resolves for onboarding/profile/favorites paths', () => {
      const sample = portugal[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
      expect(getActiveGymsByCountry('Portugal').length).toBe(247);
      expect(formatGymDisplayName(findGymById(sample.id))).not.toMatch(/^pt_/);
      const coords = getEffectiveLatLng(findCenterById(sample.id)!);
      expect(Number.isFinite(coords.lat)).toBe(true);
    });

    it('orphan pt_nonexistent_test is safe Portugal stub (not DK/ES/catalog[0])', () => {
      const stub = resolveGymOrStub('pt_nonexistent_test');
      expect(stub.id).toBe('pt_nonexistent_test');
      expect(stub.region).toBe('Portugal');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('pt_nonexistent_test').name);
      expect(findGymById('pt_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
    });

    it('Portugal country label i18n key resolves', () => {
      expect(gymCountryTranslationKey('Portugal')).toBe('countries.portugal');
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Portugal', t)).toBe('Portugal');
    });
  });

  describe('15. Country regression counts', () => {
    it('exact 15-country production counts', () => {
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

  describe('16. Performance sanity', () => {
    it('search index builds for full catalog under 5s', () => {
      const t0 = Date.now();
      getGymSearchIndex(gyms);
      expect(Date.now() - t0).toBeLessThan(5000);
    });

    it('typical Portugal searches under 3s on live catalog', () => {
      const t0 = Date.now();
      searchGyms('Fitness UP Lisboa', {gyms, limit: 20});
      searchGyms('VivaGym Porto', {gyms, limit: 20});
      searchGyms('Funchal', {gyms, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });
});
