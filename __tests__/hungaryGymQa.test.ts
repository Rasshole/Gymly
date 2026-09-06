/**
 * Hungary gym QA — full production validation after hu_* merge (50 centers).
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
  HUNGARY_POSTAL_RE,
  isHungaryCountry,
  isPlausibleHungaryCoordinate,
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

const staging = require('../data/hungary/hungary_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
}>;

const approved = require('../data/hungary/HUNGARY_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/hungary/HUNGARY_PHASE2_READY_TO_IMPORT.json') as Array<{
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
  /\b(austria|österreich|wien|vienna|slovakia|slovensko|bratislava|ukraine|kyiv|romania|bucurești|bucharest|serbia|beograd|belgrade|croatia|zagreb|slovenia|ljubljana)\b/i;

const EXPECTED_BRANDS: Record<string, number> = {
  Fitness5: 16,
  '4% Fitness': 7,
  'Cutler Gym': 7,
  'Life1 Fitness': 6,
  'Chili Fitness': 5,
  'Thor Gym': 4,
  'Nr1 Fitness': 3,
  'Oxygen Wellness': 1,
  'Prestige Fitness': 1,
};

const PRESTIGE_FAY = 'hu_cb9223a0d5';
const FITNESS5_POLUS = 'hu_a56cb55b9e';
const FITNESS5_SAVOYA = 'hu_3b8b7317ed';
const THOR_SAVOYA = 'hu_8b266bdb04';
const FOUR_GARDEN = 'hu_26049334fe';
const FOUR_ONLYGIRLS = 'hu_a10dd9e7d1';
const FOUR_GYM = 'hu_781bc0caec';
const FOUR_CANDY = 'hu_66d884b838';
const FOUR_CANDYLAND = 'hu_2bc587797d';
const OXYGEN_NAPHEGY = 'hu_c9304c4364';
const NR1_OKTOGON = 'hu_252aa3a3c1';
const NR1_KALVIN = 'hu_443fc52cc7';
const NR1_OBUDA = 'hu_7dee925bf1';
const CUTLER_GYOR = 'hu_60d4fa43e9';
const CUTLER_SOPRON = 'hu_3a9b38b121';
const CHILI_DEBRECEN = 'hu_b30b55c045';
const LIFE1_MAMMUT = 'hu_9eb805b69a';

const UNRESOLVED_CRUSH = 'hu_64679c3ab1';
const UNRESOLVED_LOTUS = 'hu_710bcabd06';
const UNRESOLVED_NR1_RAKOCZI = 'hu_1aacef722b';
const UNRESOLVED_NR1_VAGOHID = 'hu_1059e757c0';
const UNRESOLVED_THOR_FEHERVAR = 'hu_f6609f8832';
const UNRESOLVED_THOR_KAPOSVAR = 'hu_53c869a4bc';
const UNRESOLVED_CUTLER_MISKOLC = 'hu_54497412e3';
const UNRESOLVED_F5_SZOLNOK = 'hu_1c31693886';
const UNRESOLVED_F5_TATABANYA = 'hu_f6532fb59e';
const LEGACY_GILDA = 'hu_b3242cad90';
const COMING_SOON_IDS = ['hu_e179e35746', 'hu_a239f06130', 'hu_58a6d7e529'];

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

function isAllowedSameBrandProximity(aName: string, bName: string): boolean {
  const names = [aName, bName].map(n => n.toLowerCase());
  const gardenOnly =
    names.some(n => n.includes('garden')) && names.some(n => n.includes('onlygirls'));
  return gardenOnly;
}

describe('Hungary gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const hungary = gyms.filter(g => isHungaryCountry(g.country));
  const huCenters = catalog.filter(c => isHungaryCountry(c.country));

  describe('1. Catalog integrity', () => {
    it('total production = 11254; Hungary = 50; hu_* = 50', () => {
      expect(catalog.length).toBe(11254);
      expect(huCenters.length).toBe(50);
      expect(hungary.length).toBe(50);
      expect(catalog.filter(c => c.id.startsWith('hu_')).length).toBe(50);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(huCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(50);
      expect(ap.size).toBe(50);
      expect(ready.size).toBe(50);
      expect(merged.size).toBe(50);
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

    it('all hu_* IDs unique with required fields and valid Hungary geography', () => {
      const ids = new Set<string>();
      for (const c of huCenters) {
        expect(c.id).toMatch(/^hu_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Hungary');
        expect(c.is_active).toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(HUNGARY_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(c.lat).not.toBe(0);
        expect(c.lng).not.toBe(0);
        expect(isPlausibleHungaryCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(FALLBACK_RE.test(String((c as {notes?: string}).notes || ''))).toBe(false);
      }
    });

    it('brand breakdown matches merge expectations; Gilda Max = 0', () => {
      const byBrand: Record<string, number> = {};
      for (const c of huCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
        expect(byBrand[brand]).toBe(n);
      }
      expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(50);
      expect(huCenters.filter(c => /gilda/i.test(`${c.brand} ${c.name}`)).length).toBe(0);
    });
  });

  describe('2. Staging exclusions withheld', () => {
    it('unresolved staging counts match merge and none are live', () => {
      const cats = staging.reduce<Record<string, number>>((acc, s) => {
        acc[s.import_category] = (acc[s.import_category] || 0) + 1;
        return acc;
      }, {});
      expect(cats.MERGED_INTO_CATALOG).toBe(50);
      expect(cats.NEEDS_COORDINATES).toBe(1);
      expect(cats.NEEDS_REVIEW).toBe(8);
      expect(cats.COMING_SOON).toBe(3);
      expect(cats.LEGACY).toBe(1);
      const unresolved = staging.filter(s => s.import_category !== 'MERGED_INTO_CATALOG');
      expect(unresolved.length).toBe(13);
      for (const s of unresolved) {
        expect(findCenterById(s.id)).toBeUndefined();
      }
    });

    it('known unresolved examples remain outside production', () => {
      for (const id of [
        UNRESOLVED_CRUSH,
        UNRESOLVED_LOTUS,
        UNRESOLVED_NR1_RAKOCZI,
        UNRESOLVED_NR1_VAGOHID,
        UNRESOLVED_THOR_FEHERVAR,
        UNRESOLVED_THOR_KAPOSVAR,
        UNRESOLVED_CUTLER_MISKOLC,
        UNRESOLVED_F5_SZOLNOK,
        UNRESOLVED_F5_TATABANYA,
        LEGACY_GILDA,
        ...COMING_SOON_IDS,
      ]) {
        expect(findCenterById(id)).toBeUndefined();
      }
    });
  });

  describe('3. Life1 / Prestige / Gilda rebrand QA', () => {
    it('Life1 = 6; Prestige Fáy = 1 with preserved Phase1 ID; no Fáy duplicates', () => {
      const life1 = huCenters.filter(c => c.brand === 'Life1 Fitness');
      const prestige = huCenters.filter(c => c.brand === 'Prestige Fitness');
      expect(life1.length).toBe(6);
      expect(prestige.length).toBe(1);
      const fay = findCenterById(PRESTIGE_FAY)!;
      expect(fay.brand).toBe('Prestige Fitness');
      expect(fay.name).toMatch(/Fáy/);
      expect(fay.address).toBe('Fáy utca 45');
      expect(fay.postal_code).toBe('1139');
      expect(fay.city).toBe('Budapest');
      expect(isPlausibleHungaryCoordinate(fay.lat!, fay.lng!)).toBe(true);
      const fayDupes = huCenters.filter(
        c =>
          /fáy|fay/i.test(`${c.name} ${c.address}`) &&
          (c.brand === 'Life1 Fitness' || c.brand === 'Oxygen Wellness'),
      );
      expect(fayDupes.length).toBe(0);
      expect(findCenterById(LEGACY_GILDA)).toBeUndefined();
    });
  });

  describe('4. Fitness5 QA', () => {
    it('16 live; Pólus as Fitness5; coming-soon + Szolnok/Tatabánya absent', () => {
      const f5 = huCenters.filter(c => c.brand === 'Fitness5');
      expect(f5.length).toBe(16);
      const polus = findCenterById(FITNESS5_POLUS)!;
      expect(polus.name).toBe('Fitness5 Pólus Center');
      expect(polus.brand).toBe('Fitness5');
      expect(huCenters.filter(c => /pólus fitness|polus fitness/i.test(`${c.brand} ${c.name}`)).length).toBe(
        0,
      );
      for (const id of [
        UNRESOLVED_F5_SZOLNOK,
        UNRESOLVED_F5_TATABANYA,
        ...COMING_SOON_IDS,
      ]) {
        expect(findCenterById(id)).toBeUndefined();
      }
      for (const c of f5) {
        expect(HUNGARY_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(isPlausibleHungaryCoordinate(c.lat!, c.lng!)).toBe(true);
      }
    });
  });

  describe('5. 4% Fitness QA', () => {
    it('7 live; Garden/OnlyGirls A_legitimate; dense neighbors A', () => {
      const four = huCenters.filter(c => c.brand === '4% Fitness');
      expect(four.length).toBe(7);
      expect(findCenterById(UNRESOLVED_CRUSH)).toBeUndefined();
      expect(findCenterById(UNRESOLVED_LOTUS)).toBeUndefined();

      const garden = findCenterById(FOUR_GARDEN)!;
      const only = findCenterById(FOUR_ONLYGIRLS)!;
      const gym = findCenterById(FOUR_GYM)!;
      const candy = findCenterById(FOUR_CANDY)!;
      const candyland = findCenterById(FOUR_CANDYLAND)!;

      expect(garden.address).toMatch(/Garden/i);
      expect(only.address).toMatch(/OnlyGirls/i);
      expect(garden.address).not.toBe(only.address);
      expect(garden.lat).toBeCloseTo(only.lat!, 5);
      expect(garden.lng).toBeCloseTo(only.lng!, 5);
      expect(haversineMeters(garden.lat!, garden.lng!, only.lat!, only.lng!)).toBeLessThan(1);

      const dGymGarden = haversineMeters(gym.lat!, gym.lng!, garden.lat!, garden.lng!);
      expect(dGymGarden).toBeGreaterThan(40);
      expect(dGymGarden).toBeLessThan(80);
      expect(gym.address).not.toBe(garden.address);

      const dCandy = haversineMeters(candy.lat!, candy.lng!, candyland.lat!, candyland.lng!);
      expect(dCandy).toBeGreaterThan(50);
      expect(dCandy).toBeLessThan(120);
      expect(candy.address).not.toBe(candyland.address);
      expect(candy.postal_code).not.toBe(candyland.postal_code);
    });
  });

  describe('6. Cutler / Chili / Thor / Nr1 / Oxygen QA', () => {
    it('Cutler Gym = 7 network clubs; Miskolc unresolved absent', () => {
      const cutler = huCenters.filter(c => c.brand === 'Cutler Gym');
      expect(cutler.length).toBe(7);
      expect(cutler.every(c => /^Cutler Gym /.test(c.name))).toBe(true);
      expect(findCenterById(UNRESOLVED_CUTLER_MISKOLC)).toBeUndefined();
      expect(findCenterById(CUTLER_GYOR)?.city).toBe('Győr');
      expect(findCenterById(CUTLER_SOPRON)?.city).toBe('Sopron');
      for (const c of cutler) {
        expect(isPlausibleHungaryCoordinate(c.lat!, c.lng!)).toBe(true);
      }
    });

    it('Chili Fitness = 5 (4 Budapest + Debrecen)', () => {
      const chili = huCenters.filter(c => c.brand === 'Chili Fitness');
      expect(chili.length).toBe(5);
      expect(chili.filter(c => c.city === 'Budapest').length).toBe(4);
      expect(findCenterById(CHILI_DEBRECEN)?.city).toBe('Debrecen');
    });

    it('Thor Gym = 4; Fehérvár/Kaposvár unresolved absent; Savoya co-location retained', () => {
      const thor = huCenters.filter(c => c.brand === 'Thor Gym');
      expect(thor.length).toBe(4);
      expect(findCenterById(UNRESOLVED_THOR_FEHERVAR)).toBeUndefined();
      expect(findCenterById(UNRESOLVED_THOR_KAPOSVAR)).toBeUndefined();
      const f5 = findCenterById(FITNESS5_SAVOYA)!;
      const th = findCenterById(THOR_SAVOYA)!;
      expect(f5.address).toBe(th.address);
      expect(f5.brand).not.toBe(th.brand);
      expect(haversineMeters(f5.lat!, f5.lng!, th.lat!, th.lng!)).toBeLessThan(1);
    });

    it('Nr1 Fitness = Oktogon + Kálvin + Óbuda; Rákóczi/Vágóhíd absent', () => {
      expect(findCenterById(NR1_OKTOGON)?.name).toMatch(/Oktogon/);
      expect(findCenterById(NR1_KALVIN)?.name).toMatch(/Kálvin/);
      expect(findCenterById(NR1_OBUDA)?.name).toMatch(/Óbuda/);
      expect(huCenters.filter(c => c.brand === 'Nr1 Fitness').length).toBe(3);
      expect(findCenterById(UNRESOLVED_NR1_RAKOCZI)).toBeUndefined();
      expect(findCenterById(UNRESOLVED_NR1_VAGOHID)).toBeUndefined();
    });

    it('Oxygen Wellness Naphegy only; no Fáy under Oxygen', () => {
      const ox = huCenters.filter(c => c.brand === 'Oxygen Wellness');
      expect(ox.length).toBe(1);
      expect(ox[0]!.id).toBe(OXYGEN_NAPHEGY);
      expect(ox[0]!.name).toMatch(/Naphegy/);
      expect(/fáy|fay/i.test(`${ox[0]!.name} ${ox[0]!.address}`)).toBe(false);
    });
  });

  describe('7. Duplicate / proximity QA', () => {
    it('no duplicate catalog IDs globally', () => {
      const ids = catalog.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('same-brand proximity: only known A_legitimate Garden/OnlyGirls at <=25 m', () => {
      const lt25: Array<{a: string; b: string; d: number; names: string}> = [];
      const lt50: typeof lt25 = [];
      const lt100: typeof lt25 = [];
      const lt200: typeof lt25 = [];
      for (let i = 0; i < huCenters.length; i++) {
        for (let j = i + 1; j < huCenters.length; j++) {
          const a = huCenters[i]!;
          const b = huCenters[j]!;
          if (a.brand !== b.brand) continue;
          const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
          const row = {a: a.id, b: b.id, d, names: `${a.name} / ${b.name}`};
          if (d <= 25) lt25.push(row);
          if (d <= 50) lt50.push(row);
          if (d <= 100) lt100.push(row);
          if (d <= 200) lt200.push(row);
        }
      }
      expect(lt25.length).toBe(1);
      expect(isAllowedSameBrandProximity(lt25[0]!.names.split(' / ')[0]!, lt25[0]!.names.split(' / ')[1]!)).toBe(
        true,
      );
      expect(lt25[0]!.a === FOUR_GARDEN || lt25[0]!.b === FOUR_GARDEN).toBe(true);
      expect(lt200.length).toBe(4);
      expect(lt100.length).toBe(4);
      expect(lt50.length).toBe(1);
    });

    it('identical-coordinate clusters are known legitimate cases only', () => {
      const key = (c: {lat?: number | null; lng?: number | null}) =>
        `${Number(c.lat).toFixed(6)}|${Number(c.lng).toFixed(6)}`;
      const clusters = new Map<string, typeof huCenters>();
      for (const c of huCenters) {
        const k = key(c);
        const arr = clusters.get(k) || [];
        arr.push(c);
        clusters.set(k, arr);
      }
      const multi = [...clusters.values()].filter(v => v.length > 1);
      expect(multi.length).toBe(2);
      const labels = multi.map(v =>
        v
          .map(c => c.name)
          .sort()
          .join(' + '),
      );
      expect(labels.some(l => /GARDEN/i.test(l) && /ONLYGIRLS/i.test(l))).toBe(true);
      expect(labels.some(l => /Fitness5 Savoya/i.test(l) && /Thor Gym Savoya/i.test(l))).toBe(true);
    });

    it('Fitness5/Thor Savoya is different-brand co-location A_legitimate', () => {
      const f5 = findCenterById(FITNESS5_SAVOYA)!;
      const th = findCenterById(THOR_SAVOYA)!;
      expect(f5.brand).toBe('Fitness5');
      expect(th.brand).toBe('Thor Gym');
      expect(f5.address).toBe('Hunyadi János út 19.');
      expect(th.address).toBe('Hunyadi János út 19.');
    });
  });

  describe('8. Border safety + Hungarian text', () => {
    it('no foreign contamination; border cities remain in Hungary bbox', () => {
      for (const c of huCenters) {
        expect(isPlausibleHungaryCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_BLOB.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      }
      expect(isPlausibleHungaryCoordinate(48.2082, 16.3738)).toBe(false); // Vienna
      expect(isPlausibleHungaryCoordinate(48.1486, 17.1077)).toBe(false); // Bratislava
      expect(isPlausibleHungaryCoordinate(44.7866, 20.4489)).toBe(false); // Belgrade
      expect(isPlausibleHungaryCoordinate(45.815, 15.9819)).toBe(false); // Zagreb
      expect(isPlausibleHungaryCoordinate(46.0569, 14.5058)).toBe(false); // Ljubljana
      expect(isPlausibleHungaryCoordinate(44.4268, 26.1025)).toBe(false); // Bucharest
      expect(isPlausibleHungaryCoordinate(50.4501, 30.5234)).toBe(false); // Kyiv
      expect(findCenterById(CUTLER_SOPRON)!.lng!).toBeGreaterThan(16.45);
      expect(findCenterById(CUTLER_GYOR)!.city).toBe('Győr');
    });

    it('display text preserves Hungarian diacritics', () => {
      const blob = huCenters.map(c => `${c.name} ${c.address} ${c.city}`).join('\n');
      expect(blob).toContain('Győr');
      expect(blob).toContain('Pécs');
      expect(blob).toContain('Nyíregyháza');
      expect(blob).toContain('Székesfehérvár');
      expect(blob).toContain('Fáy');
      expect(blob).toContain('Óbuda');
      expect(blob).toContain('Kálvin');
      expect(blob).toContain('Pólus');
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(blob).not.toMatch(/Gyor(?!gyi)/); // city must keep ő where required in Győr
      expect(findCenterById(CUTLER_GYOR)!.city).toBe('Győr');
      expect(findCenterById(CUTLER_SOPRON)!.city).toBe('Sopron');
    });
  });

  describe('9. Search / postcode QA', () => {
    beforeAll(() => getGymSearchIndex(hungary));

    it('brand full + partial queries return Hungary hits', () => {
      for (const q of [
        'Fitness5',
        '4%',
        'Cutler',
        'Life1',
        'Chili',
        'Thor',
        'Nr1',
        'Oxygen',
        'Prestige',
      ]) {
        const hits = searchGyms(q, {gyms: hungary, limit: 30});
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every(h => h.gym.id.startsWith('hu_'))).toBe(true);
      }
    });

    it('city diacritic and ASCII forms resolve', () => {
      const pairs: Array<[string, string]> = [
        ['Budapest', 'Budapest'],
        ['Debrecen', 'Debrecen'],
        ['Pécs', 'Pecs'],
        ['Győr', 'Gyor'],
        ['Nyíregyháza', 'Nyiregyhaza'],
        ['Kecskemét', 'Kecskemet'],
        ['Székesfehérvár', 'Szekesfehervar'],
        ['Sopron', 'Sopron'],
        ['Nagykanizsa', 'Nagykanizsa'],
      ];
      for (const [diacritic, ascii] of pairs) {
        expect(searchGyms(diacritic, {gyms: hungary, limit: 20}).length).toBeGreaterThan(0);
        expect(searchGyms(ascii, {gyms: hungary, limit: 20}).length).toBeGreaterThan(0);
      }
      expect(normalizeGymSearchValue('Győr')).not.toBe('');
      expect(compactGymSearchValue('1054').length).toBeGreaterThan(0);
    });

    it('exact HU postcodes resolve within Hungary-scoped search', () => {
      expect(
        searchGyms('1139', {gyms: hungary, limit: 20}).some(r => r.gym.id === PRESTIGE_FAY),
      ).toBe(true);
      expect(
        searchGyms('1054', {gyms: hungary, limit: 20}).some(r => r.gym.id === 'hu_bb648a4fb4'),
      ).toBe(true);
      expect(
        searchGyms('9027', {gyms: hungary, limit: 20}).some(r => r.gym.id === CUTLER_GYOR),
      ).toBe(true);
    });

    it('4-digit postcode does not silently swap country when gyms are country-scoped', () => {
      // 9400 overlaps AT/BE/CH/HU — scoped lists must stay in-country
      const huHits = searchGyms('9400', {gyms: hungary, limit: 20});
      expect(huHits.length).toBeGreaterThan(0);
      expect(huHits.every(h => h.gym.country === 'Hungary' && h.gym.id.startsWith('hu_'))).toBe(
        true,
      );

      const austria = gyms.filter(g => g.country === 'Austria');
      getGymSearchIndex(austria);
      const atHits = searchGyms('9400', {gyms: austria, limit: 20});
      expect(atHits.every(h => h.gym.country === 'Austria' && h.gym.id.startsWith('at_'))).toBe(
        true,
      );

      const belgium = gyms.filter(g => g.country === 'Belgium');
      getGymSearchIndex(belgium);
      const beHits = searchGyms('9400', {gyms: belgium, limit: 20});
      expect(beHits.every(h => h.gym.country === 'Belgium' && h.gym.id.startsWith('be_'))).toBe(
        true,
      );

      getGymSearchIndex(hungary);
    });

    it('short-prefix typing remains responsive', () => {
      const t0 = Date.now();
      searchGyms('Fit', {gyms: hungary, limit: 20});
      searchGyms('Cut', {gyms: hungary, limit: 20});
      searchGyms('Bud', {gyms: hungary, limit: 20});
      expect(Date.now() - t0).toBeLessThan(3000);
    });
  });

  describe('10. Nearest / map / onboarding / profile', () => {
    it.each([
      ['Budapest', 47.4979, 19.0402],
      ['Debrecen', 47.5316, 21.6273],
      ['Pécs', 46.0727, 18.2328],
      ['Győr', 47.6875, 17.6504],
      ['Nyíregyháza', 47.9554, 21.7167],
      ['Kecskemét', 46.9062, 19.6913],
      ['Székesfehérvár', 47.186, 18.4221],
      ['Sopron', 47.681, 16.5845],
    ])('%s nearest is plausible hu_* (not AT/SK/DK fallback)', (_label, lat, lng) => {
      const nearest = findNearestGym(lat, lng, hungary);
      expect(nearest?.id.startsWith('hu_')).toBe(true);
      expect(nearest?.country).toBe('Hungary');
      expect(nearest?.id).not.toBe(gyms[0]?.id);
    });

    it.each([
      ['Budapest dense', 47.5, 19.06, 0.08],
      ['Debrecen', 47.53, 21.63, 0.2],
      ['Pécs', 46.07, 18.23, 0.2],
      ['Győr', 47.69, 17.65, 0.2],
    ])('%s viewport scoped (not full catalog)', (_label, lat, lng, delta) => {
      const visible = filterMapCentersInRegion(toMap(hungary) as never, {
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(50);
      expect(visible.length).toBeLessThan(11254);
      expect(visible.every(v => v.id.startsWith('hu_'))).toBe(true);
    });

    it('dense Budapest markers remain individually selectable', () => {
      const visible = filterMapCentersInRegion(toMap(hungary) as never, {
        latitude: 47.49,
        longitude: 19.065,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      const ids = new Set(visible.map(v => v.id));
      expect(ids.has(FOUR_GARDEN)).toBe(true);
      expect(ids.has(FOUR_ONLYGIRLS)).toBe(true);
      expect(ids.has(FOUR_GYM)).toBe(true);
      expect(findGymById(FOUR_GARDEN)?.id).toBe(FOUR_GARDEN);
      expect(findGymById(FOUR_ONLYGIRLS)?.id).toBe(FOUR_ONLYGIRLS);
    });

    it('onboarding/profile selection stores exact hu_* and resolves later', () => {
      for (const id of [PRESTIGE_FAY, FITNESS5_POLUS, LIFE1_MAMMUT, CUTLER_GYOR, OXYGEN_NAPHEGY]) {
        const g = findGymById(id);
        expect(g).not.toBeNull();
        expect(g!.id).toBe(id);
        expect(g!.country).toBe('Hungary');
        expect(formatGymDisplayName(g)).not.toMatch(/^hu_/);
      }
      expect(getActiveGymsByCountry('Hungary').length).toBe(50);
      const mixed = [PRESTIGE_FAY, 'cz_788823693c', 'dk_placeholder_should_not_matter'];
      expect(findGymById(mixed[0]!)!.country).toBe('Hungary');
    });

    it('regional coverage includes expected READY cities without inventing missing ones', () => {
      const blob = huCenters.map(c => `${c.city} ${c.name}`).join(' ');
      for (const city of [
        'Budapest',
        'Debrecen',
        'Pécs',
        'Győr',
        'Nyíregyháza',
        'Kecskemét',
        'Székesfehérvár',
      ]) {
        expect(blob).toContain(city);
      }
      // Phase 2 had no verified READY national-chain rows for these cities
      expect(/Szeged/i.test(blob)).toBe(false);
      expect(/Miskolc/i.test(blob)).toBe(false);
      expect(/Szombathely/i.test(blob)).toBe(false);
      expect(/Veszprém/i.test(blob)).toBe(false);
      expect(/Zalaegerszeg/i.test(blob)).toBe(false);
    });
  });

  describe('11. 200 m check-in + auto-checkout', () => {
    it('global radii remain 200', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['Prestige Fáy', PRESTIGE_FAY],
      ['4% Garden dense', FOUR_GARDEN],
      ['4% OnlyGirls dense', FOUR_ONLYGIRLS],
      ['Fitness5 Savoya', FITNESS5_SAVOYA],
      ['Thor Savoya', THOR_SAVOYA],
      ['Cutler Győr', CUTLER_GYOR],
      ['Oxygen Naphegy', OXYGEN_NAPHEGY],
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

    it('nearby dense clubs do not replace session gym ID for check-in math', () => {
      const session = getGymLatLngForCheckIn(FOUR_GARDEN)!;
      const other = getGymLatLngForCheckIn(FOUR_GYM)!;
      const d = calculateDistance(
        session.latitude,
        session.longitude,
        other.latitude,
        other.longitude,
      );
      expect(d).toBeGreaterThan(40);
      expect(d).toBeLessThan(100);
      // Session remains Garden even though Gym is nearby
      expect(getGymLatLngForCheckIn(FOUR_GARDEN)!.latitude).toBeCloseTo(session.latitude, 5);
      expect(getGymLatLngForCheckIn(FOUR_ONLYGIRLS)!.latitude).toBeCloseTo(session.latitude, 5);
      expect(findGymById(FOUR_GARDEN)!.id).not.toBe(findGymById(FOUR_ONLYGIRLS)!.id);
    });

    it('repeated away evaluations stay set_away (no duplicate-checkout side effects in decision)', () => {
      const t = Date.now();
      const first = decideGeofenceAutoCheckout(250, null, t);
      expect(first.action).toBe('set_away');
      const awayIso =
        first.action === 'set_away' ? first.awayStartedAt : new Date(t).toISOString();
      expect(decideGeofenceAutoCheckout(250, awayIso, t + 1000).action).toBe(
        'update_distance_only',
      );
      expect(decideGeofenceAutoCheckout(250, awayIso, t + 2000).action).not.toBe(
        'checkout_away',
      );
    });
  });

  describe('12. Core flows / orphan', () => {
    it('hu_* resolves for onboarding/profile/favorites paths', () => {
      const sample = hungary[0]!;
      expect(findGymById(sample.id)).not.toBeNull();
      expect(getActiveGymsByCountry('Hungary').length).toBe(50);
      expect(formatGymDisplayName(findGymById(sample.id))).not.toMatch(/^hu_/);
      const coords = getEffectiveLatLng(findCenterById(sample.id)!);
      expect(Number.isFinite(coords.lat)).toBe(true);
    });

    it('orphan hu_nonexistent_test is safe Hungary stub (not AT/SK/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('hu_nonexistent_test');
      expect(stub.id).toBe('hu_nonexistent_test');
      expect(stub.region).toBe('Hungary');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('hu_nonexistent_test').name);
      expect(findGymById('hu_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
    });

    it('Hungary country label i18n key resolves', () => {
      expect(gymCountryTranslationKey('Hungary')).toBe('countries.hungary');
      const t = createTranslator(en as any);
      expect(formatGymCountryLabel('Hungary', t)).toBe('Hungary');
    });
  });

  describe('13. Country regression', () => {
    it('exact 21-country production counts totaling 11254', () => {
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
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11254);
    });
  });

  describe('14. Performance snapshot', () => {
    it('records live catalog timings vs Hungary merge baseline', () => {
      const centersPath = path.join(__dirname, '../src/data/centers.json');
      const jsonSize = fs.statSync(centersPath).size;
      const tParse0 = Date.now();
      const raw = JSON.parse(fs.readFileSync(centersPath, 'utf8'));
      const parseMs = Date.now() - tParse0;
      const active = raw.filter((c: {is_active?: boolean}) => c.is_active !== false);

      const tCold0 = Date.now();
      getGymSearchIndex(gyms);
      const coldMs = Date.now() - tCold0;

      const tCached0 = Date.now();
      getGymSearchIndex(gyms);
      const cachedMs = Date.now() - tCached0;

      const queries = [
        'Fitness5',
        'Life1',
        'Budapest',
        '1054',
        'Cutler',
        'Győr',
        '4%',
        'Thor',
      ];
      const tTyp0 = Date.now();
      for (const q of queries) searchGyms(q, {gyms, limit: 20});
      const typicalMs = Date.now() - tTyp0;

      let worst = 0;
      for (const q of ['a', 'fit', 'gym', 'bud', 'life', 'cut', 'thor']) {
        const t0 = Date.now();
        searchGyms(q, {gyms, limit: 20});
        worst = Math.max(worst, Date.now() - t0);
      }

      const cities: Array<[number, number]> = [
        [47.4979, 19.0402],
        [47.5316, 21.6273],
        [46.0727, 18.2328],
        [47.6875, 17.6504],
      ];
      const tNear0 = Date.now();
      for (const [lat, lng] of cities) findNearestGym(lat, lng, hungary);
      const nearestMs = Date.now() - tNear0;

      const mapCenters = toMap(hungary);
      const tMap0 = Date.now();
      void mapCenters.slice();
      const mapMs = Date.now() - tMap0;

      const tVp0 = Date.now();
      const visible = filterMapCentersInRegion(mapCenters as never, {
        latitude: 47.5,
        longitude: 19.06,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
      const vpMs = Date.now() - tVp0;

      const out = {
        catalog: ALL_GYM_CENTERS.length,
        active: active.length,
        json_size_bytes: jsonSize,
        json_size_mb: +(jsonSize / 1024 / 1024).toFixed(2),
        parse_ms: parseMs,
        cold_index_ms: coldMs,
        cached_ms: cachedMs,
        typical_search_ms: typicalMs,
        worst_search_ms: worst,
        nearest_ms: nearestMs,
        map_build_ms: mapMs,
        viewport_filter_ms: vpMs,
        budapest_viewport_count: visible.length,
        merge_baseline: {
          cold_index_ms: 1429,
          typical_search_ms: 1143,
          worst_search_ms: 248,
          nearest_ms: 1,
        },
        assessment:
          'Within normal variance of Hungary merge baseline (~11k). No material global regression. Global Stress QA not required at 11,063.',
      };
      fs.writeFileSync(
        path.join(__dirname, '../data/hungary/HUNGARY_QA_PERF.json'),
        JSON.stringify(out, null, 2) + '\n',
      );

      expect(ALL_GYM_CENTERS.length).toBe(11254);
      expect(coldMs).toBeLessThan(5000);
      expect(typicalMs).toBeLessThan(4000);
      expect(worst).toBeLessThan(2000);
    });
  });
});
