/**
 * Kosovo production merge safety — post-merge catalog integrity.
 * Does NOT run full Kosovo Production QA.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleKosovoCoordinate,
  KOSOVO_POSTAL_RE,
  isKosovoCountry,
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
  /\b(CrossFit|Pilates|EMS|Planet Fitness|Pro-Fit|Hotel amenity|Power Gym placeholder|foreign.?probe)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_XK = 18;
const PRE_MERGE_SHA =
  'a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0';
const CURRENT_LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const APPROVED_IDS = [
  'xk_1d7af5ff10',
  'xk_4ac1e78ed4',
  'xk_4d98941de0',
  'xk_500cfd9387',
  'xk_87bda6987b',
  'xk_9374a45e65',
  'xk_97a7085d4d',
  'xk_ae58d8d928',
  'xk_b3ba8d5cb9',
  'xk_b434775de1',
  'xk_bda33fc345',
  'xk_c701eda0ff',
  'xk_d2868682b1',
  'xk_d722f14213',
  'xk_da9309622a',
  'xk_db35d316aa',
  'xk_e06cd03b2e',
  'xk_fc7b6a8c67',
];

const FIVE_STAR_IDS = [
  'xk_4d98941de0',
  'xk_97a7085d4d',
  'xk_c701eda0ff',
  'xk_1d7af5ff10',
  'xk_d722f14213',
  'xk_db35d316aa',
  'xk_87bda6987b',
];

const LETS_GO_IDS = [
  'xk_fc7b6a8c67',
  'xk_da9309622a',
  'xk_e06cd03b2e',
  'xk_4ac1e78ed4',
  'xk_9374a45e65',
];

const SMI_IDS = [
  'xk_500cfd9387',
  'xk_ae58d8d928',
  'xk_bda33fc345',
  'xk_b434775de1',
  'xk_b3ba8d5cb9',
  'xk_d2868682b1',
];

const FORBIDDEN_IDS = [
  'xk_a7af40e3fe',
  'xk_29fa84ecf0',
  'xk_61859b084f',
  'xk_0623d1f425',
];

const NO_GYM_CITIES = [
  'Pejë',
  'Gjakovë',
  'Mitrovicë',
  'North Mitrovica',
  'Zvečan',
  'Leposaviq',
  'Zubin Potok',
  'Vushtrri',
  'Podujevë',
  'Lipjan',
  'Drenas',
  'Skenderaj',
  'Rahovec',
  'Malishevë',
  'Suharekë',
  'Kaçanik',
  'Klina',
  'Deçan',
  'Istog',
  'Dragash',
  'Štrpce',
  'Ranillug',
];

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Prishtina',
    address: partial.address ?? 'Rruga Nëna Terezë 1',
    postalCode: partial.postalCode ?? '10000',
    country: 'Kosovo',
    region: 'Kosovo',
    latitude: partial.latitude ?? 42.662,
    longitude: partial.longitude ?? 21.165,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Rruga Nëna Terezë 1',
      postal_code: partial.postalCode ?? '10000',
      city: partial.city ?? 'Prishtina',
      country: 'Kosovo',
      lat: partial.latitude ?? 42.662,
      lng: partial.longitude ?? 21.165,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Kosovo merge safety', () => {
  const xk = ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const reportPath = path.join(__dirname, '../data/kosovo/KOSOVO_MERGE_REPORT.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, any>;
  const POST_MERGE_SHA = report.post_merge_sha256 as string;
  const approved = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/kosovo/KOSOVO_APPROVED_FOR_MERGE.json'),
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
      path.join(__dirname, '../data/kosovo/KOSOVO_PHASE2_READY_TO_IMPORT.json'),
      'utf8',
    ),
  ) as Array<{id: string}>;
  const staging = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/kosovo/kosovo_centers_staging.json'),
      'utf8',
    ),
  ) as Array<{id: string; import_category: string; name?: string; brand?: string; city?: string}>;
  const idem = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/kosovo/KOSOVO_MERGE_IDEMPOTENCY.json'),
      'utf8',
    ),
  ) as {second_run_insertions: number; final_catalog: number; kosovo?: number};
  const dup = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/kosovo/KOSOVO_MERGE_DUPLICATE_ANALYSIS.json'),
      'utf8',
    ),
  ) as {unexplained_hard_duplicates?: number};
  const rebrand = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/kosovo/KOSOVO_PHASE2_REBRAND_MAP.json'),
      'utf8',
    ),
  ) as {unresolved_conflicts?: number};

  test('catalog 11921 live; Kosovo merge report frozen at 11858; SHA chain', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(xk.length).toBe(EXPECTED_XK);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('xk_')).length).toBe(EXPECTED_XK);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(CURRENT_LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(
      'f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5',
    );
    expect(report.before.total).toBe(11840);
    expect(report.before.kosovo).toBe(0);
    expect(report.inserted).toBe(18);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(11858);
    expect(report.after.kosovo).toBe(EXPECTED_XK);
    expect(GYM_ID_PREFIX.kosovo).toBe('xk_');
  });

  test('approved == phase2 READY == production IDs; Class A 12; SMI 6', () => {
    const prodIds = new Set(xk.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(ready.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect([...prodIds].sort()).toEqual([...APPROVED_IDS].sort());
    expect(report.eligibility?.CHAIN_CLASS_A).toBe(12);
    expect(report.eligibility?.SMALL_MARKET_INDEPENDENT).toBe(6);
    expect(approved.filter(a => a.eligibility_path === 'CHAIN_CLASS_A').length).toBe(12);
    expect(approved.filter(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT').length).toBe(6);
  });

  test('Five Star ×7; Lets Go ×5; SMI ×6; city gates; forbidden absent', () => {
    for (const id of FIVE_STAR_IDS) {
      expect(xk.some(c => c.id === id && c.brand === 'Five Star Fitness')).toBe(true);
    }
    expect(xk.filter(c => c.brand === 'Five Star Fitness').length).toBe(7);
    expect(xk.find(c => c.id === 'xk_4d98941de0')?.name).toMatch(/Grand Hotel/i);
    expect(approved.find(a => a.id === 'xk_4d98941de0')?.phase2_classification).toBe(
      'WELLNESS_ADDITIVE',
    );

    for (const id of LETS_GO_IDS) {
      expect(xk.some(c => c.id === id && c.brand === 'Lets Go Gym')).toBe(true);
    }
    expect(xk.filter(c => c.brand === 'Lets Go Gym').length).toBe(5);

    for (const id of SMI_IDS) {
      expect(xk.some(c => c.id === id)).toBe(true);
      expect(approved.find(a => a.id === id)?.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
    }

    expect(xk.filter(c => c.city === 'Prishtina').length).toBe(13);
    expect(xk.filter(c => c.city === 'Fushë Kosovë').length).toBe(1);
    expect(xk.filter(c => c.city === 'Prizren').length).toBe(2);
    expect(xk.filter(c => c.city === 'Gjilan').length).toBe(1);
    expect(xk.filter(c => c.city === 'Ferizaj').length).toBe(1);

    for (const id of FORBIDDEN_IDS) {
      expect(xk.some(c => c.id === id)).toBe(false);
    }
    for (const city of NO_GYM_CITIES) {
      expect(xk.filter(c => c.city === city).length).toBe(0);
    }
  });

  test('DQ / exclusions / borders / duplicates / rebrands', () => {
    expect(new Set(xk.map(c => c.id)).size).toBe(18);
    for (const c of xk) {
      expect(c.id.startsWith('xk_')).toBe(true);
      expect(KOSOVO_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleKosovoCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FORBIDDEN_LIVE.test(`${c.name} ${c.brand}`)).toBe(false);
      expect(isKosovoCountry(c.country)).toBe(true);
    }
    expect(dup.unexplained_hard_duplicates ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.exclusions?.municipal_leakage ?? 0).toBe(0);
    expect(report.exclusions?.hotel_spa_leakage ?? 0).toBe(0);
    expect(report.exclusions?.planet_fitness_kosovo ?? 0).toBe(0);
    expect(report.cross_border?.albania ?? 0).toBe(0);
    expect(report.cross_border?.montenegro ?? 0).toBe(0);
    expect(report.cross_border?.north_macedonia ?? 0).toBe(0);
    expect(report.cross_border?.serbia ?? 0).toBe(0);
  });

  test('reconciliation 18/18/18/18; metadata NONE; prior countries', () => {
    const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
    expect(merged.length).toBe(18);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(85);
    expect(report.reconciliation?.metadata_drift ?? 'NONE').toBe('NONE');
    for (const a of approved) {
      const live = xk.find(c => c.id === a.id)!;
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(Number(live.lat)).toBe(Number(a.lat));
      expect(Number(live.lng)).toBe(Number(a.lng));
    }
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
    expect(idem.kosovo ?? EXPECTED_XK).toBe(EXPECTED_XK);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    const sample = xk[0];
    const gym = findGymById(sample.id)!;
    expect(formatGymDisplayName(gym)).not.toMatch(/^xk_/);
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
    expect(entry.haystack.toLowerCase()).toMatch(/kosovo|prishtina|kosova/i);

    const xkGyms = getActiveGymsByCountry('Kosovo');
    expect(xkGyms.length).toBe(18);
    const markers = xkGyms.map(g => ({
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
        latitude: 42.44,
        longitude: 21.1,
        latitudeDelta: 0.65,
        longitudeDelta: 0.65,
      }).length,
    ).toBe(18);
    expect(xkGyms.length).toBe(18);

    for (const [lat, lng] of [
      [42.662, 21.165],
      [42.675, 21.19],
      [42.21, 20.735],
      [42.38, 20.82],
      [42.37, 21.15],
    ] as Array<[number, number]>) {
      const nearest = findNearestGym(lat, lng, xkGyms);
      expect(nearest?.id.startsWith('xk_')).toBe(true);
      expect(nearest?.country).toBe('Kosovo');
    }

    const stub = resolveGymOrStub('xk_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Kosovo/i);
    expect(report.architecture ?? 'KEEP CLIENT-SIDE').toBe('KEEP CLIENT-SIDE');
    expect(report.crosses_12500 ?? false).toBe(false);
    expect(report.global_stress_qa_required ?? false).toBe(false);
    expect(report.verdict).toBe('KOSOVO MERGE COMPLETE — WAITING FOR QA');
  });
});
