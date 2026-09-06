/**
 * Serbia production merge safety — post-merge catalog integrity.
 * Does NOT run full Serbia Production QA.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSerbiaCoordinate,
  SERBIA_POSTAL_RE,
  isSerbiaCountry,
  isPlausibleKosovoCoordinate,
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
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|directory_.*_premises/i;
const FORBIDDEN_LIVE =
  /\b(CrossFit|Planet Fitness|Forma Plus|Flex Gym|municipal|Pionirski Park|Gradska teretana)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_RS = 63;
const PRE_MERGE_SHA =
  'f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5';

const APPROVED_IDS = [
  'rs_018d2d65ab', 'rs_019b8ad24f', 'rs_03e40c09b0', 'rs_0957d232c6', 'rs_0bf804be77',
  'rs_0e7717f3d3', 'rs_12801a2ac3', 'rs_14fe1fab48', 'rs_15ecc8b34f', 'rs_252ad4c979',
  'rs_2def324779', 'rs_2fc73eff11', 'rs_313a90da62', 'rs_33fc9eacc0', 'rs_343b2180ca',
  'rs_3549d17c97', 'rs_35a0aabd0e', 'rs_3c7aec5473', 'rs_3d36bc5b45', 'rs_402a687bc5',
  'rs_4aeefbfaff', 'rs_50f63b7c80', 'rs_56397a7865', 'rs_576313cc5a', 'rs_58d720a04f',
  'rs_5ef979e138', 'rs_65ade52b7c', 'rs_67bd2630ca', 'rs_6951e86aae', 'rs_6c7bb1ddd7',
  'rs_6f881fe52c', 'rs_753bc9119e', 'rs_7da181ac7a', 'rs_818fcf93c9', 'rs_82454592cb',
  'rs_837bd41171', 'rs_85f602281c', 'rs_86acfc1379', 'rs_8807732710', 'rs_89e0dc2005',
  'rs_925ff170e1', 'rs_93ffa74b35', 'rs_983e0f2c64', 'rs_991593d854', 'rs_9f10bdf788',
  'rs_a1e1645aeb', 'rs_ae8f49d543', 'rs_aed7eddac4', 'rs_bf83b69329', 'rs_c3fe1cfc77',
  'rs_c582de5ef3', 'rs_c86db1e43c', 'rs_d16f6c00ca', 'rs_e7f7b48767', 'rs_e8bca5edc3',
  'rs_e96f0214c4', 'rs_ecd31a167b', 'rs_ecdec69778', 'rs_f109896f32', 'rs_f307f1ef32',
  'rs_f37a71d85c', 'rs_f9a07723c2', 'rs_fbcb531d83',
];

const SMI_IDS = ['rs_8807732710', 'rs_2fc73eff11', 'rs_e7f7b48767', 'rs_313a90da62'];
const WELLNESS_IDS = ['rs_8807732710', 'rs_313a90da62'];
const GYM_TOWN_IDS = ['rs_ecd31a167b', 'rs_f109896f32', 'rs_402a687bc5'];
const MUNICIPAL_EXCLUDED = ['rs_46c05a109d', 'rs_45e1837d4e'];
const P1_UNRESOLVED_SAMPLE = ['rs_f8562f5e78', 'rs_f335c0079e', 'rs_a62cccd3b8', 'rs_51ba98e5d2'];

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Belgrade',
    address: partial.address ?? 'Knez Mihailova 1',
    postalCode: partial.postalCode ?? '11000',
    country: 'Serbia',
    region: 'Serbia',
    latitude: partial.latitude ?? 44.8176,
    longitude: partial.longitude ?? 20.4633,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Knez Mihailova 1',
      postal_code: partial.postalCode ?? '11000',
      city: partial.city ?? 'Belgrade',
      country: 'Serbia',
      lat: partial.latitude ?? 44.8176,
      lng: partial.longitude ?? 20.4633,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Serbia merge safety', () => {
  const rs = ALL_GYM_CENTERS.filter(c => c.country === 'Serbia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const reportPath = path.join(__dirname, '../data/serbia/SERBIA_MERGE_REPORT.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, any>;
  const POST_MERGE_SHA = report.post_merge_sha256 as string;
  const approved = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/serbia/SERBIA_APPROVED_FOR_MERGE.json'), 'utf8'),
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
      path.join(__dirname, '../data/serbia/SERBIA_PHASE2_READY_TO_IMPORT.json'),
      'utf8',
    ),
  ) as Array<{id: string}>;
  const staging = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/serbia/serbia_centers_staging.json'), 'utf8'),
  ) as Array<{id: string; import_category: string}>;
  const idem = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/serbia/SERBIA_MERGE_IDEMPOTENCY.json'), 'utf8'),
  ) as {second_run_insertions: number; final_catalog: number; serbia?: number};
  const dup = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/serbia/SERBIA_MERGE_DUPLICATE_ANALYSIS.json'),
      'utf8',
    ),
  ) as {unexplained_hard_duplicates?: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/serbia/SERBIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};

  test('catalog 11921; Serbia 63; SHA chain', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(rs.length).toBe(EXPECTED_RS);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('rs_')).length).toBe(EXPECTED_RS);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(POST_MERGE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.before.total).toBe(11858);
    expect(report.before.serbia).toBe(0);
    expect(report.inserted).toBe(63);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.serbia).toBe(EXPECTED_RS);
    expect(GYM_ID_PREFIX.serbia).toBe('rs_');
  });

  test('approved == phase2 READY == production IDs; Class A 59; SMI 4', () => {
    const prodIds = new Set(rs.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(ready.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect([...prodIds].sort()).toEqual([...APPROVED_IDS].sort());
    expect(report.eligibility?.CHAIN_CLASS_A).toBe(59);
    expect(report.eligibility?.SMALL_MARKET_INDEPENDENT).toBe(4);
  });

  test('brand gates; SMI; wellness; municipal/forbidden absent', () => {
    expect(rs.filter(c => c.brand === 'Ahilej').length).toBe(33);
    expect(rs.filter(c => c.brand === 'Non Stop Fitness').length).toBe(16);
    expect(rs.filter(c => c.brand === 'Mega Gym').length).toBe(7);
    expect(rs.filter(c => c.brand === 'Gym Town').length).toBe(3);
    expect(rs.filter(c => c.brand === 'Sky Experience').length).toBe(1);
    expect(rs.filter(c => c.brand === 'Centar X Fitness').length).toBe(1);
    expect(rs.filter(c => c.brand === 'X Sport Gym').length).toBe(1);
    expect(rs.filter(c => c.brand === 'ONE Wellness').length).toBe(1);

    for (const id of GYM_TOWN_IDS) {
      expect(rs.some(c => c.id === id && c.brand === 'Gym Town')).toBe(true);
    }
    for (const id of SMI_IDS) {
      expect(rs.some(c => c.id === id)).toBe(true);
      expect(approved.find(a => a.id === id)?.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
    }
    for (const id of WELLNESS_IDS) {
      expect(approved.find(a => a.id === id)?.phase2_classification).toBe('WELLNESS_ADDITIVE');
    }

    for (const id of MUNICIPAL_EXCLUDED) {
      expect(rs.some(c => c.id === id)).toBe(false);
    }
    for (const id of P1_UNRESOLVED_SAMPLE) {
      expect(rs.some(c => c.id === id)).toBe(false);
    }
  });

  test('city gates; classification; DQ / borders / duplicates', () => {
    expect(rs.filter(c => c.city === 'Belgrade').length).toBe(53);
    expect(rs.filter(c => c.city === 'Novi Sad').length).toBe(3);
    expect(rs.filter(c => c.city === 'Niš').length).toBe(4);
    expect(rs.filter(c => c.city === 'Pančevo').length).toBe(2);
    expect(rs.filter(c => c.city === 'Smederevo').length).toBe(1);

    expect(
      approved.filter(a => a.phase2_classification === 'A_CONVENTIONAL_PUBLIC_GYM').length,
    ).toBe(61);
    expect(approved.filter(a => a.phase2_classification === 'WELLNESS_ADDITIVE').length).toBe(2);

    expect(new Set(rs.map(c => c.id)).size).toBe(63);
    for (const c of rs) {
      expect(c.id.startsWith('rs_')).toBe(true);
      expect(SERBIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleSerbiaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(isPlausibleKosovoCoordinate(c.lat!, c.lng!)).toBe(false);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FORBIDDEN_LIVE.test(`${c.name} ${c.brand}`)).toBe(false);
      expect(isSerbiaCountry(c.country)).toBe(true);
    }
    expect(dup.unexplained_hard_duplicates ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.exclusions?.municipal_leakage ?? 0).toBe(0);
    expect(report.exclusions?.original_unresolved_leakage ?? 0).toBe(0);
    expect(report.exclusions?.excluded_leakage ?? 0).toBe(0);
    expect(report.cross_border?.kosovo ?? 0).toBe(0);
  });

  test('reconciliation 63/63/63/63; metadata NONE; prior countries', () => {
    const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
    expect(merged.length).toBe(63);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(70);
    expect(report.reconciliation?.metadata_drift ?? 'NONE').toBe('NONE');
    for (const a of approved) {
      const live = rs.find(c => c.id === a.id)!;
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(Number(live.lat)).toBe(Number(a.lat));
      expect(Number(live.lng)).toBe(Number(a.lng));
    }
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
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
    expect(idem.serbia ?? EXPECTED_RS).toBe(EXPECTED_RS);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    const sample = rs.find(c => c.brand === 'Ahilej')!;
    const gym = findGymById(sample.id)!;
    expect(formatGymDisplayName(gym)).not.toMatch(/^rs_/);
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
    expect(entry.haystack.toLowerCase()).toMatch(/serbia|beograd|srbija/i);

    const rsGyms = getActiveGymsByCountry('Serbia');
    expect(rsGyms.length).toBe(63);
    const markers = rsGyms.map(g => ({
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
        latitude: 44.0,
        longitude: 20.5,
        latitudeDelta: 2.5,
        longitudeDelta: 2.5,
      }).length,
    ).toBe(63);

    for (const [lat, lng] of [
      [44.8176, 20.4633],
      [45.25, 19.84],
      [43.32, 21.89],
      [44.87, 20.64],
    ] as Array<[number, number]>) {
      const nearest = findNearestGym(lat, lng, rsGyms);
      expect(nearest?.id.startsWith('rs_')).toBe(true);
      expect(nearest?.country).toBe('Serbia');
    }

    const stub = resolveGymOrStub('rs_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Serbia/i);
    expect(report.architecture ?? 'KEEP CLIENT-SIDE').toBe('KEEP CLIENT-SIDE');
    expect(report.crosses_12500 ?? false).toBe(false);
    expect(report.global_stress_qa_required ?? false).toBe(false);
    expect(report.global_stress_qa_run ?? false).toBe(false);
    expect(report.serbia_specific_radius_override ?? 0).toBe(0);
    expect(report.verdict).toBe('SERBIA MERGE COMPLETE — WAITING FOR QA');
  });
});
