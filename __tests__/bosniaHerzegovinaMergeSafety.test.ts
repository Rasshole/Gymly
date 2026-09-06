/**
 * Bosnia & Herzegovina production merge safety — post-merge catalog integrity.
 * Does NOT run full Bosnia Production QA.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBosniaHerzegovinaCoordinate,
  BOSNIA_HERZEGOVINA_POSTAL_RE,
  isBosniaHerzegovinaCountry,
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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s/;
const FORBIDDEN_LIVE =
  /\b(ALL4SPORT|Pro-Fit|Xtreme Gym|Power Gym|Active Life|Forma Plus|Sportski centar|Fit Zone|Active Mostar|CrossFit|Pilates|Hotel amenity|School gym)\b/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_BA = 31;
const PRE_MERGE_SHA =
  '6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112';
const POST_MERGE_SHA =
  '5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const ALL_IN_IDS = ['ba_0ace57c4b2', 'ba_383806522f', 'ba_0bf4cc7be5'];
const KRON_IDS = ['ba_4b2b262dac', 'ba_234269c33b', 'ba_fbb6ab9577', 'ba_6e8f727eb6'];
const SARAJEVO_IDS = [
  'ba_0ace57c4b2',
  'ba_383806522f',
  'ba_0bf4cc7be5',
  'ba_fa6f3c8b99',
  'ba_f63cafd3fe',
  'ba_e6bae3c12c',
  'ba_760fbe82ce',
  'ba_d705f4fca7',
  'ba_605d38b631',
  'ba_5fd8cc9b20',
];
const FORBIDDEN_IDS = [
  'ba_57da7dd70d',
  'ba_69162d2178',
  'ba_78f8ad5126',
  'ba_d8a16be7ac',
  'ba_e6ba48931b',
  'ba_327db3a237',
  'ba_3b9800cdd0',
  'ba_cced171393',
  'ba_68ec8f2d3d',
  'ba_5ddab9c740',
];

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Sarajevo',
    address: partial.address ?? 'Ferhadija 1',
    postalCode: partial.postalCode ?? '71000',
    country: 'Bosnia and Herzegovina',
    region: 'Bosnia and Herzegovina',
    latitude: partial.latitude ?? 43.8563,
    longitude: partial.longitude ?? 18.4131,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Ferhadija 1',
      postal_code: partial.postalCode ?? '71000',
      city: partial.city ?? 'Sarajevo',
      country: 'Bosnia and Herzegovina',
      lat: partial.latitude ?? 43.8563,
      lng: partial.longitude ?? 18.4131,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Bosnia & Herzegovina merge safety', () => {
  const ba = ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const report = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_MERGE_REPORT.json'),
      'utf8',
    ),
  ) as Record<string, any>;
  const approved = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_APPROVED_FOR_MERGE.json'),
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
      path.join(
        __dirname,
        '../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_READY_TO_IMPORT.json',
      ),
      'utf8',
    ),
  ) as Array<{id: string}>;
  const staging = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/bosnia-herzegovina/bosnia_herzegovina_centers_staging.json'),
      'utf8',
    ),
  ) as Array<{id: string; import_category: string; name?: string; brand?: string; city?: string}>;
  const idem = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_MERGE_IDEMPOTENCY.json'),
      'utf8',
    ),
  ) as {second_run_insertions: number; final_catalog: number; bosnia_herzegovina?: number};
  const dup = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_MERGE_DUPLICATE_ANALYSIS.json',
      ),
      'utf8',
    ),
  ) as {unexplained_hard_duplicates?: number};
  const rebrand = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_REBRAND_MAP.json',
      ),
      'utf8',
    ),
  ) as {unresolved_conflicts?: number};

  test('catalog 11831; Bosnia 31; SHA chain', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(ba.length).toBe(EXPECTED_BA);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ba_')).length).toBe(EXPECTED_BA);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_CATALOG_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11800);
    expect(report.before.bosnia_herzegovina).toBe(0);
    expect(report.inserted).toBe(31);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(11831);
    expect(report.after.bosnia_herzegovina).toBe(EXPECTED_BA);
    expect(GYM_ID_PREFIX.bosniaHerzegovina).toBe('ba_');
  });

  test('approved == phase2 READY == production IDs; Class A 7; SMI 24', () => {
    const prodIds = new Set(ba.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(ready.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect(report.eligibility?.CHAIN_CLASS_A).toBe(7);
    expect(report.eligibility?.SMALL_MARKET_INDEPENDENT).toBe(24);
    expect(approved.filter(a => a.eligibility_path === 'CHAIN_CLASS_A').length).toBe(7);
    expect(approved.filter(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT').length).toBe(24);
  });

  test('ALL IN ×3; Kron ×4; Sarajevo 10; city gates', () => {
    for (const id of ALL_IN_IDS) {
      expect(ba.some(c => c.id === id && c.brand === 'ALL IN FITNESS')).toBe(true);
    }
    for (const id of KRON_IDS) {
      expect(ba.some(c => c.id === id && c.brand === 'Kron Fitness')).toBe(true);
    }
    expect(ba.filter(c => c.city === 'Sarajevo').map(c => c.id).sort()).toEqual(
      [...SARAJEVO_IDS].sort(),
    );
    expect(ba.filter(c => c.city === 'Banja Luka').length).toBe(3);
    expect(ba.filter(c => c.city === 'Mostar').length).toBe(2);
    expect(ba.filter(c => c.city === 'Istočno Sarajevo').length).toBe(1);
    expect(ba.filter(c => c.city === 'Tuzla').length).toBe(2);
    expect(ba.find(c => c.id === 'ba_4b2b262dac')?.city).toBe('Tuzla');
    expect(ba.find(c => c.id === 'ba_234269c33b')?.city).toBe('Živinice');
    expect(approved.find(a => a.id === 'ba_fa6f3c8b99')?.phase2_classification).toBe(
      'WELLNESS_ADDITIVE',
    );
    for (const id of FORBIDDEN_IDS) {
      expect(ba.some(c => c.id === id)).toBe(false);
    }
    for (const city of ['Gradačac', 'Lukavac', 'Visoko', 'Konjic', 'Bugojno', 'Jajce', 'Livno']) {
      expect(ba.filter(c => c.city === city).length).toBe(0);
    }
  });

  test('DQ / exclusions / borders / duplicates / rebrands', () => {
    expect(new Set(ba.map(c => c.id)).size).toBe(31);
    for (const c of ba) {
      expect(c.id.startsWith('ba_')).toBe(true);
      expect(BOSNIA_HERZEGOVINA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleBosniaHerzegovinaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FORBIDDEN_LIVE.test(`${c.name} ${c.brand}`)).toBe(false);
      expect(isBosniaHerzegovinaCountry(c.country)).toBe(true);
    }
    expect(dup.unexplained_hard_duplicates ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.exclusions?.municipal_leakage ?? 0).toBe(0);
    expect(report.exclusions?.hotel_spa_leakage ?? 0).toBe(0);
    expect(report.cross_border?.croatia_ready ?? 0).toBe(0);
    expect(report.cross_border?.serbia_ready ?? 0).toBe(0);
    expect(report.cross_border?.montenegro_ready ?? 0).toBe(0);
  });

  test('reconciliation 31/31/31/31; metadata NONE; prior countries', () => {
    const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
    expect(merged.length).toBe(31);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(report.reconciliation?.metadata_drift ?? 'NONE').toBe('NONE');
    for (const a of approved) {
      const live = ba.find(c => c.id === a.id)!;
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(Number(live.lat)).toBe(Number(a.lat));
      expect(Number(live.lng)).toBe(Number(a.lng));
    }
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
    expect(idem.bosnia_herzegovina ?? EXPECTED_BA).toBe(EXPECTED_BA);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    const sample = ba[0];
    const gym = findGymById(sample.id)!;
    expect(formatGymDisplayName(gym)).not.toMatch(/^ba_/);
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
    expect(entry.haystack.toLowerCase()).toMatch(
      /bosnia|bih|sarajevo|сарајевo|hercegovina/,
    );

    const baGyms = getActiveGymsByCountry('Bosnia and Herzegovina');
    expect(baGyms.length).toBe(31);
    const markers = baGyms.map(g => ({
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
        latitude: 43.85,
        longitude: 18.4,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }).length,
    ).toBeGreaterThan(5);

    for (const [lat, lng] of [
      [43.8563, 18.4131],
      [44.7722, 17.191],
      [44.538, 18.676],
      [43.3438, 17.8078],
      [44.203, 17.908],
    ] as Array<[number, number]>) {
      const nearest = findNearestGym(lat, lng, baGyms);
      expect(nearest?.id.startsWith('ba_')).toBe(true);
      expect(nearest?.country).toBe('Bosnia and Herzegovina');
    }

    const stub = resolveGymOrStub('ba_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Bosnia/i);
    expect(report.architecture ?? 'KEEP CLIENT-SIDE').toBe('KEEP CLIENT-SIDE');
    expect(report.crosses_12500 ?? false).toBe(false);
    expect(report.global_stress_qa_required ?? false).toBe(false);
    expect(report.verdict).toBe('BOSNIA & HERZEGOVINA MERGE COMPLETE — WAITING FOR QA');
  });
});
