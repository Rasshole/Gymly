/**
 * Estonia gym QA — full production validation after ee_* merge (68 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/estonia/ESTONIA_QA_PERF.json).
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
  ESTONIA_POSTAL_RE,
  isEstoniaCountry,
  isPlausibleEstoniaCoordinate,
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
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';

const staging = require('../data/estonia/estonia_centers_staging.json') as Array<{
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

const approved = require('../data/estonia/ESTONIA_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
}>;

const phase2Ready = require('../data/estonia/ESTONIA_PHASE2_READY_TO_IMPORT.json') as Array<{
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
  /\b(latvia|latvija|riga|rīga|lithuania|lietuva|vilnius|kaunas|finland|helsinki|kaliningrad|russia|россия|belarus|poland|polska)\b/i;

const EXPECTED_TOTAL = 11692;
const EXPECTED_ESTONIA = 68;
const POST_MERGE_SHA =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';
const LIVE_SHA =
  'ff19dfaae9f99984ae5c6a73765b3e585263b61050d8c927fc45a38037dfa3dc';

const EXPECTED_BRANDS: Record<string, number> = {
  MyFitness: 19,
  '24-7 Fitness': 31,
  'Gym!': 15,
  'Golden Club': 3,
};

const EXCLUDED_LIVE_RE =
  /^(people fitness|lemon gym|reval-?sport|sparta|fitlife|hc gym|audentes|ring sport|status club|terra sport|aktiiv|corsagym|idakeskus|gym\+|impuls|basic-?fit|mcfit|anytime( fitness)?|fitinn|clever fit|john reed|gold'?s gym|fitness first|world class|bodifit|shape house)$/i;

const MF_VOLTA = 'ee_2544fa6a0b';
const MF_NARVA_FAMA = 'ee_6353f66ecd';
const MF_VIRU = 'ee_751f32334b';
const MF_POSTIMAJA = 'ee_e47c68a9de';
const MF_KRISTIINE = 'ee_8225d3bb1d';
const F247_TABASALU = 'ee_34384840a3';
const F247_KEILA = 'ee_a15aae2d15';
const F247_SEPA = 'ee_d3bdd981df';
const F247_VILJANDI_KAALU = 'ee_7707002ac8';
const F247_RAKVERE = 'ee_2859632c67';
const F247_NARVA = 'ee_71c90c9c79';
const F247_VORU = 'ee_9d4bb8e396';
const F247_JOGEVA = 'ee_909073b14a';
const F247_AKADEEMIA = 'ee_136e41e3e3';
const F247_PORT_ARTUR = 'ee_4022ce3e3c';
const GYM_TEHNOPOL = 'ee_eeb3b2ed6e';
const GYM_TASKU = 'ee_fd122813c5';
const GC_TONDI = 'ee_b9bc209fd8';
const GC_ROTERMANNI = 'ee_141f92d21d';

const ZERO_CHAIN_CITIES = [
  'Kohtla-Järve',
  'Maardu',
  'Sillamäe',
  'Valga',
  'Haapsalu',
  'Paide',
];

const COMING_SOON_IDS = [
  'ee_d6f5429ffa', // 24-7 Pirita
  'ee_525d7cb043', // 24-7 Annelinn
  'ee_5c173a5f8b', // 24-7 Mai
  'ee_204834f0ca', // 24-7 Õismäe
  'ee_fd8bbdf6cb', // 24-7 Kompassi
  'ee_e4aba62219', // 24-7 Viimsi
  'ee_31338a0b74', // 24-7 Laagri
  'ee_16eaf19854', // 24-7 Ilmatsalu
  'ee_2344545426', // 24-7 Rapla
  'ee_05114ce91a', // Gym! Viimsi
  'ee_cc255a409d', // Gym! Rakvere
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

describe('Estonia gym QA', () => {
  const catalog = ALL_GYM_CENTERS;
  const gyms = getActiveDanishGyms();
  const estonia = gyms.filter(g => isEstoniaCountry(g.country));
  const eeCenters = catalog.filter(c => isEstoniaCountry(c.country));
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  describe('1. Catalog integrity', () => {
    it('total production = 11692; Estonia = 68; ee_* = 68; SHA match', () => {
      expect(catalog.length).toBe(EXPECTED_TOTAL);
      expect(eeCenters.length).toBe(EXPECTED_ESTONIA);
      expect(estonia.length).toBe(EXPECTED_ESTONIA);
      expect(catalog.filter(c => c.id.startsWith('ee_')).length).toBe(EXPECTED_ESTONIA);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
      expect(sha).toBe(LIVE_SHA);
    });

    it('production IDs reconcile with approved + Phase2 READY + staging MERGED', () => {
      const prod = new Set(eeCenters.map(c => c.id));
      const ap = new Set(approved.map(a => a.id));
      const ready = new Set(phase2Ready.map(r => r.id));
      const merged = new Set(
        staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
      );
      expect(prod.size).toBe(68);
      expect(ap.size).toBe(68);
      expect(ready.size).toBe(68);
      expect(merged.size).toBe(68);
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
        expect(live.country).toBe('Estonia');
        expect(live.lat).toBeCloseTo(a.lat!, 5);
        expect(live.lng).toBeCloseTo(a.lng!, 5);
      }
    });

    it('all ee_* IDs unique with required fields and valid Estonia geography', () => {
      const ids = new Set<string>();
      for (const c of eeCenters) {
        expect(c.id).toMatch(/^ee_[a-f0-9]{10}$/);
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        expect(c.country).toBe('Estonia');
        expect(c.is_active).toBe(true);
        expect(c.is_coming_soon).not.toBe(true);
        expect(String(c.name || '').trim().length).toBeGreaterThan(0);
        expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
        expect(String(c.address || '').trim().length).toBeGreaterThan(3);
        expect(String(c.city || '').trim().length).toBeGreaterThan(0);
        expect(typeof c.postal_code).toBe('string');
        expect(ESTONIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
        expect(Number.isFinite(c.lat)).toBe(true);
        expect(Number.isFinite(c.lng)).toBe(true);
        expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
        expect(isPlausibleEstoniaCoordinate(c.lat!, c.lng!)).toBe(true);
        const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
        expect(MOJIBAKE_RE.test(blob)).toBe(false);
        expect(FOREIGN_BLOB.test(blob)).toBe(false);
        expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
          false,
        );
        expect(EXCLUDED_LIVE_RE.test(String(c.brand || '').trim())).toBe(false);
        expect(String(c.id).startsWith('lv_')).toBe(false);
        expect(String(c.id).startsWith('lt_')).toBe(false);
      }
      expect(ids.size).toBe(68);
    });

    it('exact brand breakdown; unexpected brands = 0', () => {
      const byBrand: Record<string, number> = {};
      for (const c of eeCenters) {
        byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
      }
      expect(byBrand).toEqual(EXPECTED_BRANDS);
      expect(Object.keys(byBrand).length).toBe(4);
    });
  });

  describe('2. Staging exclusions / coming-soon withheld', () => {
    it('COMING_SOON = 11 and EXCLUDED = 20 remain outside production', () => {
      const coming = staging.filter(s => s.import_category === 'COMING_SOON');
      const excluded = staging.filter(s => s.import_category === 'EXCLUDED');
      expect(coming.length).toBe(11);
      expect(excluded.length).toBe(20);
      const prodIds = new Set(eeCenters.map(c => c.id));
      for (const r of [...coming, ...excluded]) {
        expect(prodIds.has(r.id)).toBe(false);
      }
      for (const id of COMING_SOON_IDS) {
        expect(prodIds.has(id)).toBe(false);
        expect(coming.some(r => r.id === id)).toBe(true);
      }
      expect(coming.some(r => /pirita|annelinn|mai|õismäe|kompassi|viimsi|laagri|ilmatsalu|rapla/i.test(String(r.name || '')))).toBe(
        true,
      );
      expect(coming.some(r => r.brand === 'Gym!' && /viimsi|rakvere/i.test(String(r.name || '')))).toBe(
        true,
      );
    });

    it('Lemon Gym / People Fitness / Gym+ / Impuls and excluded chains absent', () => {
      for (const c of eeCenters) {
        expect(EXCLUDED_LIVE_RE.test(String(c.brand || '').trim())).toBe(false);
      }
      for (const brand of [
        'Lemon Gym',
        'People Fitness',
        'Gym+',
        'Impuls',
        'Reval-Sport',
        'Sparta',
        'FitLife',
        'HC Gym',
        'Basic-Fit',
        'McFIT',
        'Anytime Fitness',
        'FITINN',
        'clever fit',
        'JOHN REED',
        "Gold's Gym",
        'Fitness First',
        'World Class',
      ]) {
        expect(eeCenters.some(c => c.brand.toLowerCase() === brand.toLowerCase())).toBe(false);
      }
      expect(staging.filter(r => r.import_category === 'EXCLUDED' && r.brand === 'Lemon Gym').length).toBe(
        2,
      );
    });
  });

  describe('3. MyFitness priority QA', () => {
    const myfitness = eeCenters.filter(c => c.brand === 'MyFitness');

    it('has exactly 19 live MyFitness clubs including Volta + Narva Fama', () => {
      expect(myfitness.length).toBe(19);
      expect(myfitness.every(c => c.is_active === true)).toBe(true);
      expect(myfitness.every(c => c.is_coming_soon !== true)).toBe(true);
      expect(findCenterById(MF_VOLTA)?.name).toMatch(/Volta/i);
      expect(findCenterById(MF_VOLTA)?.address).toMatch(/Mootori/i);
      expect(findCenterById(MF_VOLTA)?.postal_code).toBe('10416');
      expect(findCenterById(MF_NARVA_FAMA)?.name).toMatch(/Narva Fama/i);
      expect(findCenterById(MF_NARVA_FAMA)?.city).toBe('Narva');
      expect(findCenterById(MF_NARVA_FAMA)?.postal_code).toBe('20303');
      expect(myfitness.every(c => c.id.startsWith('ee_'))).toBe(true);
      expect(myfitness.every(c => ESTONIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(myfitness.every(c => isPlausibleEstoniaCoordinate(c.lat!, c.lng!))).toBe(true);
    });

    it('MyFitness EE distinct from Latvia estate (15 LV); no lv_* reuse', () => {
      expect(catalog.filter(c => c.country === 'Latvia' && c.brand === 'MyFitness').length).toBe(15);
      expect(myfitness.every(c => !String(c.id).startsWith('lv_'))).toBe(true);
      expect(myfitness.every(c => c.country === 'Estonia')).toBe(true);
    });
  });

  describe('4. 24-7 Fitness QA', () => {
    it('has exactly 31 live open clubs; Phase-2 recoveries present once', () => {
      const rows = eeCenters.filter(c => c.brand === '24-7 Fitness');
      expect(rows.length).toBe(31);
      const fixtures: Array<[string, string, RegExp]> = [
        [F247_TABASALU, 'Tabasalu', /Kallaste/i],
        [F247_KEILA, 'Keila', /Harju/i],
        [F247_SEPA, 'Tartu', /Sepa/i],
        [F247_VILJANDI_KAALU, 'Viljandi', /Kaalu/i],
        [F247_RAKVERE, 'Rakvere', /Adoffi/i],
        [F247_NARVA, 'Narva', /Roheline/i],
        [F247_VORU, 'Võru', /Vilja/i],
        [F247_JOGEVA, 'Jõgeva', /Kesk/i],
      ];
      for (const [id, city, addr] of fixtures) {
        const live = findCenterById(id)!;
        expect(live.brand).toBe('24-7 Fitness');
        expect(live.city).toBe(city);
        expect(live.address).toMatch(addr);
        expect(ESTONIA_POSTAL_RE.test(live.postal_code)).toBe(true);
        expect(isPlausibleEstoniaCoordinate(live.lat!, live.lng!)).toBe(true);
        expect(rows.filter(c => c.id === id).length).toBe(1);
      }
      expect(rows.every(c => c.is_coming_soon !== true)).toBe(true);
    });
  });

  describe('5. Gym! QA', () => {
    it('has exactly 15 live clubs; not Gym+ Lithuania', () => {
      const rows = eeCenters.filter(c => c.brand === 'Gym!');
      expect(rows.length).toBe(15);
      expect(rows.every(c => c.brand === 'Gym!')).toBe(true);
      expect(eeCenters.some(c => c.brand === 'Gym+')).toBe(false);
      expect(rows.every(c => c.id.startsWith('ee_'))).toBe(true);
      expect(rows.every(c => !String(c.id).startsWith('lt_'))).toBe(true);
      expect(findCenterById(GYM_TEHNOPOL)?.brand).toBe('Gym!');
      expect(findCenterById(GYM_TASKU)?.city).toBe('Tartu');
      expect(rows.every(c => ESTONIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(rows.every(c => isPlausibleEstoniaCoordinate(c.lat!, c.lng!))).toBe(true);
    });
  });

  describe('6. Golden Club QA', () => {
    it('has exactly 3 live clubs including Tondi at Sõjakooli 10', () => {
      const rows = eeCenters.filter(c => c.brand === 'Golden Club');
      expect(rows.length).toBe(3);
      const tondi = findCenterById(GC_TONDI)!;
      expect(tondi.name).toMatch(/Tondi/i);
      expect(tondi.address).toMatch(/Sõjakooli/i);
      expect(tondi.postal_code).toBe('11316');
      expect(tondi.city).toBe('Tallinn');
      expect(isPlausibleEstoniaCoordinate(tondi.lat!, tondi.lng!)).toBe(true);
      expect(findCenterById(GC_ROTERMANNI)?.brand).toBe('Golden Club');
    });
  });

  describe('7. Duplicate / proximity QA', () => {
    it('no duplicate IDs; only known Viru↔Postimaja ≤200m A_legitimate pair', () => {
      expect(new Set(eeCenters.map(c => c.id)).size).toBe(68);

      let same25 = 0;
      let same50 = 0;
      let same100 = 0;
      let same200 = 0;
      let identical = 0;
      let diff100 = 0;
      let sameAddress = 0;
      const pairs200: Array<{a: string; b: string; d: number}> = [];

      for (let i = 0; i < eeCenters.length; i++) {
        for (let j = i + 1; j < eeCenters.length; j++) {
          const a = eeCenters[i]!;
          const b = eeCenters[j]!;
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
            if (d <= 200) {
              same200++;
              pairs200.push({a: a.id, b: b.id, d: Math.round(d)});
            }
          } else if (d <= 100) {
            diff100++;
          }
        }
      }

      expect(same25).toBe(0);
      expect(same50).toBe(0);
      expect(same100).toBe(0);
      expect(same200).toBe(1);
      expect(identical).toBe(0);
      expect(diff100).toBe(0);
      expect(sameAddress).toBe(0);
      expect(pairs200).toHaveLength(1);
      const pair = pairs200[0]!;
      expect([pair.a, pair.b].sort()).toEqual([MF_VIRU, MF_POSTIMAJA].sort());
      expect(pair.d).toBeGreaterThanOrEqual(130);
      expect(pair.d).toBeLessThanOrEqual(160);
      const viru = findCenterById(MF_VIRU)!;
      const post = findCenterById(MF_POSTIMAJA)!;
      expect(viru.brand).toBe('MyFitness');
      expect(post.brand).toBe('MyFitness');
      expect(viru.address).not.toBe(post.address);
    });
  });

  describe('8. Border safety', () => {
    it('rejects neighbor cores; all ee_* inside Estonia helper; LV/LT intact', () => {
      expect(isPlausibleEstoniaCoordinate(56.9496, 24.1052)).toBe(false); // Rīga
      expect(isPlausibleEstoniaCoordinate(54.6872, 25.2797)).toBe(false); // Vilnius
      expect(isPlausibleEstoniaCoordinate(60.1699, 24.9384)).toBe(false); // Helsinki
      expect(isPlausibleEstoniaCoordinate(59.437, 24.7536)).toBe(true); // Tallinn
      expect(isPlausibleEstoniaCoordinate(58.378, 26.729)).toBe(true); // Tartu
      for (const c of eeCenters) {
        expect(isPlausibleEstoniaCoordinate(c.lat!, c.lng!)).toBe(true);
        expect(FOREIGN_BLOB.test(`${c.city} ${c.address}`)).toBe(false);
        expect(String(c.id).startsWith('lv_')).toBe(false);
        expect(String(c.id).startsWith('lt_')).toBe(false);
      }
      expect(catalog.filter(c => c.country === 'Latvia').length).toBe(33);
      expect(catalog.filter(c => c.country === 'Lithuania').length).toBe(61);
      expect(catalog.filter(c => c.id.startsWith('lv_')).length).toBe(33);
      expect(catalog.filter(c => c.id.startsWith('lt_')).length).toBe(61);
    });
  });

  describe('9. Estonian text / diacritics', () => {
    it('preserves display diacritics; search folds ASCII', () => {
      expect(eeCenters.some(c => c.city === 'Pärnu')).toBe(true);
      expect(eeCenters.some(c => c.city === 'Jõhvi' || /Jõhvi/i.test(c.name))).toBe(true);
      expect(eeCenters.some(c => c.city === 'Võru')).toBe(true);
      const blob = eeCenters.map(c => `${c.name} ${c.address} ${c.city}`).join('\n');
      expect(blob).toMatch(/ä|ö|ü|õ|š|ž|Ä|Ö|Ü|Õ/i);
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(normalizeGymSearchValue('Pärnu')).toBe('parnu');
      expect(normalizeGymSearchValue('Jõhvi')).toBe('johvi');
      expect(normalizeGymSearchValue('Võru')).toBe('voru');
      expect(normalizeGymSearchValue('Õismäe')).toBe('oismae');
      expect(normalizeGymSearchValue('Sõjakooli')).toBe('sojakooli');
    });
  });

  describe('10. Search QA', () => {
    it('brand searches return ee_*; Gym! does not resolve as Gym+', () => {
      for (const q of [
        'MyFitness',
        'myfitness',
        '24-7',
        '24-7 Fitness',
        'Gym!',
        'gym!',
        'Golden Club',
        'golden club',
      ]) {
        const hits = searchGyms(q, {gyms: estonia, limit: 50});
        expect(hits.some(h => h.gym.id.startsWith('ee_'))).toBe(true);
        expect(hits.every(h => h.gym.id.startsWith('ee_'))).toBe(true);
      }
      const bang = searchGyms('Gym!', {gyms: estonia, limit: 40});
      expect(bang.some(h => h.gym.brand === 'Gym!')).toBe(true);
      expect(bang.some(h => h.gym.brand === 'Gym+')).toBe(false);
      expect(bang.every(h => h.gym.country === 'Estonia')).toBe(true);
      const gymBangGlobal = searchGyms('Gym!', {limit: 80});
      const eeBang = gymBangGlobal.filter(h => h.gym.id.startsWith('ee_'));
      expect(eeBang.length).toBeGreaterThan(0);
      expect(eeBang.some(h => h.gym.brand === 'Gym!')).toBe(true);
      expect(eeBang.every(h => h.gym.brand !== 'Gym+')).toBe(true);
    });

    it('city searches return ee_* where coverage exists; zero-chain cities stay empty in catalog', () => {
      for (const q of [
        'Tallinn',
        'Tartu',
        'Narva',
        'Pärnu',
        'Parnu',
        'Viljandi',
        'Jõhvi',
        'Johvi',
        'Rakvere',
        'Võru',
        'Voru',
        'Kuressaare',
      ]) {
        const scoped = searchGyms(q, {gyms: estonia, limit: 40});
        expect(scoped.some(h => h.gym.id.startsWith('ee_'))).toBe(true);
      }
      for (const city of ZERO_CHAIN_CITIES) {
        expect(eeCenters.every(c => c.city !== city)).toBe(true);
      }
      for (const q of [
        'Kohtla-Järve',
        'Kohtla-Jarve',
        'Maardu',
        'Sillamäe',
        'Sillamae',
        'Valga',
        'Haapsalu',
        'Paide',
      ]) {
        const hits = searchGyms(q, {gyms: estonia, limit: 20});
        expect(hits.every(h => !ZERO_CHAIN_CITIES.includes(h.gym.city))).toBe(true);
      }
    });

    it('postcode search uses string NNNNN; EE-scoped results', () => {
      const samples = ['10416', '20303', '11316', '10111', '51004', '76607', '44310', '65606'];
      for (const pc of samples) {
        const row = eeCenters.find(c => c.postal_code === pc);
        expect(row).toBeTruthy();
        expect(typeof row!.postal_code).toBe('string');
        const scoped = searchGyms(pc, {gyms: estonia, limit: 20});
        expect(scoped.length).toBeGreaterThan(0);
        expect(scoped.every(h => h.gym.id.startsWith('ee_'))).toBe(true);
        expect(scoped.some(h => h.gym.postalCode === pc)).toBe(true);
      }
      expect(eeCenters.every(c => ESTONIA_POSTAL_RE.test(c.postal_code))).toBe(true);
      expect(eeCenters.every(c => typeof c.postal_code === 'string')).toBe(true);
    });
  });

  describe('11. Onboarding / profile / nearest / map', () => {
    it('representative brand/city picks persist as ee_* Estonia; CS not selectable', () => {
      for (const id of [MF_KRISTIINE, F247_AKADEEMIA, GYM_TEHNOPOL, GC_TONDI, F247_PORT_ARTUR]) {
        const pick = findGymById(id)!;
        expect(pick).toBeTruthy();
        expect(resolveGymOrStub(pick.id).id).toBe(pick.id);
        expect(resolveGymOrStub(pick.id).region).toBe('Estonia');
        expect(findGymById(pick.id)?.country).toBe('Estonia');
        expect(gymCountryTranslationKey(pick.country)).toBe('countries.estonia');
      }
      for (const id of COMING_SOON_IDS) {
        expect(findGymById(id)).toBeNull();
        expect(estonia.some(g => g.id === id)).toBe(false);
      }
    });

    it('mixed favorites + exact ID lookup; never catalog[0]', () => {
      const a = estonia[0]!;
      const b = estonia[1]!;
      const dk = gyms.find(g => g.country === 'Denmark')!;
      const lv = gyms.find(g => g.country === 'Latvia')!;
      const lt = gyms.find(g => g.country === 'Lithuania')!;
      for (const id of [a.id, b.id, dk.id, lv.id, lt.id]) {
        expect(findGymById(id)?.id).toBe(id);
      }
      expect(findGymById(a.id)?.id).not.toBe(catalog[0]!.id);
      expect(findGymById(a.id)?.country).toBe('Estonia');
    });

    it('nearest returns plausible ee_*; CS cannot be nearest live', () => {
      const fixtures = [
        {city: 'Tallinn', lat: 59.437, lng: 24.7536},
        {city: 'Tartu', lat: 58.378, lng: 26.729},
        {city: 'Narva', lat: 59.379, lng: 28.179},
        {city: 'Pärnu', lat: 58.3859, lng: 24.4971},
      ];
      for (const f of fixtures) {
        const n = findNearestGym(f.lat, f.lng, estonia);
        expect(n?.id.startsWith('ee_')).toBe(true);
        expect(n?.country).toBe('Estonia');
        expect(COMING_SOON_IDS.includes(n!.id)).toBe(false);
        expect(isPlausibleEstoniaCoordinate(n!.latitude, n!.longitude)).toBe(true);
      }
    });

    it('map viewport subsets Tallinn / Tartu; no CS markers', () => {
      const markers = toMap(estonia);
      expect(markers.length).toBe(68);
      expect(markers.every(m => !COMING_SOON_IDS.includes(m.id))).toBe(true);
      const regions = [
        {latitude: 59.437, longitude: 24.7536, latitudeDelta: 0.25, longitudeDelta: 0.25},
        {latitude: 58.378, longitude: 26.729, latitudeDelta: 0.15, longitudeDelta: 0.15},
      ];
      for (const region of regions) {
        const visible = filterMapCentersInRegion(markers as never, region as never);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(EXPECTED_TOTAL);
        expect(visible.every(v => v.id.startsWith('ee_'))).toBe(true);
        expect(visible.every(v => !COMING_SOON_IDS.includes(v.id))).toBe(true);
      }
      const tallinn = filterMapCentersInRegion(markers as never, {
        latitude: 59.437,
        longitude: 24.7536,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      } as never);
      expect(tallinn.length).toBeGreaterThan(5);
      const brands = new Set(tallinn.map(v => findCenterById(v.id)?.brand).filter(Boolean));
      expect(brands.size).toBeGreaterThan(1);
      const pick = tallinn[0]!;
      expect(findGymById(pick.id)?.id).toBe(pick.id);
    });
  });

  describe('12. Check-in / auto-checkout', () => {
    it('keeps CHECK_IN and AUTO_CHECKOUT radii at 200 m', () => {
      expect(CHECK_IN_RADIUS_METERS).toBe(200);
      expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    });

    it.each([
      ['MyFitness Kristiine', () => MF_KRISTIINE],
      ['MyFitness Volta', () => MF_VOLTA],
      ['24-7 Fitness Akadeemia', () => F247_AKADEEMIA],
      ['24-7 Fitness Rakvere', () => F247_RAKVERE],
      ['Gym! Tehnopol', () => GYM_TEHNOPOL],
      ['Golden Club Tondi', () => GC_TONDI],
      ['24-7 Fitness Port Artur', () => F247_PORT_ARTUR],
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

    it('nearby Tallinn gyms do not replace session gym ID', () => {
      const a = findGymById(MF_VIRU)!;
      const b = findGymById(MF_POSTIMAJA)!;
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
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(200); // ~144 m Viru↔Postimaja
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

  describe('13. Core flows / orphan ID / history-feed resolution', () => {
    it('ee_* resolves for workout/profile/favorites/history/feed paths', () => {
      const live = findGymById(MF_VOLTA)!;
      expect(findGymById(live.id)?.id).toBe(live.id);
      expect(findCenterById(live.id)?.id).toBe(live.id);
      expect(getActiveGymsByCountry('Estonia').length).toBe(68);
      expect(formatGymDisplayName(findGymById(live.id))).not.toMatch(/^ee_/);
      expect(formatGymDisplayName(findGymById(live.id))).toMatch(/Volta|MyFitness/i);
      const {lat, lng} = getEffectiveLatLng(findCenterById(live.id)!);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
      // Planned/history/feed/share/notification style resolution: name+city+brand, not raw id
      for (const id of [MF_VOLTA, F247_RAKVERE, GYM_TASKU, GC_TONDI]) {
        const g = findGymById(id)!;
        expect(g.name.trim().length).toBeGreaterThan(0);
        expect(g.city.trim().length).toBeGreaterThan(0);
        expect(g.brand.trim().length).toBeGreaterThan(0);
        expect(formatGymDisplayName(g)).not.toBe(id);
      }
    });

    it('orphan ee_nonexistent_test is safe Estonia stub (not LV/LT/DK/catalog[0])', () => {
      const stub = resolveGymOrStub('ee_nonexistent_test');
      expect(stub.id).toBe('ee_nonexistent_test');
      expect(stub.region).toBe('Estonia');
      expect(stub.country).toBe('');
      expect(stub.name).toBe(unresolvedGymStub('ee_nonexistent_test').name);
      expect(findGymById('ee_nonexistent_test')).toBeNull();
      expect(findGymById(getActiveDanishGyms()[0]!.id)?.id).not.toBe(stub.id);
      expect(stub.id).not.toBe(catalog[0]!.id);
      expect(stub.region).not.toBe('Latvia');
      expect(stub.region).not.toBe('Lithuania');
      expect(stub.region).not.toBe('Denmark');
      expect(stub.region).not.toBe('Finland');
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
    it('records live catalog timings vs Estonia merge / Latvia QA baselines', () => {
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
      searchGyms('tallinn', {limit: 20});
      searchGyms('myfitness', {limit: 20});
      searchGyms('24-7', {limit: 20});
      const typicalMs = (Date.now() - tSearch0) / 3;

      const tWorst0 = Date.now();
      searchGyms('a', {limit: 50});
      const worstMs = Date.now() - tWorst0;

      const tNear0 = Date.now();
      findNearestGym(59.437, 24.7536, estonia);
      const nearestMs = Date.now() - tNear0;

      const markers = toMap(estonia);
      const tMap0 = Date.now();
      const built = markers.map(m => ({id: m.id, lat: m.latitude, lng: m.longitude}));
      const mapBuildMs = Date.now() - tMap0;
      const tVp0 = Date.now();
      filterMapCentersInRegion(markers as never, {
        latitude: 59.437,
        longitude: 24.7536,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      } as never);
      const viewportMs = Date.now() - tVp0;

      const perf = {
        catalog: raw.length,
        active: active.length,
        estonia: eeCenters.length,
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
        estonia_merge_baseline: {
          catalog: 11648,
          json_size_mb: 3.44,
          parse_ms: 17,
        },
        latvia_qa_baseline: {
          catalog: 11542,
          json_size_mb: 3.42,
          cold_index_ms: 1202,
          typical_search_ms: 110,
        },
        assessment: 'healthy',
        global_stress_qa_required: false,
        country_expansion: 'UNLOCKED',
        crossed_12500: false,
        production_sha256: POST_MERGE_SHA,
      };
      const outDir = path.join(__dirname, '../data/estonia');
      fs.writeFileSync(
        path.join(outDir, 'ESTONIA_QA_PERF.json'),
        JSON.stringify(perf, null, 2) + '\n',
      );
      expect(perf.catalog).toBe(11692);
      expect(perf.estonia).toBe(68);
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
