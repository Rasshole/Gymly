/**
 * Bulgaria gym QA — full production validation after bg_* merge (82 centers).
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
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  BULGARIA_POSTAL_RE,
  isBulgariaCountry,
  isPlausibleBulgariaCoordinate,
  isPlausibleGreeceCoordinate,
  isPlausibleRomaniaCoordinate,
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

const staging = require('../data/bulgaria/bulgaria_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  notes?: string;
}>;

const approved = require('../data/bulgaria/BULGARIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase3Ready = require('../data/bulgaria/BULGARIA_PHASE3_READY_TO_IMPORT.json') as Array<{
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
  /\b(romania|serbia|macedonia|skopje|strumica|greece|thessaloniki|turkey|istanbul|atlantis)\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  'Next Level Fitness': 29,
  'Pulse Fitness': 19,
  'Flais Fitness': 14,
  'Athletic Fitness': 9,
  'Titanium Fitness': 6,
  'Hammer Gym': 5,
};

const EXPECTED_CITIES: Record<string, number> = {
  Sofia: 65,
  Plovdiv: 6,
  Burgas: 4,
  Varna: 2,
  'Stara Zagora': 2,
  Pernik: 1,
  'Sveti Vlas': 1,
  Kardzhali: 1,
};

const PULSE_PLATINUM = 'bg_5ff29203ad';
const PULSE_WEST_PARK = 'bg_5d141dacf5';
const PULSE_LYULIN = 'bg_b05cd8d08e';
const HAMMER_PLATINUM = 'bg_3ee4262945';
const TITANIUM_SG = 'bg_900362e749';
const TITANIUM_MLADOST3 = 'bg_5448ddd9dd';
const FLAIS_ALERA = 'bg_1eb791b2fd';
const FLAIS_CENTRAL_PARK = 'bg_2fe399a8c4';
const FLAIS_VESLEC = 'bg_1d4b8086db';
const FLAIS_MLADOST_BP = 'bg_163e7c5e53';

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
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
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

describe('Bulgaria gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const bulgaria = gyms.filter(g => isBulgariaCountry(g.country));
  const bgCenters = catalog.filter(c => isBulgariaCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Bulgaria = 82; bg_* = 82', () => {
      expect(catalog.length).toBe(11692);
      expect(bgCenters.length).toBe(82);
      expect(bulgaria.length).toBe(82);
      expect(catalog.filter(c => c.id.startsWith('bg_')).length).toBe(82);
    });

    it('production IDs reconcile with approved + Phase3 READY + staging MERGED', () => {
      const prod = new Set(bgCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase3Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(82);
      expect(ap.size).toBe(82);
      expect(ready.size).toBe(82);
      expect(merged.size).toBe(82);
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

    it('all bg_* IDs unique with required fields and valid Bulgaria geography', () => {
      const ids = new Set<string>();
      for (const c of bgCenters) {
        expect(c.id).toMatch(/^bg_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Bulgaria');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(5);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(BULGARIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleBulgariaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
      }
      expect(ids.size).toBe(82);
    });

    it('brand breakdown exact', () => {
      const byBrand: Record<string, number> = {};
      for (const c of bgCenters) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.keys(byBrand).sort()).toEqual(Object.keys(EXPECTED_BRANDS).sort());
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(82);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('MERGED=82 COMING_SOON=2 NEEDS_REVIEW=1 EXCLUDED=20; none unresolved live', () => {
      const cats = staging.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.MERGED_INTO_CATALOG).toBe(82);
      expect(cats.COMING_SOON).toBe(2);
      expect(cats.NEEDS_REVIEW).toBe(1);
      expect(cats.EXCLUDED).toBe(20);

      const prodIds = new Set(bgCenters.map(c => c.id));
      const unresolved = staging.filter(s => s.import_category !== 'MERGED_INTO_CATALOG');
      expect(unresolved.length).toBe(23);
      for (const s of unresolved) {
        expect(prodIds.has(s.id)).toBe(false);
      }

      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      expect(coming.every(s => /pulse/i.test(s.brand || ''))).toBe(true);
      expect(coming.every(s => /ovcha\s*kupel|drujba|druzhba/i.test(s.name || ''))).toBe(true);
      expect(
        staging.some(s => s.import_category === 'NEEDS_REVIEW' && /nikolai\s*kopernik/i.test(s.name || '')),
      ).toBe(true);
    });

    it('coming-soon / hotel / foreign / NK absent from production', () => {
      const blob = bgCenters.map(c => `${c.brand} ${c.name}`).join('\n');
      expect(bgCenters.some(c => /pulse/i.test(c.brand || '') && /ovcha\s*kupel/i.test(c.name || ''))).toBe(
        false,
      );
      expect(bgCenters.some(c => /pulse/i.test(c.brand || '') && /drujba|druzhba/i.test(c.name || ''))).toBe(
        false,
      );
      expect(/atlantis|strumica/i.test(blob)).toBe(false);
      expect(/therme|royal\s*hotel/i.test(blob)).toBe(false);
      expect(/nikolai\s*kopernik/i.test(blob)).toBe(false);
      expect(/platinum\s*health\s*club/i.test(blob)).toBe(false);
    });
  });

  describe('3. Next Level Fitness QA', () => {
    it('29 live; Sofia + regional estate; current/open with valid geography', () => {
      const nl = bgCenters.filter(c => c.brand === 'Next Level Fitness');
      expect(nl.length).toBe(29);
      expect(nl.every(c => c.is_active !== false)).toBe(true);
      expect(nl.every(c => isPlausibleBulgariaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(nl.filter(c => c.city === 'Sofia').length).toBe(23);
      expect(nl.some(c => c.city === 'Varna')).toBe(true);
      expect(nl.some(c => c.city === 'Plovdiv')).toBe(true);
      expect(nl.some(c => c.city === 'Burgas')).toBe(true);
      expect(nl.some(c => c.city === 'Pernik')).toBe(true);
      expect(nl.every(c => BULGARIA_POSTAL_RE.test(String(c.postal_code)))).toBe(true);
      const mall = findCenterById('bg_3b2837619b')!;
      expect(mall.name).toMatch(/Bulgaria Mall/i);
      expect(mall.city).toBe('Sofia');
    });
  });

  describe('4. Pulse Fitness QA', () => {
    it('19 live/open; Platinum / West Park / Lyulin correct; exclusions absent', () => {
      const pulse = bgCenters.filter(c => c.brand === 'Pulse Fitness');
      expect(pulse.length).toBe(19);
      expect(pulse.every(c => c.is_active !== false)).toBe(true);

      const plat = findCenterById(PULSE_PLATINUM)!;
      expect(plat.brand).toBe('Pulse Fitness');
      expect(plat.name).toBe('Pulse Platinum');
      expect(plat.address).toMatch(/Rezbarska/i);
      expect(plat.postal_code).toBe('1517');
      expect(plat.city).toBe('Sofia');
      expect(bgCenters.some(c => /platinum\s*health/i.test(`${c.brand} ${c.name}`))).toBe(false);

      const wp = findCenterById(PULSE_WEST_PARK)!;
      const ly = findCenterById(PULSE_LYULIN)!;
      expect(wp.name).toBe('Pulse West Park');
      expect(ly.name).toBe('Pulse Lyulin');
      const d = haversineMeters(wp.lat!, wp.lng!, ly.lat!, ly.lng!);
      expect(d).toBeGreaterThan(900);
      expect(d).toBeLessThan(1300);

      expect(pulse.every(c => !/atlantis|therme|royal\s*hotel|ovcha\s*kupel|drujba/i.test(c.name || ''))).toBe(
        true,
      );
    });
  });

  describe('5. Flais Fitness QA', () => {
    it('14 live; Phase 2 difficult recoveries map to correct physical gyms', () => {
      const flais = bgCenters.filter(c => c.brand === 'Flais Fitness');
      expect(flais.length).toBe(14);
      expect(flais.every(c => c.is_active !== false)).toBe(true);

      const alera = findCenterById(FLAIS_ALERA)!;
      expect(alera.name).toMatch(/Alera/i);
      expect(alera.address).toMatch(/Ovcha Kupel|761/i);
      expect(alera.postal_code).toBe('1632');
      expect(isPlausibleBulgariaCoordinate(alera.lat!, alera.lng!)).toBe(true);

      const cp = findCenterById(FLAIS_CENTRAL_PARK)!;
      expect(cp.name).toMatch(/Central Park/i);
      expect(cp.address).toMatch(/Skopie|Banishora/i);
      expect(cp.postal_code).toBe('1233');

      const veslec = findCenterById(FLAIS_VESLEC)!;
      expect(veslec.name).toMatch(/Veslec/i);
      expect(veslec.address).toMatch(/Veslec/i);
      expect(veslec.postal_code).toBe('1000');

      const mbp = findCenterById(FLAIS_MLADOST_BP)!;
      expect(mbp.name).toMatch(/Mladost/i);
      expect(mbp.address).toMatch(/Business Park|Sport Depot/i);
      expect(mbp.postal_code).toBe('1715');
    });
  });

  describe('6. Athletic Fitness QA', () => {
    it('9 live Sofia/Plovdiv/Stara Zagora; Nikolai Kopernik absent', () => {
      const ath = bgCenters.filter(c => c.brand === 'Athletic Fitness');
      expect(ath.length).toBe(9);
      expect(ath.every(c => c.is_active !== false)).toBe(true);
      expect(ath.filter(c => c.city === 'Sofia').length).toBe(6);
      expect(ath.filter(c => c.city === 'Plovdiv').length).toBe(2);
      expect(ath.filter(c => c.city === 'Stara Zagora').length).toBe(1);
      expect(ath.every(c => !/nikolai|kopernik/i.test(c.name || ''))).toBe(true);
      expect(ath.every(c => BULGARIA_POSTAL_RE.test(String(c.postal_code)))).toBe(true);
      const plaza = findCenterById('bg_32094057e9')!;
      expect(plaza.name).toMatch(/Plovdiv Plaza/i);
      expect(plaza.city).toBe('Plovdiv');
      expect(plaza.postal_code).toBe('4000');
    });
  });

  describe('7. Titanium Fitness QA', () => {
    it('6 live; Studentski Grad / Mladost 3 identity correction not swapped', () => {
      const ti = bgCenters.filter(c => c.brand === 'Titanium Fitness');
      expect(ti.length).toBe(6);

      const sg = findCenterById(TITANIUM_SG)!;
      expect(sg.name).toMatch(/Studentski Grad/i);
      expect(sg.address).toMatch(/Симеоновско|Simeonovsko/i);
      expect(sg.postal_code).toBe('1734');
      expect(sg.address).not.toMatch(/Блок 386|Blok 386/i);

      const m3 = findCenterById(TITANIUM_MLADOST3)!;
      expect(m3.name).toMatch(/Mladost 3/i);
      expect(m3.address).toMatch(/Блок 386|Blok 386|Младост 3/i);
      expect(m3.postal_code).toBe('1712');
      expect(m3.address).not.toMatch(/Симеоновско|Simeonovsko/i);

      const dist = haversineMeters(sg.lat!, sg.lng!, m3.lat!, m3.lng!);
      expect(dist).toBeGreaterThan(3000);
    });
  });

  describe('8. Hammer Gym QA', () => {
    it('5 live; Hammer Platinum distinct from Pulse Platinum', () => {
      const ham = bgCenters.filter(c => c.brand === 'Hammer Gym');
      expect(ham.length).toBe(5);
      expect(ham.every(c => c.is_active !== false)).toBe(true);

      const hp = findCenterById(HAMMER_PLATINUM)!;
      const pp = findCenterById(PULSE_PLATINUM)!;
      expect(hp.brand).toBe('Hammer Gym');
      expect(hp.name).toBe('Hammer Gym Platinum');
      expect(hp.address).toMatch(/George Washington/i);
      expect(hp.postal_code).toBe('1000');
      expect(pp.brand).toBe('Pulse Fitness');
      expect(pp.address).toMatch(/Rezbarska/i);
      expect(hp.id).not.toBe(pp.id);
      const d = haversineMeters(hp.lat!, hp.lng!, pp.lat!, pp.lng!);
      expect(d).toBeGreaterThan(2000);
    });
  });

  describe('9. Duplicate / proximity QA', () => {
    it('no duplicate IDs, same-brand <=200m, identical coords; 3 A_legitimate different-brand pairs', () => {
      const ids = bgCenters.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);

      let lt25 = 0;
      let lt50 = 0;
      let lt100 = 0;
      let lt200 = 0;
      let identical = 0;
      let sameAddr = 0;
      const diffBrand: Array<{d: number; a: string; b: string; brands: string}> = [];
      const addrKey = (c: (typeof bgCenters)[number]) =>
        [
          normalizeAddr(c.address || ''),
          c.postal_code,
          normalizeAddr(c.city || ''),
          normalizeAddr(c.brand || ''),
        ].join('|');

      for (let i = 0; i < bgCenters.length; i++) {
        for (let j = i + 1; j < bgCenters.length; j++) {
          const a = bgCenters[i]!;
          const b = bgCenters[j]!;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          if (d === 0) identical++;
          if (addrKey(a) === addrKey(b)) sameAddr++;
          if (normalizeAddr(a.brand || '') !== normalizeAddr(b.brand || '')) {
            if (d <= 100) {
              diffBrand.push({
                d: Math.round(d),
                a: a.id,
                b: b.id,
                brands: `${a.brand}|${b.brand}`,
              });
            }
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
      expect(diffBrand.length).toBe(3);

      const pairKeys = diffBrand.map(p => [p.a, p.b].sort().join('+')).sort();
      expect(pairKeys).toEqual(
        [
          ['bg_126696d4df', 'bg_900362e749'].sort().join('+'),
          ['bg_14fc047239', 'bg_32094057e9'].sort().join('+'),
          ['bg_3b2837619b', 'bg_b6ab1909ed'].sort().join('+'),
        ].sort(),
      );
    });
  });

  describe('10. Border safety', () => {
    it('rejects neighbor cores; all live coords plausible BG; Black Sea coast OK', () => {
      expect(isPlausibleBulgariaCoordinate(42.6977, 23.3219)).toBe(true); // Sofia
      expect(isPlausibleBulgariaCoordinate(43.2141, 27.9147)).toBe(true); // Varna
      expect(isPlausibleBulgariaCoordinate(42.5048, 27.4626)).toBe(true); // Burgas
      expect(isPlausibleBulgariaCoordinate(44.4268, 26.1025)).toBe(false); // Bucharest
      expect(isPlausibleBulgariaCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
      expect(isPlausibleBulgariaCoordinate(41.9981, 21.4254)).toBe(false); // Skopje
      expect(isPlausibleBulgariaCoordinate(40.6401, 22.9444)).toBe(false); // Thessaloniki
      expect(isPlausibleBulgariaCoordinate(41.0082, 28.9784)).toBe(false); // Istanbul

      expect(bgCenters.every(c => isPlausibleBulgariaCoordinate(c.lat!, c.lng!))).toBe(true);
      expect(
        bgCenters.every(
          c => !(c.lat! >= 44.0 && c.lng! >= 25.0 && c.lng! <= 27.5), // Romania corridor
        ),
      ).toBe(true);
      expect(isPlausibleRomaniaCoordinate(44.4268, 26.1025)).toBe(true);
      expect(isPlausibleGreeceCoordinate(40.6401, 22.9444)).toBe(true);

      const coastal = bgCenters.filter(c => /varna|burgas|sveti vlas/i.test(c.city || ''));
      expect(coastal.length).toBe(7);
      expect(coastal.every(c => isPlausibleBulgariaCoordinate(c.lat!, c.lng!))).toBe(true);
    });
  });

  describe('11. Bulgarian text / Cyrillic', () => {
    it('preserves UTF-8; cities stay official Latin; search folds Cyrillic', () => {
      const cities = bgCenters.map(c => c.city || '');
      for (const city of [
        'Sofia',
        'Plovdiv',
        'Varna',
        'Burgas',
        'Stara Zagora',
        'Pernik',
        'Sveti Vlas',
        'Kardzhali',
      ]) {
        expect(cities).toContain(city);
      }
      // Stored cities remain Latin official forms (not mutated by search transliteration)
      expect(cities.every(c => !/София|Пловдив|Варна|Бургас|Стара Загора|Кърджали/.test(c))).toBe(
        true,
      );
      expect(normalizeGymSearchValue('Sofia')).toBe('sofia');
      expect(normalizeGymSearchValue('София')).toMatch(/sofia|софия/i);
      expect(normalizeGymSearchValue('Plovdiv')).toBe('plovdiv');
      expect(normalizeGymSearchValue('Пловдив')).toMatch(/plovdiv|пловдив/i);
      expect(normalizeGymSearchValue('Varna')).toBe('varna');
      expect(normalizeGymSearchValue('Варна')).toMatch(/varna|варна/i);
      expect(normalizeGymSearchValue('Burgas')).toBe('burgas');
      expect(normalizeGymSearchValue('Бургас')).toMatch(/burgas|бургас/i);
      expect(normalizeGymSearchValue('Stara Zagora')).toBe('stara zagora');
      expect(normalizeGymSearchValue('Стара Загора')).toMatch(/stara zagora|стара загора/i);
      expect(normalizeGymSearchValue('Кърджали')).toMatch(/kardzhali|кърджали|кърджали/i);
      for (const c of bgCenters) {
        expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      }
      // Cyrillic addresses remain valid UTF-8 (Titanium / Flais recoveries)
      expect(findCenterById(TITANIUM_SG)!.address).toMatch(/Симеоновско/);
      expect(findCenterById(TITANIUM_MLADOST3)!.address).toMatch(/Младост|Блок/);
    });
  });

  describe('12. Search QA', () => {
    it('brands, cities (Cyrillic+Latin), postcodes, 4-digit country context', () => {
      getGymSearchIndex();
      expect(
        searchGyms('Next Level Fitness', {gyms: bulgaria, limit: 40}).every(h =>
          h.gym.id.startsWith('bg_'),
        ),
      ).toBe(true);
      expect(
        searchGyms('next level', {gyms: bulgaria, limit: 40}).filter(h =>
          /next level/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(29);
      expect(
        searchGyms('Pulse Fitness', {gyms: bulgaria, limit: 30}).filter(h =>
          /pulse/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(19);
      expect(
        searchGyms('pulse', {gyms: bulgaria, limit: 30}).filter(h =>
          /pulse/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(19);
      expect(
        searchGyms('Flais Fitness', {gyms: bulgaria, limit: 20}).filter(h =>
          /flais/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(14);
      expect(
        searchGyms('flais', {gyms: bulgaria, limit: 20}).filter(h =>
          /flais/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(14);
      expect(
        searchGyms('Athletic Fitness', {gyms: bulgaria, limit: 20}).filter(h =>
          /athletic/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(9);
      expect(
        searchGyms('athletic', {gyms: bulgaria, limit: 20}).filter(h =>
          /athletic/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(9);
      expect(
        searchGyms('Titanium Fitness', {gyms: bulgaria, limit: 20}).filter(h =>
          /titanium/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(6);
      expect(
        searchGyms('titanium', {gyms: bulgaria, limit: 20}).filter(h =>
          /titanium/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(6);
      expect(
        searchGyms('Hammer Gym', {gyms: bulgaria, limit: 20}).filter(h =>
          /hammer/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(5);
      expect(
        searchGyms('hammer', {gyms: bulgaria, limit: 20}).filter(h =>
          /hammer/i.test(h.gym.brand || ''),
        ).length,
      ).toBe(5);

      expect(
        searchGyms('Next Level Sofia', {limit: 40}).some(h => h.gym.id.startsWith('bg_')),
      ).toBe(true);

      const cityQueries = [
        'Sofia',
        'София',
        'Plovdiv',
        'Пловдив',
        'Varna',
        'Варна',
        'Burgas',
        'Бургас',
        'Stara Zagora',
        'Стара Загора',
        'Pernik',
        'Перник',
        'Sveti Vlas',
        'Свети Влас',
        'Kardzhali',
        'Кърджали',
      ];
      for (const q of cityQueries) {
        expect(searchGyms(q, {limit: 30}).some(h => h.gym.id.startsWith('bg_'))).toBe(true);
      }

      const sample = bgCenters.find(c => c.postal_code === '1000') || bgCenters[0]!;
      const pc = String(sample.postal_code);
      expect(typeof sample.postal_code).toBe('string');
      expect(BULGARIA_POSTAL_RE.test(pc)).toBe(true);
      // Country-qualified postcode search avoids AT/BE/CH/HU 4-digit collisions
      expect(
        searchGyms(`Sofia ${pc}`, {limit: 30}).some(h => h.gym.id.startsWith('bg_')),
      ).toBe(true);
      const bgScoped = searchGyms(pc, {gyms: bulgaria, limit: 20});
      expect(bgScoped.every(h => h.gym.id.startsWith('bg_'))).toBe(true);
      expect(bgScoped.length).toBeGreaterThan(0);
    });
  });

  describe('13. Regional coverage', () => {
    it('matches Phase 3 READY footprint; known zero-chain cities remain zero', () => {
      const byCity: Record<string, number> = {};
      for (const c of bgCenters) byCity[c.city!] = (byCity[c.city!] || 0) + 1;
      for (const [city, n] of Object.entries(EXPECTED_CITIES)) {
        expect(byCity[city]).toBe(n);
      }
      for (const zero of [
        'Ruse',
        'Pleven',
        'Sliven',
        'Dobrich',
        'Shumen',
        'Haskovo',
        'Yambol',
        'Veliko Tarnovo',
        'Blagoevgrad',
      ]) {
        expect(bgCenters.filter(c => new RegExp(zero, 'i').test(c.city || '')).length).toBe(0);
      }
    });
  });

  describe('14. Onboarding / profile / nearest / map', () => {
    it('onboarding selection persists bg_* ID for representative cities', () => {
      for (const city of ['Sofia', 'Plovdiv', 'Varna', 'Burgas']) {
        const pick = bulgaria.find(g => g.city === city)!;
        expect(pick.id.startsWith('bg_')).toBe(true);
        expect(findGymById(pick.id)?.id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Bulgaria');
        expect(formatGymDisplayName(pick).length).toBeGreaterThan(0);
      }
      expect(gymCountryTranslationKey('Bulgaria')).toBe('countries.bulgaria');
      const t = createTranslator(en as never);
      expect(formatGymCountryLabel('Bulgaria', t)).toBe('Bulgaria');
    });

    it('profile / favorites resolve exact bg_* IDs without catalog[0] fallback', () => {
      const primary = bulgaria.find(g => g.city === 'Sofia')!;
      const extra = bulgaria.find(g => g.city === 'Plovdiv')!;
      expect(findGymById(primary.id)?.id).toBe(primary.id);
      expect(findGymById(extra.id)?.id).toBe(extra.id);
      expect(findCenterById(primary.id)?.id).toBe(primary.id);
      expect(primary.id).not.toBe(catalog[0]!.id);
      expect(getActiveGymsByCountry('Bulgaria').length).toBe(82);
      const ro = gyms.find(g => g.id.startsWith('ro_'));
      const gr = gyms.find(g => g.id.startsWith('gr_'));
      if (ro) {
        expect(findGymById(ro.id)?.id).toBe(ro.id);
        expect(findGymById(primary.id)?.id).toBe(primary.id);
      }
      if (gr) {
        expect(findGymById(gr.id)?.id).toBe(gr.id);
        expect(findGymById(primary.id)?.id).toBe(primary.id);
      }
    });

    it('nearest returns plausible bg_* near major cities', () => {
      const fixtures = [
        {lat: 42.6977, lng: 23.3219, label: 'Sofia'},
        {lat: 42.1354, lng: 24.7453, label: 'Plovdiv'},
        {lat: 43.2141, lng: 27.9147, label: 'Varna'},
        {lat: 42.5048, lng: 27.4626, label: 'Burgas'},
        {lat: 42.4258, lng: 25.6345, label: 'Stara Zagora'},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, bulgaria);
        expect(n?.id.startsWith('bg_')).toBe(true);
        expect(isBulgariaCountry(n!.country)).toBe(true);
      }
    });

    it('map viewport filters BG markers without rendering full catalog', () => {
      const markers = toMap(bulgaria);
      const viewports = [
        {latitude: 42.7, longitude: 23.32, latitudeDelta: 0.2, longitudeDelta: 0.2},
        {latitude: 42.14, longitude: 24.75, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 43.21, longitude: 27.91, latitudeDelta: 0.15, longitudeDelta: 0.15},
        {latitude: 42.5, longitude: 27.46, latitudeDelta: 0.15, longitudeDelta: 0.15},
      ];
      for (const region of viewports) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(catalog.length);
        expect(visible.every(v => v.id.startsWith('bg_'))).toBe(true);
      }
      const sofia = filterMapCentersInRegion(markers as never, {
        latitude: 42.7,
        longitude: 23.32,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      expect(sofia.length).toBeGreaterThan(20);
      const pick = sofia[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
      // Nearby different brands independently selectable
      const brands = new Set(sofia.map(v => findCenterById(v.id)?.brand).filter(Boolean));
      expect(brands.size).toBeGreaterThan(1);
    });
  });

  describe('15. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Pulse Platinum dense Sofia', () => PULSE_PLATINUM],
      ['Pulse West Park', () => PULSE_WEST_PARK],
      ['Titanium Studentski Grad', () => TITANIUM_SG],
      ['Next Level Bulgaria Mall', () => 'bg_3b2837619b'],
      ['Athletic Plovdiv Plaza', () => 'bg_32094057e9'],
    ])('%s uses selected gym coords; 199/200 allowed, 201 away', (_label, idFn) => {
      const id = idFn();
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      const center = findCenterById(id)!;
      expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
      expect(coords!.longitude).toBeCloseTo(center.lng!, 5);
      // Check-in: distance <= radius allowed
      expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
      expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    });

    it('nearby Sofia gyms do not replace session gym ID', () => {
      const a = findGymById(PULSE_PLATINUM)!;
      const b = findGymById(HAMMER_PLATINUM)!;
      expect(a.id).not.toBe(b.id);
      const session = getGymLatLngForCheckIn(a.id)!;
      const other = getGymLatLngForCheckIn(b.id)!;
      expect(session.latitude).toBeCloseTo(a.latitude, 5);
      expect(other.latitude).toBeCloseTo(b.latitude, 5);
      expect(findGymById(a.id)!.id).not.toBe(findGymById(b.id)!.id);
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

  describe('16. Core flows / orphan ID', () => {
    it('bg_* resolves for workout/profile/favorites paths', () => {
      const live = bulgaria[0]!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Bulgaria').length).toBe(82);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^bg_/);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });

    it('orphan bg_nonexistent_test is safe Bulgaria stub (not RO/GR/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('bg_nonexistent_test');
      expect(stub.id).toBe('bg_nonexistent_test');
      expect(stub.region).toBe('Bulgaria');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('bg_nonexistent_test').name);
      expect(findGymById('bg_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Romania');
      expect(stub.region).not.toBe('Greece');
      expect(stub.region).not.toBe('Denmark');
    });
  });

  describe('17. Country regression', () => {
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

  describe('18. Performance snapshot', () => {
    it('records live catalog timings vs Bulgaria merge / Slovakia / Romania baselines', () => {
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
      searchGyms('sofia', {limit: 20});
      searchGyms('plovdiv', {limit: 20});
      searchGyms('pulse fitness', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(42.6977, 23.3219, bulgaria);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(bulgaria);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 42.7,
        longitude: 23.32,
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
          catalog: 11648,
          json_size_mb: 3.36,
        },
        slovakia_qa_baseline: {
          catalog: 11254,
          json_size_mb: 3.33,
        },
        romania_qa_baseline: {
          catalog: 11217,
          json_size_mb: 3.32,
        },
      };
      const outDir = path.join(__dirname, '../data/bulgaria');
      fs.writeFileSync(path.join(outDir, 'BULGARIA_QA_PERF.json'), JSON.stringify(perf, null, 2) + '\n');
      expect(perf.catalog).toBe(11692);
      expect(perf.json_size_mb).toBeGreaterThan(3);
      expect(perf.json_size_mb).toBeLessThan(5);
      expect(perf.cold_index_ms).toBeLessThan(25000);
      expect(perf.typical_search_ms).toBeLessThan(2000);
    });
  });
});
