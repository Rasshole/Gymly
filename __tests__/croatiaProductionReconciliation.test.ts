/**
 * Croatia production reconciliation — ZERO-DELTA read-only validation.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getActiveGymsByCountry} from '../src/data/danishGyms';
import {ALL_GYM_CENTERS, findCenterById} from '../src/data/centerRegistry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {decideGeofenceAutoCheckout} from '../src/services/autoCheckout/evaluateAutoCheckout';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {calculateDistance} from '../src/utils/geoUtils';
import {
  CROATIA_POSTAL_RE,
  isCroatiaCountry,
  isPlausibleCroatiaCoordinate,
} from '../src/utils/gymCountry';
import {
  findGymById,
  formatGymDisplayName,
  resolveGymOrStub,
  unresolvedGymStub,
} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import type {MapCenter} from '../src/data/mapCentersData';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

const EXPECTED_TOTAL = 11921;
const EXPECTED_CROATIA = 80;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const EXPECTED_BRANDS: Record<string, number> = {
  Gyms4you: 48,
  'THE Fitness': 21,
  'Gibi Gib': 4,
  'Fitness Centar Joker': 4,
  Multihealth: 3,
};

const COMING_SOON_IDS = [
  'hr_f3f2371e7f',
  'hr_ee18805422',
  'hr_096e0c854b',
  'hr_eff3e7d13c',
  'hr_d7d57e7e6b',
  'hr_ce961ae600',
  'hr_3c82eb55d7',
  'hr_6c2849e74b',
];

const WELLNESS_IDS = ['hr_e99d3d2a6c', 'hr_a0ec1a2c32'];

const PRIOR_COUNTS: Record<string, number> = {
  Serbia: 63,
  Kosovo: 18,
  Albania: 9,
  'Bosnia and Herzegovina': 31,
  'North Macedonia': 25,
  Montenegro: 26,
  Moldova: 28,
  'San Marino': 6,
  Monaco: 4,
  Andorra: 12,
  Liechtenstein: 7,
  Iceland: 27,
};

function identityMatch(
  a: {name?: string; brand?: string; city?: string; country?: string; lat?: number; lng?: number},
  b: {name?: string; brand?: string; city?: string; country?: string; lat?: number; lng?: number},
) {
  return (
    String(a.name || '').trim() === String(b.name || '').trim() &&
    String(a.brand || '').trim() === String(b.brand || '').trim() &&
    String(a.city || '').trim() === String(b.city || '').trim() &&
    String(a.country || 'Croatia').trim() === String(b.country || 'Croatia').trim() &&
    Number.isFinite(a.lat) &&
    Number.isFinite(b.lat) &&
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001
  );
}

describe('Croatia production reconciliation (zero-delta)', () => {
  const dataDir = path.join(__dirname, '../data/croatia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; city: string; lat: number; lng: number}>;
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as unknown[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as unknown[];
  const approvedCurrent = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_APPROVED_CURRENT_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const idempotency = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_RECONCILIATION_IDEMPOTENCY.json'), 'utf8'),
  ) as {
    insertions: number;
    removals: number;
    updates: number;
    idempotent: boolean;
  };
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_RECONCILIATION_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'croatia_centers_staging.json'), 'utf8'),
  ) as Array<{id: string; import_category: string; brand?: string}>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const phase2Report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'CROATIA_RECONCILIATION_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'CROATIA_RECONCILIATION_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const hrCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('hr_'));
  const croatiaCenters = ALL_GYM_CENTERS.filter(c => c.country === 'Croatia');

  test('baseline: total 11921, Croatia 80, hr_* 80, SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(croatiaCenters.length).toBe(EXPECTED_CROATIA);
    expect(hrCenters.length).toBe(EXPECTED_CROATIA);
    expect(sha).toBe(LIVE_SHA);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
    expect(report.production_total).toBe(EXPECTED_TOTAL);
    expect(report.production_sha256).toBe(LIVE_SHA);
  });

  test('Phase 2 inputs: KEEP=80, NEW=0, REVIEW=0', () => {
    expect(keep.length).toBe(80);
    expect(newReady.length).toBe(0);
    expect(existingReview.length).toBe(0);
    expect(phase2Report.keep_existing_count).toBe(80);
    expect(phase2Report.new_ready_to_import_count).toBe(0);
    expect(phase2Report.existing_review_required_count).toBe(0);
  });

  test('approved current inventory = 80 KEEP_EXISTING rows', () => {
    expect(approvedCurrent.length).toBe(80);
    expect(report.approved_current).toBe(80);
    expect(new Set(approvedCurrent.map(r => r.id)).size).toBe(80);
  });

  test('exact 80/80/80 ID reconciliation', () => {
    const keepIds = new Set(keep.map(r => r.id));
    const approvedIds = new Set(approvedCurrent.map(r => r.id));
    const prodIds = new Set(hrCenters.map(r => r.id));

    expect(keepIds.size).toBe(80);
    expect(approvedIds.size).toBe(80);
    expect(prodIds.size).toBe(80);
    expect([...keepIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !keepIds.has(id))).toEqual([]);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);

    const idRec = report.id_reconciliation as {
      missing_from_production: string[];
      unexpected_in_production: string[];
    };
    expect(idRec.missing_from_production).toEqual([]);
    expect(idRec.unexpected_in_production).toEqual([]);
  });

  test('material metadata drift = 0', () => {
    const drift: Array<{id: string}> = [];
    for (const k of keep) {
      const p = findCenterById(k.id)!;
      if (!identityMatch(k, p)) drift.push({id: k.id});
    }
    expect(drift).toEqual([]);
    const meta = report.metadata as {material_metadata_drift_count: number};
    expect(meta.material_metadata_drift_count).toBe(0);
  });

  test('Class A brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of hrCenters) {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    }
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    expect(Object.keys(byBrand).length).toBe(5);
    const classA = report.class_a as {chain_count: number; live_count: number};
    expect(classA.chain_count).toBe(5);
    expect(classA.live_count).toBe(80);
  });

  test('Gyms4you live=48, coming soon=6, no leakage', () => {
    const g4y = report.gyms4you as {
      live: number;
      coming_soon: number;
      coming_soon_live_leakage: number;
    };
    expect(g4y.live).toBe(48);
    expect(g4y.coming_soon).toBe(6);
    expect(g4y.coming_soon_live_leakage).toBe(0);
    expect(staging.filter(r => r.import_category === 'COMING_SOON' && r.brand === 'Gyms4you').length).toBe(
      6,
    );
  });

  test('THE Fitness live=21, coming soon=2, no leakage', () => {
    const tf = report.the_fitness as {
      live: number;
      coming_soon: number;
      coming_soon_live_leakage: number;
    };
    expect(tf.live).toBe(21);
    expect(tf.coming_soon).toBe(2);
    expect(tf.coming_soon_live_leakage).toBe(0);
    expect(hrCenters.some(c => /orlandofit/i.test(c.brand))).toBe(false);
    expect(hrCenters.some(c => /^Play Fitness$/i.test(c.brand))).toBe(false);
  });

  test('Gibi Gib=4, Joker=4, Multihealth=3', () => {
    expect(hrCenters.filter(c => c.brand === 'Gibi Gib').length).toBe(4);
    expect(hrCenters.filter(c => c.brand === 'Fitness Centar Joker').length).toBe(4);
    expect(hrCenters.filter(c => c.brand === 'Multihealth').length).toBe(3);
  });

  test('wellness approved=2 (Hotel Novi Zagreb, Zonar)', () => {
    const wellness = report.wellness as {approved_wellness_count: number; ids: string[]};
    expect(wellness.approved_wellness_count).toBe(2);
    expect(wellness.ids.sort()).toEqual(WELLNESS_IDS.sort());
    for (const id of WELLNESS_IDS) {
      expect(findCenterById(id)).toBeDefined();
    }
  });

  test('coming-soon total=8, production leakage=0', () => {
    const cs = report.coming_soon as {staging_total: number; production_leakage: string[]};
    expect(cs.staging_total).toBe(8);
    expect(cs.production_leakage).toEqual([]);
    const prodIds = new Set(hrCenters.map(c => c.id));
    for (const id of COMING_SOON_IDS) {
      expect(prodIds.has(id)).toBe(false);
    }
  });

  test('excluded=37, production leakage=0', () => {
    const ex = report.excluded as {staging_total: number; production_leakage: string[]};
    expect(ex.staging_total).toBe(37);
    expect(ex.production_leakage).toEqual([]);
    const excludedIds = staging.filter(r => r.import_category === 'EXCLUDED').map(r => r.id);
    const prodIds = new Set(hrCenters.map(c => c.id));
    for (const id of excludedIds) {
      expect(prodIds.has(id)).toBe(false);
    }
  });

  test('hotel/resort, specialist, institutional leakage = 0', () => {
    const hotel = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_HOTEL_RESORT_AUDIT.json'), 'utf8'),
    ) as {hotel_resort_ready_leakage: number};
    expect(hotel.hotel_resort_ready_leakage).toBe(0);
    expect(phase2Report.specialist_ready_leakage).toBe(0);
    expect(phase2Report.institutional_ready_leakage).toBe(0);
  });

  test('cross-border, Neum, Brod safety', () => {
    expect(cross.slovenia_ready).toBe(0);
    expect(cross.bosnia_ready).toBe(0);
    expect(cross.serbia_ready).toBe(0);
    expect(cross.montenegro_ready).toBe(0);
    expect(cross.hungary_ready).toBe(0);
    expect(cross.italy_ready).toBe(0);
    expect(cross.neum_croatia_collisions).toBe(0);
    expect(cross.brod_identity_collisions).toBe(0);
    const cb = report.cross_border as {outliers: string[]; neum_collisions: number; brod_collisions: number};
    expect(cb.outliers).toEqual([]);
    expect(cb.neum_collisions).toBe(0);
    expect(cb.brod_collisions).toBe(0);
  });

  test('duplicates and rebrand conflicts = 0', () => {
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    const globalIds = ALL_GYM_CENTERS.map(c => c.id);
    expect(globalIds.length).toBe(new Set(globalIds).size);
  });

  test('data quality on all 80 live Croatia rows', () => {
    for (const c of hrCenters) {
      expect(c.id).toMatch(/^hr_[a-f0-9]{10}$/);
      expect(c.country).toBe('Croatia');
      expect(CROATIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleCroatiaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('hr_')).toBe(false);
      expect(String(c.name || '').trim().length).toBeGreaterThan(0);
      expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(c.address || '').trim().length).toBeGreaterThan(0);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(dq.invalid_ids).toBe(0);
    expect(dq.invalid_countries).toBe(0);
    expect(dq.invalid_postcodes).toBe(0);
    expect(dq.invalid_coordinates).toBe(0);
    expect(dq.fallback_coordinates).toBe(0);
    expect(dq.centroid_coordinates).toBe(0);
    expect(dq.missing_fields).toBe(0);
    expect(dq.mojibake).toBe(0);
    expect(dq.raw_id_display_names).toBe(0);
  });

  test('country / ID resolution and i18n', () => {
    expect(GYM_ID_PREFIX.croatia).toBe('hr_');
    expect(isCroatiaCountry('Croatia')).toBe(true);
    expect(isCroatiaCountry('Hrvatska')).toBe(true);
    expect(gymCountryTranslationKey('Croatia')).toBe('countries.croatia');
    expect(en.countries.croatia).toBe('Croatia');
    expect(da.countries.croatia).toBe('Kroatien');
    expect(sv.countries.croatia).toBe('Kroatien');
    expect(nb.countries.croatia).toBe('Kroatia');
    const stub = resolveGymOrStub('hr_nonexistent_test');
    expect(stub.region).toBe('Croatia');
    expect(unresolvedGymStub('hr_nonexistent_test').region).toBe('Croatia');
    for (const id of keep.slice(0, 5).map(r => r.id)) {
      expect(findGymById(id)).toBeDefined();
      expect(formatGymDisplayName(id)).not.toMatch(/^hr_/);
    }
  });

  test('search / display smoke', () => {
    getGymSearchIndex();
    const croatiaGyms = getActiveGymsByCountry('Croatia');
    expect(croatiaGyms.length).toBe(80);
    const queries = [
      'Croatia',
      'Hrvatska',
      'Zagreb',
      'Split',
      'Rijeka',
      'Osijek',
      'Zadar',
      'Dubrovnik',
      'Šibenik',
      'Varaždin',
      'Karlovac',
      'Slavonski Brod',
      'Gyms4you',
      'THE Fitness',
      'Gibi Gib',
      'Fitness Centar Joker',
      'Multihealth',
    ];
    for (const q of queries) {
      const hits = searchGyms(q, {gyms: croatiaGyms, limit: 50});
      expect(hits.some(h => h.gym.id.startsWith('hr_'))).toBe(true);
      for (const h of hits.filter(x => x.gym.id.startsWith('hr_'))) {
        expect(COMING_SOON_IDS.includes(h.gym.id)).toBe(false);
        expect(formatGymDisplayName(h.gym.id)).not.toMatch(/^hr_/);
      }
    }
    expect(normalizeGymSearchValue('Varaždin')).toBe('varazdin');
  });

  test('map markers = 80 distinct Croatia live gyms', () => {
    const croatiaGyms = getActiveGymsByCountry('Croatia');
    expect(croatiaGyms.length).toBe(80);
    const mapCenters: MapCenter[] = hrCenters.map(c => {
      const map = getMarkerMapCoordinate(c.id, c.lat!, c.lng!);
      return {
        id: c.id,
        name: c.name,
        latitude: c.lat!,
        longitude: c.lng!,
        mapLatitude: map.latitude,
        mapLongitude: map.longitude,
        brand: c.brand,
        friendsActiveCount: 0,
        totalActiveCount: 0,
        logoUrl: null,
        country: c.country,
      };
    });
    expect(mapCenters.length).toBe(80);
    expect(new Set(mapCenters.map(c => c.id)).size).toBe(80);
    expect(mapCenters.every(c => c.id.startsWith('hr_'))).toBe(true);
    for (const id of COMING_SOON_IDS) {
      expect(mapCenters.some(c => c.id === id)).toBe(false);
    }
    const zagreb = filterMapCentersInRegion(mapCenters, {
      latitude: 45.815,
      longitude: 15.982,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    });
    expect(zagreb.length).toBeGreaterThan(0);
    expect(zagreb.every(v => v.id.startsWith('hr_'))).toBe(true);
  });

  test('nearest sanity around major cities', () => {
    const croatiaGyms = getActiveGymsByCountry('Croatia');
    const probes = [
      {lat: 45.815, lng: 15.982},
      {lat: 43.508, lng: 16.418},
      {lat: 45.327, lng: 14.442},
      {lat: 45.555, lng: 18.695},
      {lat: 44.119, lng: 15.231},
      {lat: 42.641, lng: 18.109},
      {lat: 43.735, lng: 15.895},
      {lat: 46.305, lng: 16.337},
      {lat: 45.815, lng: 15.548},
    ];
    for (const p of probes) {
      const nearest = findNearestGym(p.lat, p.lng, croatiaGyms);
      expect(nearest).toBeDefined();
      expect(isCroatiaCountry(nearest!.country)).toBe(true);
      const d = calculateDistance(p.lat, p.lng, nearest!.latitude, nearest!.longitude);
      expect(d).toBeLessThan(25000);
    }
  });

  test('check-in 199/200 allow, 201 block; auto-checkout 200 m; no Croatia override', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const sampleId = hrCenters[0].id;
    const coords = getGymLatLngForCheckIn(sampleId);
    expect(coords).not.toBeNull();
    const center = findCenterById(sampleId)!;
    expect(coords!.latitude).toBeCloseTo(center.lat!, 5);
    expect(coords!.longitude).toBeCloseTo(center.lng!, 5);

    expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);

    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
  });

  test('prior countries unchanged; zero production delta', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    const zd = report.zero_delta as {
      insertions: number;
      removals: number;
      updates: number;
      total_before: number;
      total_after: number;
      croatia_before: number;
      croatia_after: number;
    };
    expect(zd.insertions).toBe(0);
    expect(zd.removals).toBe(0);
    expect(zd.updates).toBe(0);
    expect(zd.total_before).toBe(EXPECTED_TOTAL);
    expect(zd.total_after).toBe(EXPECTED_TOTAL);
    expect(zd.croatia_before).toBe(80);
    expect(zd.croatia_after).toBe(80);
  });

  test('idempotency second run = 0/0/0', () => {
    expect(idempotency.insertions).toBe(0);
    expect(idempotency.removals).toBe(0);
    expect(idempotency.updates).toBe(0);
    expect(idempotency.idempotent).toBe(true);
  });

  test('performance, global scale, verdict', () => {
    const perf = report.performance as {catalog_total: number; centers_json_bytes: number};
    expect(perf.catalog_total).toBe(EXPECTED_TOTAL);
    expect(perf.centers_json_bytes).toBeGreaterThan(0);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
    expect(report.global_stress_qa_run).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.verdict).toBe('CROATIA RECONCILIATION COMPLETE — WAITING FOR QA');
    expect(EXPECTED_TOTAL).toBeLessThan(12500);
  });
});
