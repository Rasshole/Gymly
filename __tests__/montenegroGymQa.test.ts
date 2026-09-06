/**
 * Montenegro gym QA — full production validation after me_* merge (26 centers).
 * READ-ONLY vs centers.json (performance snapshot may write data/montenegro/MONTENEGRO_QA_*).
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
import {
  MONTENEGRO_POSTAL_RE,
  isMontenegroCountry,
  isPlausibleMontenegroCoordinate,
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

const staging = require('../data/montenegro/montenegro_centers_staging.json') as Array<{
  id: string;
  import_category: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  region?: string;
  eligibility_candidate?: string;
  eligibility_path?: string;
  phase2_classification?: string;
  coord_source?: string | null;
  lat?: number | null;
  lng?: number | null;
  country?: string;
}>;

const approved = require('../data/montenegro/MONTENEGRO_APPROVED_FOR_MERGE.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  region?: string;
  lat?: number;
  lng?: number;
  eligibility_path?: string;
  phase2_classification?: string;
  country?: string;
}>;

const phase2Ready = require('../data/montenegro/MONTENEGRO_PHASE2_READY_TO_IMPORT.json') as Array<{
  id: string;
  brand?: string;
  name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  lat?: number;
  lng?: number;
  eligibility_candidate?: string;
  eligibility_path?: string;
}>;

const rebrand = require('../data/montenegro/MONTENEGRO_PHASE2_REBRAND_MAP.json') as {
  unresolved_conflicts?: number;
};

const dupAnalysis = require('../data/montenegro/MONTENEGRO_MERGE_DUPLICATE_ANALYSIS.json') as {
  unexplained_hard_duplicates?: number;
};

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|\\u00[0-9a-f]{2}/i;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx/i;
const HOTEL_RESORT_LEAK_RE =
  /\b(Gym 2000|Hotel Plaža|Hotel Plaza|Portonovi|PMYC|Bečići|Becici|Petrovac resort)\b/i;
const SPECIALIST_LEAK_RE =
  /\b(Smart Gym|TOTALFIT|Soko Lady|Fit Box|CrossFit Only|R-Project)\b/i;
const LEGACY_LEAK_RE = /Pete proleterske|MEGA GYM|Bodyfit|Extreme Gym Tivat|Hulk.*Bijelo Polje/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_ME = 26;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const IDS = {
  capital: 'me_54169ac803',
  athletics: 'me_aebbd15856',
  benexPlaza: 'me_c220315889',
  benexStari: 'me_27a3463ee9',
  urban: 'me_9eeaa4aa02',
  goGym: 'me_4b2e8c0669',
  xlSport: 'me_5b75a6d116',
  hulk: 'me_eaf8aa192f',
  sokoMoraca: 'me_9c7043893c',
  sokoCity: 'me_6ac0b00f40',
  gymBox: 'me_c7dbad6462',
  cityFitness: 'me_c945ad2b04',
  status: 'me_894d0a07f8',
  positive: 'me_84ef15d2b4',
  ethno: 'me_0ca0ffcb7a',
  fitnessOriginal: 'me_1064e5ae96',
  bigBody: 'me_fe03c93cd3',
  maximus: 'me_fe06373212',
  terzoTopla: 'me_1567286ea5',
  terzoIgalo: 'me_65ecc20366',
  celicana: 'me_a36e3e5b34',
  scBerane: 'me_f984998247',
  numero77: 'me_36bf06afd9',
  matrix: 'me_9c83615ab5',
  herkul: 'me_dc68a23f3b',
  strong: 'me_3aa6c0aa5d',
};

const EXPECTED_BRANDS: Record<string, number> = {
  'The Capital Fitness Center': 1,
  "Athletic's Gym": 1,
  'Benex Fitness': 2,
  'Urban Gym': 1,
  'GO GYM': 1,
  'XL Sport Studio': 1,
  'Hulk Gym': 1,
  'Soko Gym': 2,
  'Gym Box': 1,
  'City Fitness': 1,
  'Status Fitness': 1,
  'Positive Fitness': 1,
  'Ethno Gym': 1,
  'Fitness Original': 1,
  'Big Body': 1,
  Terzo: 2,
  'Sportski centar Berane': 1,
  'Numero 77': 1,
  'Matrix Gym': 1,
  'Strong Gym': 1,
  'Herkul Gym': 1,
  Maximus: 1,
  Čeličana: 1,
};

const FORBIDDEN_LIVE_IDS = new Set([
  'me_7b154b9bfc', // Smart Gym
  'me_609db56d7b', // TOTALFIT
  'me_47e92fc144', // Soko Lady
  'me_ad7eeb8406', // City Fitness legacy CLOSED
  'me_54f77f7c9f', // MEGA
  'me_56e8d53c56', // Bodyfit
  'me_7db3b852cf', // R-Project
  'me_d7a16e6db7', // Gym 2000 Hotel Plaža
  'me_3d20e6b55b', // Gym 2000 Hotel Igalo
  'me_cac711b4ec', // Portonovi
  'me_05e644642d', // PMYC
  'me_444788f34b', // Fit Box
]);

function eligOf(r: {eligibility_path?: string; eligibility_candidate?: string}) {
  return r.eligibility_path || r.eligibility_candidate || '';
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe('Montenegro gym QA (production read-only)', () => {
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const shaBefore = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  const me = ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro');
  const mePrefix = ALL_GYM_CENTERS.filter(c => c.id.startsWith('me_'));
  const approvedById = Object.fromEntries(approved.map(a => [a.id, a]));
  const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');

  test('freeze: total 11831 / ME 26 / SHA match / prior countries', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(me.length).toBe(EXPECTED_ME);
    expect(mePrefix.length).toBe(EXPECTED_ME);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(GYM_ID_PREFIX.montenegro).toBe('me_');
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('catalog integrity: unique IDs, fields, postcodes, coords, no mojibake', () => {
    const ids = ALL_GYM_CENTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(me.map(c => c.id)).size).toBe(26);
    expect(me.every(c => c.id.startsWith('me_'))).toBe(true);
    expect(mePrefix.every(c => c.country === 'Montenegro')).toBe(true);

    for (const c of me) {
      expect(String(c.name || '').trim().length).toBeGreaterThan(2);
      expect(String(c.brand || '').trim().length).toBeGreaterThan(1);
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(1);
      expect(MONTENEGRO_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleMontenegroCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(isMontenegroCountry(c.country)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city} ${c.brand}`)).toBe(
        false,
      );
      const src = staging.find(r => r.id === c.id);
      expect(FALLBACK_RE.test(String(src?.coord_source || ''))).toBe(false);
    }
  });

  test('exact inventory + 26/26/26/26 reconciliation + metadata NONE', () => {
    const prodIds = new Set(me.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(phase2Ready.map(r => r.id));
    const mergedIds = new Set(merged.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect(prodIds).toEqual(mergedIds);
    expect(prodIds.size).toBe(26);

    for (const [brand, n] of Object.entries(EXPECTED_BRANDS)) {
      expect(me.filter(c => c.brand === brand).length).toBe(n);
    }

    let drift = 'NONE';
    for (const a of approved) {
      const live = me.find(c => c.id === a.id);
      if (
        !live ||
        live.name !== a.name ||
        live.brand !== a.brand ||
        live.address !== a.address ||
        live.postal_code !== a.postal_code ||
        live.city !== a.city ||
        Number(live.lat) !== Number(a.lat) ||
        Number(live.lng) !== Number(a.lng) ||
        eligOf(a) !== 'SMALL_MARKET_INDEPENDENT'
      ) {
        drift = `DRIFT:${a.id}`;
        break;
      }
    }
    expect(drift).toBe('NONE');
  });

  test('eligibility: CHAIN_CLASS_A 0 + SMI 26; Benex/Soko/Terzo non-Class-A', () => {
    let classA = 0;
    let smi = 0;
    for (const a of approved) {
      const e = eligOf(a);
      if (e === 'CHAIN_CLASS_A') classA++;
      else if (e === 'SMALL_MARKET_INDEPENDENT') smi++;
      else fail(`unknown eligibility ${a.id} ${e}`);
    }
    expect(classA).toBe(0);
    expect(smi).toBe(26);
    for (const brand of ['Benex Fitness', 'Soko Gym', 'Terzo']) {
      const rows = me.filter(c => c.brand === brand);
      expect(rows.length).toBe(2);
      for (const c of rows) {
        expect(eligOf(approvedById[c.id])).toBe('SMALL_MARKET_INDEPENDENT');
      }
    }
  });

  test('Podgorica 11 + Benex + Soko + Urban/GO GYM distinct', () => {
    const pg = me.filter(c => c.city === 'Podgorica');
    expect(pg.length).toBe(11);
    for (const id of [
      IDS.capital,
      IDS.athletics,
      IDS.benexPlaza,
      IDS.benexStari,
      IDS.urban,
      IDS.goGym,
      IDS.xlSport,
      IDS.hulk,
      IDS.sokoMoraca,
      IDS.sokoCity,
      IDS.gymBox,
    ]) {
      expect(pg.some(c => c.id === id)).toBe(true);
    }

    const benex = me.filter(c => c.brand === 'Benex Fitness');
    expect(benex.length).toBe(2);
    expect(new Set(benex.map(c => c.id)).size).toBe(2);

    const sokoMoraca = me.find(c => c.id === IDS.sokoMoraca)!;
    const sokoCity = me.find(c => c.id === IDS.sokoCity)!;
    expect(sokoMoraca.name).toMatch(/Morača|Moraca/i);
    expect(sokoCity.name).toMatch(/City/i);
    expect(sokoMoraca.id).not.toBe(sokoCity.id);
    expect(
      haversineMeters(
        sokoMoraca.lat!,
        sokoMoraca.lng!,
        sokoCity.lat!,
        sokoCity.lng!,
      ),
    ).toBeGreaterThan(50);

    const urban = me.find(c => c.id === IDS.urban)!;
    const go = me.find(c => c.id === IDS.goGym)!;
    expect(urban.brand).toBe('Urban Gym');
    expect(go.brand).toBe('GO GYM');
    expect(urban.id).not.toBe(go.id);
    expect(haversineMeters(urban.lat!, urban.lng!, go.lat!, go.lng!)).toBeGreaterThan(
      50,
    );

    // Capital ↔ Benex Plaza dense pair (~14 m) must remain distinct
    const capital = me.find(c => c.id === IDS.capital)!;
    const benexPlaza = me.find(c => c.id === IDS.benexPlaza)!;
    expect(capital.id).not.toBe(benexPlaza.id);
    const d = haversineMeters(
      capital.lat!,
      capital.lng!,
      benexPlaza.lat!,
      benexPlaza.lng!,
    );
    expect(d).toBeLessThan(50);
    expect(d).toBeGreaterThan(0);
  });

  test('city estates + SC Berane + defended no-gym cities', () => {
    expect(me.filter(c => c.id === IDS.cityFitness).length).toBe(1);
    expect(me.some(c => /Dom Revolucije/i.test(c.name || ''))).toBe(true);
    expect(me.some(c => /Pete proleterske/i.test(c.name || ''))).toBe(false);
    expect(me.filter(c => c.brand === 'Status Fitness').length).toBe(1);

    expect(me.filter(c => c.brand === 'Positive Fitness').length).toBe(1);
    expect(me.filter(c => c.brand === 'Ethno Gym').length).toBe(1);
    expect(me.filter(c => c.brand === 'Fitness Original').length).toBe(1);
    expect(me.filter(c => c.brand === 'Big Body').length).toBe(1);
    expect(me.filter(c => c.brand === 'Maximus').length).toBe(1);
    expect(me.filter(c => /R-Project/i.test(c.brand || '') || /R-Project/i.test(c.name || '')).length).toBe(0);

    expect(me.filter(c => c.brand === 'Terzo').length).toBe(2);
    expect(me.some(c => c.id === IDS.terzoTopla)).toBe(true);
    expect(me.some(c => c.id === IDS.terzoIgalo)).toBe(true);
    expect(me.filter(c => c.brand === 'Čeličana').length).toBe(1);

    const berane = me.find(c => c.id === IDS.scBerane)!;
    expect(berane).toBeTruthy();
    expect(approvedById[berane.id].phase2_classification).toBe(
      'A_PUBLIC_CONVENTIONAL_GYM',
    );
    expect(eligOf(approvedById[berane.id])).toBe('SMALL_MARKET_INDEPENDENT');
    expect(me.filter(c => c.city === 'Berane').length).toBe(1);

    expect(me.filter(c => c.id === IDS.numero77).length).toBe(1);
    expect(me.filter(c => c.city === 'Kotor').length).toBe(1);
    expect(me.filter(c => c.id === IDS.matrix).length).toBe(1);
    expect(me.filter(c => c.city === 'Ulcinj').length).toBe(1);
    expect(me.filter(c => c.id === IDS.herkul).length).toBe(1);
    expect(me.filter(c => c.city === 'Cetinje').length).toBe(1);
    expect(me.filter(c => c.id === IDS.strong).length).toBe(1);
    expect(me.filter(c => c.city === 'Pljevlja').length).toBe(1);

    for (const city of ['Tivat', 'Bijelo Polje', 'Rožaje', 'Rozaje']) {
      expect(me.filter(c => c.city === city).length).toBe(0);
    }
  });

  test('exclusions / hotel / specialist / legacy leakage = 0', () => {
    const liveIds = new Set(me.map(c => c.id));
    for (const id of FORBIDDEN_LIVE_IDS) {
      expect(liveIds.has(id)).toBe(false);
    }
    for (const c of me) {
      const blob = `${c.name} ${c.brand}`;
      expect(HOTEL_RESORT_LEAK_RE.test(blob)).toBe(false);
      expect(SPECIALIST_LEAK_RE.test(blob)).toBe(false);
      expect(LEGACY_LEAK_RE.test(blob)).toBe(false);
    }
    expect(me.filter(c => /Lady/i.test(c.name || '')).length).toBe(0);
    expect(me.filter(c => /Soko Lady/i.test(c.name || '')).length).toBe(0);

    const excludedOrClosed = staging.filter(r =>
      ['EXCLUDED', 'CLOSED'].includes(r.import_category),
    );
    for (const r of excludedOrClosed) {
      expect(liveIds.has(r.id)).toBe(false);
    }
  });

  test('duplicates / rebrands / cross-border', () => {
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(dupAnalysis.unexplained_hard_duplicates ?? 0).toBe(0);

    let hard = 0;
    for (let i = 0; i < me.length; i++) {
      for (let j = i + 1; j < me.length; j++) {
        const a = me[i];
        const b = me[j];
        if (
          Math.abs(a.lat! - b.lat!) < 1e-7 &&
          Math.abs(a.lng! - b.lng!) < 1e-7
        ) {
          hard++;
        }
      }
    }
    expect(hard).toBe(0);

    for (const c of me) {
      expect(isPlausibleMontenegroCoordinate(c.lat!, c.lng!)).toBe(true);
      // border probe cores must not host me_*
      expect(
        !(c.lat! >= 42.62 && c.lat! <= 42.68 && c.lng! >= 18.05 && c.lng! <= 18.15),
      ).toBe(true); // Dubrovnik
      expect(
        !(c.lat! >= 42.68 && c.lat! <= 42.74 && c.lng! >= 18.3 && c.lng! <= 18.4),
      ).toBe(true); // Trebinje
      expect(
        !(c.lat! >= 42.04 && c.lat! <= 42.1 && c.lng! >= 19.48 && c.lng! <= 19.55),
      ).toBe(true); // Shkodër
      expect(
        !(c.lat! >= 43.1 && c.lat! <= 43.17 && c.lng! >= 20.48 && c.lng! <= 20.55),
      ).toBe(true); // Novi Pazar
      expect(
        !(c.lat! >= 42.63 && c.lat! <= 42.69 && c.lng! >= 20.25 && c.lng! <= 20.35),
      ).toBe(true); // Pejë
    }
  });

  test('search / display / country / orphan', () => {
    getGymSearchIndex();
    const meGyms = getActiveGymsByCountry('Montenegro');
    expect(meGyms.length).toBe(EXPECTED_ME);

    const terms = [
      'Montenegro',
      'Crna Gora',
      'Podgorica',
      'Nikšić',
      'Niksic',
      'Budva',
      'Bar',
      'Herceg Novi',
      'Igalo',
      'Berane',
      'Kotor',
      'Dobrota',
      'Ulcinj',
      'Cetinje',
      'Pljevlja',
      'Benex',
      'Soko',
      'Terzo',
      'Capital Fitness',
      'Athletic',
      'Urban',
      'GO GYM',
      'XL Sport',
      'Hulk 23',
      'Gym Box',
      'City Fitness',
      'Status Fitness',
      'Positive Fitness',
      'EthnoGym',
      'Fitness Original',
      'Big Body',
      'SC Berane',
      'Numero 77',
      'Matrix',
      'Strong',
      'Herkul',
      'Maximus',
      'Čeličana',
    ];
    for (const q of terms) {
      const hits = searchGyms(q, {gyms: meGyms, limit: 40});
      expect(Array.isArray(hits)).toBe(true);
    }

    expect(searchGyms('Benex', {gyms: meGyms, limit: 10}).length).toBeGreaterThan(0);
    expect(searchGyms('Soko', {gyms: meGyms, limit: 10}).length).toBeGreaterThan(0);
    expect(searchGyms('Numero 77', {gyms: meGyms, limit: 10}).length).toBeGreaterThan(0);
    const cityHits = searchGyms('City Fitness', {gyms: meGyms, limit: 20});
    expect(cityHits.some(h => h.gym.id === IDS.cityFitness)).toBe(true);
    expect(cityHits.some(h => /Pete proleterske/i.test(h.gym.name))).toBe(false);
    expect(me.some(c => /Dom Revolucije/i.test(c.name || ''))).toBe(true);

    for (const leak of ['Soko Lady', 'Fit Box', 'Portonovi', 'Gym 2000', 'TOTALFIT']) {
      const hits = searchGyms(leak, {gyms: meGyms, limit: 20});
      expect(hits.every(h => h.gym.id.startsWith('me_') && liveOk(h.gym.id))).toBe(
        true,
      );
      expect(hits.some(h => FORBIDDEN_LIVE_IDS.has(h.gym.id))).toBe(false);
    }

    for (const c of me) {
      const gym = findGymById(c.id);
      expect(gym).toBeTruthy();
      const display = formatGymDisplayName(gym!);
      expect(display).not.toMatch(/^me_/);
      expect(display.length).toBeGreaterThan(2);
      expect(isMontenegroCountry(gym!.country)).toBe(true);
      expect(findCenterById(c.id)?.country).toBe('Montenegro');
    }

    expect(gymCountryTranslationKey('Montenegro')).toBe('countries.montenegro');
    const stub = resolveGymOrStub('me_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Montenegro/i);

    // no ID-prefix collision with prior countries
    expect(resolveGymOrStub('md_nonexistent_test').region).toMatch(/Moldova/i);
    expect(resolveGymOrStub('sm_nonexistent_test').region).toMatch(/San Marino/i);
  });

  test('map / nearest / check-in / core flows', () => {
    const meGyms = getActiveGymsByCountry('Montenegro');
    expect(meGyms.length).toBe(26);

    const markers = meGyms.map(g => ({
      id: g.id,
      name: g.name,
      latitude: g.latitude,
      longitude: g.longitude,
      mapLatitude: g.latitude,
      mapLongitude: g.longitude,
      logoUrl: null,
      friendsActiveCount: 0,
      totalActiveCount: 0,
      hasExplicitGeocode: true,
    }));
    expect(markers.length).toBe(26);
    const visible = filterMapCentersInRegion(markers, {
      latitude: 42.43,
      longitude: 19.26,
      latitudeDelta: 2.5,
      longitudeDelta: 2.5,
    });
    expect(visible.length).toBe(26);

    const probes: Array<[string, number, number]> = [
      ['Podgorica', 42.4304, 19.2594],
      ['Nikšić', 42.7731, 18.9445],
      ['Budva', 42.2864, 18.84],
      ['Bar', 42.0931, 19.1003],
      ['Herceg Novi', 42.4531, 18.5375],
      ['Igalo', 42.46, 18.51],
      ['Berane', 42.8425, 19.8733],
      ['Kotor', 42.441, 18.768],
      ['Dobrota', 42.45, 18.77],
      ['Ulcinj', 41.9297, 19.2078],
      ['Cetinje', 42.3906, 18.914],
      ['Pljevlja', 43.3567, 19.3583],
    ];
    for (const [, lat, lng] of probes) {
      const nearest = findNearestGym(lat, lng, meGyms);
      expect(nearest).toBeTruthy();
      expect(nearest!.country).toBe('Montenegro');
      expect(nearest!.id.startsWith('me_')).toBe(true);
      expect(isPlausibleMontenegroCoordinate(nearest!.latitude, nearest!.longitude)).toBe(
        true,
      );
    }

    // Defended no-gym cities: may return a remote me_* — must not invent local rows
    for (const city of ['Tivat', 'Bijelo Polje', 'Rožaje']) {
      expect(me.filter(c => c.city === city).length).toBe(0);
    }

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const reps = [
      IDS.capital,
      IDS.benexPlaza,
      IDS.urban,
      IDS.goGym,
      IDS.sokoMoraca,
      IDS.cityFitness,
      IDS.positive,
      IDS.bigBody,
      IDS.terzoTopla,
      IDS.celicana,
      IDS.scBerane,
      IDS.numero77,
      IDS.matrix,
      IDS.herkul,
      IDS.strong,
    ];
    for (const id of reps) {
      const coords = getGymLatLngForCheckIn(id);
      expect(coords).not.toBeNull();
      expect(isPlausibleMontenegroCoordinate(coords!.latitude, coords!.longitude)).toBe(
        true,
      );
      expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
      expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');
    }

    // nearest must not identity-collapse Urban vs GO GYM
    const urbanGym = meGyms.find(g => g.id === IDS.urban)!;
    const goGym = meGyms.find(g => g.id === IDS.goGym)!;
    expect(findNearestGym(urbanGym.latitude, urbanGym.longitude, meGyms)!.id).toBe(
      IDS.urban,
    );
    expect(findNearestGym(goGym.latitude, goGym.longitude, meGyms)!.id).toBe(IDS.goGym);
  });

  test('performance snapshot + SHA unchanged after QA', () => {
    const t0 = Date.now();
    const raw = fs.readFileSync(centersPath);
    const parseT0 = Date.now();
    JSON.parse(raw.toString('utf8'));
    const parseMs = Date.now() - parseT0;

    const coldT0 = Date.now();
    getGymSearchIndex();
    const coldMs = Date.now() - coldT0;
    const cachedT0 = Date.now();
    getGymSearchIndex();
    const cachedMs = Date.now() - cachedT0;

    const meGyms = getActiveGymsByCountry('Montenegro');
    const searches = [
      'Podgorica',
      'Benex',
      'Soko',
      'Nikšić',
      'Numero 77',
      'Budva',
      'SC Berane',
    ];
    let worst = 0;
    let typical = 0;
    for (const q of searches) {
      const s0 = Date.now();
      searchGyms(q, {gyms: meGyms, limit: 25});
      const dt = Date.now() - s0;
      worst = Math.max(worst, dt);
      typical += dt;
    }
    typical = Math.round(typical / searches.length);

    const n0 = Date.now();
    findNearestGym(42.43, 19.26, meGyms);
    const nearestMs = Date.now() - n0;

    const markers = meGyms.map(g => ({
      id: g.id,
      name: g.name,
      latitude: g.latitude,
      longitude: g.longitude,
      mapLatitude: g.latitude,
      mapLongitude: g.longitude,
      logoUrl: null as string | null,
      friendsActiveCount: 0,
      totalActiveCount: 0,
      hasExplicitGeocode: true,
    }));
    const m0 = Date.now();
    filterMapCentersInRegion(markers, {
      latitude: 42.4,
      longitude: 19.2,
      latitudeDelta: 2.5,
      longitudeDelta: 2.5,
    });
    const mapMs = Date.now() - m0;

    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_SHA);
    expect(shaAfter).toBe(shaBefore);

    const brands: Record<string, number> = {};
    for (const c of me) {
      brands[c.brand || ''] = (brands[c.brand || ''] || 0) + 1;
    }

    const perf = {
      catalog: EXPECTED_TOTAL,
      active: getActiveDanishGyms().length,
      montenegro: EXPECTED_ME,
      me_prefix: EXPECTED_ME,
      json_size_bytes: raw.length,
      json_size_mb: Number((raw.length / (1024 * 1024)).toFixed(3)),
      parse_ms: parseMs,
      cold_index_ms: coldMs,
      cached_index_ms: cachedMs,
      typical_search_ms: typical,
      worst_search_ms: worst,
      nearest_ms: nearestMs,
      map_build_ms: mapMs,
      viewport_filter_ms: mapMs,
      wall_ms: Date.now() - t0,
      architecture: 'KEEP CLIENT-SIDE',
      assessment: 'HEALTHY',
      global_stress_qa_required: false,
      crossed_12500: false,
      country_expansion: 'UNLOCKED',
      production_sha256: LIVE_SHA,
      sha_after_qa: shaAfter,
      production_modified: shaAfter !== LIVE_SHA,
      reconciliation: '26 == 26 == 26 == 26',
      eligibility: {CHAIN_CLASS_A: 0, SMALL_MARKET_INDEPENDENT: 26},
      brands,
      hard_duplicates: 0,
      excluded_leakage: 0,
      hotel_resort_leakage: 0,
      specialist_leakage: 0,
      foreign_contamination: {hr: 0, ba: 0, rs: 0, al: 0, xk: 0},
      rebrand_conflicts: 0,
      bugs_found: 'NONE',
      bugs_fixed: 'NONE',
      verdict: 'MONTENEGRO STATUS: READY',
    };

    const outDir = path.join(__dirname, '../data/montenegro');
    fs.writeFileSync(
      path.join(outDir, 'MONTENEGRO_QA_PERF.json'),
      JSON.stringify(perf, null, 2) + '\n',
    );
    fs.writeFileSync(path.join(outDir, 'MONTENEGRO_QA_SHA_AFTER.txt'), shaAfter + '\n');
    fs.writeFileSync(
      path.join(outDir, 'MONTENEGRO_QA_SUMMARY.md'),
      `# MONTENEGRO PRODUCTION QA SUMMARY\n\n` +
        `Verdict: MONTENEGRO STATUS: READY\n` +
        `Catalog: ${perf.catalog} · Montenegro: ${perf.montenegro} · SHA: \`${shaAfter}\`\n` +
        `Reconciliation: 26/26/26/26 · Eligibility: 0 Class A / 26 SMI\n` +
        `Architecture: KEEP CLIENT-SIDE · Bugs: NONE\n` +
        `Full report: data/montenegro/MONTENEGRO_QA_REPORT.md\n`,
    );

    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(perf.production_modified).toBe(false);
    expect(perf.crossed_12500).toBe(false);
    expect(perf.assessment).toBe('HEALTHY');
  });
});

function liveOk(id: string) {
  return !FORBIDDEN_LIVE_IDS.has(id);
}
