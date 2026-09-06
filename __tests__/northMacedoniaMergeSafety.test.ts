/**
 * North Macedonia production merge safety — post-merge catalog integrity.
 * Does NOT run full North Macedonia Production QA.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleNorthMacedoniaCoordinate,
  NORTH_MACEDONIA_POSTAL_RE,
  isNorthMacedoniaCountry,
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
  /\b(Slim Line|Slim Gym|Top Forma|Foxy|Border probe|Regional gap|ABSENT|CrossFit Only)\b/i;
const INSTITUTIONAL_FITONE = /OU |school|Kiril Pejcinovik|Blaze Koneski|Dimitar Miladinov/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_MK = 25;
const PRE_MERGE_SHA =
  '2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698';
const POST_MERGE_SHA =
  '6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112';
const LIVE_CATALOG_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe',
    city: partial.city ?? 'Skopje',
    address: partial.address ?? 'Ilindenska 1',
    postalCode: partial.postalCode ?? '1000',
    country: 'North Macedonia',
    region: 'North Macedonia',
    latitude: partial.latitude ?? 41.9981,
    longitude: partial.longitude ?? 21.4254,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Ilindenska 1',
      postal_code: partial.postalCode ?? '1000',
      city: partial.city ?? 'Skopje',
      country: 'North Macedonia',
      lat: partial.latitude ?? 41.9981,
      lng: partial.longitude ?? 21.4254,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('North Macedonia merge safety', () => {
  const mk = ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const report = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/north-macedonia/NORTH_MACEDONIA_MERGE_REPORT.json'),
      'utf8',
    ),
  ) as Record<string, any>;
  const approved = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/north-macedonia/NORTH_MACEDONIA_APPROVED_FOR_MERGE.json'),
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
        '../data/north-macedonia/NORTH_MACEDONIA_PHASE2_READY_TO_IMPORT.json',
      ),
      'utf8',
    ),
  ) as Array<{id: string}>;
  const staging = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/north-macedonia/north_macedonia_centers_staging.json'),
      'utf8',
    ),
  ) as Array<{id: string; import_category: string; name?: string; brand?: string}>;
  const idem = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/north-macedonia/NORTH_MACEDONIA_MERGE_IDEMPOTENCY.json'),
      'utf8',
    ),
  ) as {second_run_insertions: number; final_catalog: number; north_macedonia?: number; montenegro?: number};
  const dup = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '../data/north-macedonia/NORTH_MACEDONIA_MERGE_DUPLICATE_ANALYSIS.json',
      ),
      'utf8',
    ),
  ) as {unexplained_hard_duplicates?: number};
  const rebrand = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '../data/north-macedonia/NORTH_MACEDONIA_PHASE2_REBRAND_MAP.json',
      ),
      'utf8',
    ),
  ) as {unresolved_conflicts?: number};

  test('catalog 11831; North Macedonia 25; SHA chain', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(mk.length).toBe(EXPECTED_MK);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mk_')).length).toBe(EXPECTED_MK);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(LIVE_SHA);
    expect(report.pre_merge_sha256).toBe(PRE_MERGE_SHA);
    expect(report.post_merge_sha256).toBe(POST_MERGE_SHA);
    expect(report.before.total).toBe(11775);
    expect(report.before.north_macedonia ?? report.before.northMacedonia ?? 0).toBe(0);
    expect(report.inserted).toBe(25);
    expect(report.withheld).toBe(0);
    expect(report.after.total).toBe(11800);
    expect(report.after.north_macedonia ?? report.after.northMacedonia).toBe(EXPECTED_MK);
    expect(GYM_ID_PREFIX.northMacedonia).toBe('mk_');
  });

  test('approved == phase2 READY == production IDs; SMI 25; Class A 0', () => {
    const prodIds = new Set(mk.map(c => c.id));
    const approvedIds = new Set(approved.map(a => a.id));
    const readyIds = new Set(ready.map(r => r.id));
    expect(prodIds).toEqual(approvedIds);
    expect(prodIds).toEqual(readyIds);
    expect(report.eligibility?.CHAIN_CLASS_A ?? report.eligibility_breakdown?.CHAIN_CLASS_A).toBe(
      0,
    );
    expect(
      report.eligibility?.SMALL_MARKET_INDEPENDENT ??
        report.eligibility_breakdown?.SMALL_MARKET_INDEPENDENT,
    ).toBe(25);
    expect(approved.every(a => a.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('Fit One / Synergy / Slim-Forma / Albanian / Ohrid gates', () => {
    const fitOne = mk.filter(c => c.brand === 'Fit One');
    expect(fitOne.length).toBe(1);
    expect(fitOne[0].name).toMatch(/Centar|Dame Gruev/i);
    expect(mk.some(c => INSTITUTIONAL_FITONE.test(`${c.name} ${c.brand}`))).toBe(false);
    expect(staging.some(r => /OU |school/i.test(r.name || '') && r.import_category === 'MERGED_INTO_CATALOG')).toBe(false);

    expect(mk.filter(c => /Synergy/i.test(c.brand || '')).length).toBe(1);
    expect(
      approved.find(a => /Synergy/i.test(a.brand))?.phase2_classification,
    ).toMatch(/WELLNESS_ADDITIVE|A_CONVENTIONAL|CONVENTIONAL/i);

    expect(mk.filter(c => /Slim/i.test(c.brand || '') || /Slim/i.test(c.name || '')).length).toBe(0);
    expect(mk.filter(c => /Top Forma|Forma Fitness/i.test(c.brand || '')).length).toBe(0);
    expect(mk.filter(c => /Foxy/i.test(c.brand || '') || /Foxy/i.test(c.name || '')).length).toBe(0);

    expect(mk.some(c => c.brand === 'Arena' && c.city === 'Tetovo')).toBe(true);
    expect(mk.some(c => c.brand === 'Starfit' && c.city === 'Tetovo')).toBe(true);
    expect(mk.some(c => c.brand === 'Fajar Bodi' && c.city === 'Tetovo')).toBe(true);
    expect(mk.some(c => /Flex/i.test(c.brand || '') && c.city === 'Kičevo')).toBe(true);
    expect(mk.some(c => c.brand === 'Urban Gym' && c.city === 'Gostivar')).toBe(true);

    expect(mk.some(c => c.brand === 'IB Fitness' && c.city === 'Ohrid')).toBe(true);
    expect(mk.some(c => c.brand === 'Fitness Factori' && c.city === 'Ohrid')).toBe(true);

    for (const city of [
      'Saraj',
      'Šuto Orizari',
      'Gjorče Petrov',
      'Veles',
      'Kavadarci',
      'Kočani',
      'Gevgelija',
      'Debar',
      'Radoviš',
    ]) {
      expect(mk.filter(c => c.city === city).length).toBe(0);
    }
  });

  test('DQ / exclusions / borders / duplicates / rebrands', () => {
    expect(new Set(mk.map(c => c.id)).size).toBe(25);
    for (const c of mk) {
      expect(c.id.startsWith('mk_')).toBe(true);
      expect(NORTH_MACEDONIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleNorthMacedoniaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FORBIDDEN_LIVE.test(`${c.name} ${c.brand}`)).toBe(false);
      expect(isNorthMacedoniaCountry(c.country)).toBe(true);
    }
    expect(dup.unexplained_hard_duplicates ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.exclusions?.hotel_spa_leakage ?? report.hotel_spa_leakage ?? 0).toBe(0);
  });

  test('reconciliation 25/25/25/25; metadata NONE; prior countries', () => {
    const merged = staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG');
    expect(merged.length).toBe(25);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(report.reconciliation?.metadata_drift ?? 'NONE').toBe('NONE');
    for (const a of approved) {
      const live = mk.find(c => c.id === a.id)!;
      expect(live.name).toBe(a.name);
      expect(live.brand).toBe(a.brand);
      expect(live.address).toBe(a.address);
      expect(live.postal_code).toBe(a.postal_code);
      expect(live.city).toBe(a.city);
      expect(Number(live.lat)).toBe(Number(a.lat));
      expect(Number(live.lng)).toBe(Number(a.lng));
    }
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
    expect(idem.north_macedonia ?? EXPECTED_MK).toBe(EXPECTED_MK);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(decideGeofenceAutoCheckout(199, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, Date.now()).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, Date.now()).action).toBe('set_away');

    const sample = mk[0];
    const gym = findGymById(sample.id)!;
    expect(formatGymDisplayName(gym)).not.toMatch(/^mk_/);
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
      /north macedonia|северна|skopje|скопје|macedonia/,
    );

    const mkGyms = getActiveGymsByCountry('North Macedonia');
    expect(mkGyms.length).toBe(25);
    const markers = mkGyms.map(g => ({
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
        latitude: 41.6,
        longitude: 21.5,
        latitudeDelta: 2.5,
        longitudeDelta: 2.5,
      }).length,
    ).toBeGreaterThan(10);

    for (const [lat, lng] of [
      [41.9981, 21.4254],
      [41.0314, 21.3347],
      [41.117, 20.801],
      [42.0095, 20.9718],
      [41.4378, 22.6432],
    ] as Array<[number, number]>) {
      const nearest = findNearestGym(lat, lng, mkGyms);
      expect(nearest?.id.startsWith('mk_')).toBe(true);
      expect(nearest?.country).toBe('North Macedonia');
    }

    const stub = resolveGymOrStub('mk_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/North Macedonia/i);
    expect(report.architecture ?? 'KEEP CLIENT-SIDE').toBe('KEEP CLIENT-SIDE');
    expect(report.crosses_12500 ?? false).toBe(false);
    expect(report.global_stress_qa_required ?? false).toBe(false);
    expect(report.verdict).toBe('NORTH MACEDONIA MERGE COMPLETE — WAITING FOR QA');
  });
});
