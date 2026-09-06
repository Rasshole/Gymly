/**
 * Albania production merge safety — post-merge catalog integrity.
 * Does NOT run full Albania Production QA.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAlbaniaCoordinate,
  ALBANIA_POSTAL_RE,
  isAlbaniaCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {resolveGymOrStub, formatGymDisplayName, findGymById} from '../src/utils/gymDisplay';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {getActiveGymsByCountry} from '../src/data/danishGyms';
import {findNearestGym} from '../src/utils/nearestGym';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FORBIDDEN_LIVE =
  /\b(CrossFit|Pilates|EMS|Planet Fitness|Sporti Pallati|Hotel amenity|Nobis|Flex Classes|Green Coast|Adriatik|Golem)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_AL = 9;
const PRE_MERGE_SHA =
  '5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e';
const POST_MERGE_SHA =
  'a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0';
const CURRENT_LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const APPROVED_IDS = [
  'al_2002d5b349',
  'al_4c11873a38',
  'al_36c04c3f26',
  'al_9ccb45b0ac',
  'al_63db3f3a75',
  'al_a153565f54',
  'al_9cf7944b63',
  'al_33f34e6832',
  'al_ee54d79fc0',
];

const REPEAT_IDS = ['al_2002d5b349', 'al_4c11873a38'];
const TIRANA_IDS = [
  'al_2002d5b349',
  'al_4c11873a38',
  'al_36c04c3f26',
  'al_9ccb45b0ac',
  'al_63db3f3a75',
];
const FORBIDDEN_IDS = [
  'al_fddc0d9db6',
  'al_3ea0220822',
  'al_a8d11636a3',
  'al_97da7476ce',
  'al_5125e8c161',
  'al_74d2983a0f',
  'al_6dcf760da9',
  'al_61dca99977',
];

const NO_GYM_CITIES = [
  'Elbasan',
  'Fier',
  'Korçë',
  'Berat',
  'Lushnjë',
  'Pogradec',
  'Kavajë',
  'Gjirokastër',
  'Sarandë',
  'Lezhë',
  'Kukës',
  'Peshkopi',
  'Kamëz',
  'Krujë',
  'Patos',
  'Kuçovë',
  'Laç',
  'Burrel',
  'Librazhd',
  'Gramsh',
  'Tepelenë',
  'Golem',
  'Ksamil',
  'Konispol',
];

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Tirana',
    address: partial.address ?? 'Rruga e Durrësit 1',
    postalCode: partial.postalCode ?? '1001',
    country: 'Albania',
    region: 'Albania',
    latitude: partial.latitude ?? 41.3275,
    longitude: partial.longitude ?? 19.8187,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Rruga e Durrësit 1',
      postal_code: partial.postalCode ?? '1001',
      city: partial.city ?? 'Tirana',
      country: 'Albania',
      lat: partial.latitude ?? 41.3275,
      lng: partial.longitude ?? 19.8187,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Albania merge safety', () => {
  const al = ALL_GYM_CENTERS.filter(c => c.country === 'Albania');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const report = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/albania/ALBANIA_MERGE_REPORT.json'), 'utf8'),
  ) as Record<string, any>;
  const approved = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/albania/ALBANIA_APPROVED_FOR_MERGE.json'),
      'utf8',
    ),
  ) as Array<{
    id: string;
    brand: string;
    name: string;
    address: string;
    postal_code: string;
    city: string;
    lat: number;
    lng: number;
    eligibility_path?: string;
    phase2_classification?: string;
  }>;
  const ready = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/albania/ALBANIA_PHASE2_READY_TO_IMPORT.json'),
      'utf8',
    ),
  ) as Array<{id: string}>;
  const staging = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/albania/albania_centers_staging.json'),
      'utf8',
    ),
  ) as Array<{id: string; import_category: string; name?: string; brand?: string; city?: string}>;
  const idem = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/albania/ALBANIA_MERGE_IDEMPOTENCY.json'),
      'utf8',
    ),
  ) as {second_run_insertions: number; final_catalog: number; albania?: number};
  const dup = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/albania/ALBANIA_MERGE_DUPLICATE_ANALYSIS.json'),
      'utf8',
    ),
  ) as {unexplained_hard_duplicates?: number};
  const rebrand = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/albania/ALBANIA_PHASE2_REBRAND_MAP.json'),
      'utf8',
    ),
  ) as {unresolved_conflicts?: number};

  test('catalog 11840; Albania 9; SHA chain', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(al.length).toBe(EXPECTED_AL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('al_')).length).toBe(EXPECTED_AL);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(CURRENT_LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11831);
    expect(report.before.albania).toBe(0);
    expect(report.inserted).toBe(9);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(11840);
    expect(report.after.albania).toBe(EXPECTED_AL);
    expect(GYM_ID_PREFIX.albania).toBe('al_');
  });

  test('approved == phase2 READY == production IDs; Class A 0; SMI 9', () => {
    const prodIds = new Set(al.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(ready.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect([...prodIds].sort()).toEqual([...APPROVED_IDS].sort());
    expect(report.eligibility?.CHAIN_CLASS_A).toBe(0);
    expect(report.eligibility?.SMALL_MARKET_INDEPENDENT).toBe(9);
    expect(approved.filter(a => a.eligibility_path === 'CHAIN_CLASS_A').length).toBe(0);
    expect(approved.filter(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT').length).toBe(9);
  });

  test('Repeat ×2; Flex ×1; city gates; forbidden absent', () => {
    for (const id of REPEAT_IDS) {
      expect(al.some(c => c.id === id && c.brand === 'Repeat')).toBe(true);
    }
    expect(al.filter(c => c.brand === 'Repeat').length).toBe(2);
    expect(al.find(c => c.id === 'al_2002d5b349')?.name).toMatch(/Wilson/i);
    expect(al.find(c => c.id === 'al_4c11873a38')?.name).toMatch(/TEG/i);
    expect(approved.find(a => a.id === 'al_2002d5b349')?.phase2_classification).toBe(
      'WELLNESS_ADDITIVE',
    );
    expect(al.filter(c => c.brand === 'Flex Gym').length).toBe(1);
    expect(al.find(c => c.id === 'al_36c04c3f26')?.city).toBe('Tirana');
    expect(al.filter(c => c.city === 'Tirana').map(c => c.id).sort()).toEqual(
      [...TIRANA_IDS].sort(),
    );
    expect(al.filter(c => c.city === 'Durrës').length).toBe(2);
    expect(al.filter(c => c.city === 'Vlorë').length).toBe(1);
    expect(al.filter(c => c.city === 'Shkodër').length).toBe(1);
    for (const id of FORBIDDEN_IDS) {
      expect(al.some(c => c.id === id)).toBe(false);
    }
    for (const city of NO_GYM_CITIES) {
      expect(al.filter(c => c.city === city).length).toBe(0);
    }
  });

  test('DQ / exclusions / borders / duplicates / rebrands', () => {
    expect(new Set(al.map(c => c.id)).size).toBe(9);
    for (const c of al) {
      expect(c.id.startsWith('al_')).toBe(true);
      expect(ALBANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleAlbaniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FORBIDDEN_LIVE.test(`${c.name} ${c.brand}`)).toBe(false);
      expect(isAlbaniaCountry(c.country)).toBe(true);
    }
    expect(dup.unexplained_hard_duplicates ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.exclusions?.municipal_leakage ?? 0).toBe(0);
    expect(report.exclusions?.hotel_spa_leakage ?? 0).toBe(0);
    expect(report.exclusions?.planet_fitness_albania ?? 0).toBe(0);
    expect(report.exclusions?.sporti_pallati ?? 0).toBe(0);
    expect(report.cross_border?.montenegro ?? 0).toBe(0);
    expect(report.cross_border?.kosovo ?? 0).toBe(0);
    expect(report.cross_border?.north_macedonia ?? 0).toBe(0);
    expect(report.cross_border?.greece ?? 0).toBe(0);
  });

  test('reconciliation 9/9/9/9; metadata NONE; prior countries', () => {
    const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
    expect(merged.length).toBe(9);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(81);
    expect(report.reconciliation?.metadata_drift ?? 'NONE').toBe('NONE');
    for (const a of approved) {
      const live = al.find(c => c.id === a.id)!;
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(Number(live.lat)).toBe(Number(a.lat));
      expect(Number(live.lng)).toBe(Number(a.lng));
    }
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(new Set(ALL_GYM_CENTERS.map(c => c.id)).size).toBe(ALL_GYM_CENTERS.length);
  });

  test('idempotency; check-in 200; search/map/nearest/orphan smoke', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL);
    expect(idem.albania ?? EXPECTED_AL).toBe(EXPECTED_AL);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    const sample = al[0];
    const gym = findGymById(sample.id)!;
    expect(formatGymDisplayName(gym)).not.toMatch(/^al_/);
    const entry = buildGymSearchEntry(
      fakeGym({
        id: sample.id,
        name: sample.name,
        city: sample.city,
        brand: sample.brand,
        latitude: sample.lat!,
        longitude: sample.lng!,
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(/albania|tirana|shqip/i);

    const alGyms = getActiveGymsByCountry('Albania');
    expect(alGyms.length).toBe(9);
    const markers = alGyms.map(g => ({
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
    expect(
      filterMapCentersInRegion(markers, {
        latitude: 41.33,
        longitude: 19.82,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }).length,
    ).toBeGreaterThanOrEqual(5);
    expect(alGyms.length).toBe(9);

    for (const [lat, lng] of [
      [41.3275, 19.8187],
      [41.365, 19.72],
      [41.31897, 19.4581],
      [40.4667, 19.4897],
      [42.0683, 19.5126],
    ] as Array<[number, number]>) {
      const nearest = findNearestGym(lat, lng, alGyms);
      expect(nearest?.id.startsWith('al_')).toBe(true);
      expect(nearest?.country).toBe('Albania');
    }

    const stub = resolveGymOrStub('al_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Albania/i);
    expect(report.architecture ?? 'KEEP CLIENT-SIDE').toBe('KEEP CLIENT-SIDE');
    expect(report.crosses_12500 ?? false).toBe(false);
    expect(report.global_stress_qa_required ?? false).toBe(false);
    expect(report.verdict).toBe('ALBANIA MERGE COMPLETE — WAITING FOR QA');
  });
});
