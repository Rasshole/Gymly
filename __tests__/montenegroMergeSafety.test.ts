/**
 * Montenegro production merge safety — post-merge catalog integrity.
 * Does NOT run full Montenegro Production QA.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMontenegroCoordinate,
  MONTENEGRO_POSTAL_RE,
  isMontenegroCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {resolveGymOrStub, formatGymDisplayName, findGymById} from '../src/utils/gymDisplay';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx/i;
const FORBIDDEN_LIVE =
  /Smart Gym|TOTALFIT|Soko Lady|Fit Box|Portonovi|PMYC|Gym 2000|CrossFit Only/i;

const EXPECTED_TOTAL = 11921; // live after North Macedonia merge
const ME_MERGE_AFTER_TOTAL = 11775; // frozen Montenegro merge report
const EXPECTED_ME = 26;
const PRE_MERGE_SHA =
  '753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8';
const POST_MERGE_SHA =
  '2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d'; // frozen Montenegro merge report
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Podgorica',
    address: partial.address ?? 'Slobode 1',
    postalCode: partial.postalCode ?? '81000',
    country: 'Montenegro',
    region: 'Montenegro',
    latitude: partial.latitude ?? 42.43,
    longitude: partial.longitude ?? 19.26,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Slobode 1',
      postal_code: partial.postalCode ?? '81000',
      city: partial.city ?? 'Podgorica',
      country: 'Montenegro',
      lat: partial.latitude ?? 42.43,
      lng: partial.longitude ?? 19.26,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Montenegro merge safety', () => {
  const me = ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const report = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/MONTENEGRO_MERGE_REPORT.json'),
      'utf8',
    ),
  ) as Record<string, any>;
  const approved = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/MONTENEGRO_APPROVED_FOR_MERGE.json'),
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
      path.join(__dirname, '../data/montenegro/MONTENEGRO_PHASE2_READY_TO_IMPORT.json'),
      'utf8',
    ),
  ) as Array<{id: string}>;
  const staging = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/montenegro_centers_staging.json'),
      'utf8',
    ),
  ) as Array<{id: string; import_category: string; name?: string; brand?: string}>;
  const idem = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/MONTENEGRO_MERGE_IDEMPOTENCY.json'),
      'utf8',
    ),
  ) as {second_run_insertions: number; final_catalog: number; montenegro: number};
  const dup = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/MONTENEGRO_MERGE_DUPLICATE_ANALYSIS.json'),
      'utf8',
    ),
  ) as {unexplained_hard_duplicates?: number};
  const rebrand = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/MONTENEGRO_PHASE2_REBRAND_MAP.json'),
      'utf8',
    ),
  ) as {unresolved_conflicts?: number};

  test('catalog 11831; Montenegro 26; live SHA; merge-report SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(me.length).toBe(EXPECTED_ME);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('me_')).length).toBe(EXPECTED_ME);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11749);
    expect(report.before.montenegro).toBe(0);
    expect(report.inserted).toBe(26);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(ME_MERGE_AFTER_TOTAL);
    expect(report.after.montenegro).toBe(EXPECTED_ME);
    expect(GYM_ID_PREFIX.montenegro).toBe('me_');
  });

  test('approved == phase2 READY == production IDs; SMI 26; Class A 0', () => {
    const prodIds = new Set(me.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(ready.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect(report.eligibility.CHAIN_CLASS_A).toBe(0);
    expect(report.eligibility.SMALL_MARKET_INDEPENDENT).toBe(26);
    expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(
      true,
    );
  });

  test('brand/estate gates + distinct identities', () => {
    expect(me.filter(c => c.brand === 'Benex Fitness').length).toBe(2);
    expect(me.filter(c => c.brand === 'Soko Gym').length).toBe(2);
    expect(me.filter(c => c.brand === 'Terzo').length).toBe(2);
    expect(me.filter(c => c.brand === 'Urban Gym').length).toBe(1);
    expect(me.filter(c => c.brand === 'GO GYM').length).toBe(1);
    expect(me.some(c => /Morača|Moraca/i.test(c.name))).toBe(true);
    expect(me.some(c => /Soko Gym City/i.test(c.name))).toBe(true);
    expect(me.filter(c => c.brand === 'City Fitness').length).toBe(1);
    expect(me.some(c => /Dom Revolucije/i.test(c.name))).toBe(true);
    expect(me.some(c => /Pete proleterske/i.test(c.name))).toBe(false);
    for (const brand of [
      'Positive Fitness',
      'Ethno Gym',
      'Fitness Original',
      'Big Body',
      'Maximus',
      'Sportski centar Berane',
      'Numero 77',
      'Matrix Gym',
      'Herkul Gym',
      'Strong Gym',
      'Čeličana',
      'The Capital Fitness Center',
      "Athletic's Gym",
      'XL Sport Studio',
      'Hulk Gym',
      'Gym Box',
      'Status Fitness',
    ]) {
      expect(me.filter(c => c.brand === brand).length).toBe(1);
    }
    const berane = me.find(c => c.brand === 'Sportski centar Berane');
    expect(
      approved.find(a => a.id === berane!.id)?.phase2_classification,
    ).toBe('A_PUBLIC_CONVENTIONAL_GYM');
  });

  test('DQ / exclusions / borders / duplicates / rebrands', () => {
    expect(new Set(me.map(c => c.id)).size).toBe(26);
    for (const c of me) {
      expect(c.id.startsWith('me_')).toBe(true);
      expect(MONTENEGRO_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleMontenegroCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FORBIDDEN_LIVE.test(`${c.name} ${c.brand}`)).toBe(false);
      expect(isMontenegroCountry(c.country)).toBe(true);
    }
    expect(me.filter(c => /Lady/i.test(c.name)).length).toBe(0);
    expect(dup.unexplained_hard_duplicates ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.exclusions.hotel_resort_leakage).toBe(0);
    expect(report.exclusions.specialist_leakage).toBe(0);
  });

  test('reconciliation 26/26/26/26; metadata NONE; prior countries', () => {
    const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
    expect(merged.length).toBe(26);
    expect(report.reconciliation.metadata_drift).toBe('NONE');
    for (const a of approved) {
      const live = me.find(c => c.id === a.id)!;
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(Number(live.lat)).toBe(Number(a.lat));
      expect(Number(live.lng)).toBe(Number(a.lng));
    }
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(new Set(ALL_GYM_CENTERS.map(c => c.id)).size).toBe(ALL_GYM_CENTERS.length);
  });

  test('idempotency; check-in 200; search/orphan smoke', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(ME_MERGE_AFTER_TOTAL);
    expect(idem.montenegro).toBe(EXPECTED_ME);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    const sample = me[0];
    const gym = findGymById(sample.id)!;
    expect(formatGymDisplayName(gym)).not.toMatch(/^me_/);
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
    expect(entry.haystack.toLowerCase()).toMatch(/montenegro|crna gora|podgorica|niksic|budva/);
    const stub = resolveGymOrStub('me_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Montenegro/i);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.verdict).toBe('MONTENEGRO MERGE COMPLETE — WAITING FOR QA');
  });
});
