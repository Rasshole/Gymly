/**
 * Croatia Production QA — final read-only validation gate.
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
} from '../src/utils/gymDisplay';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {getGymLatLngForCheckIn} from '../src/utils/gymCoordinatesForCheckIn';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';
import {getMarkerMapCoordinate} from '../src/utils/centerMapJitter';
import type {MapCenter} from '../src/data/mapCentersData';
import {findNearestGym} from '../src/utils/nearestGym';
import en from '../src/i18n/translations/en';

const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const EXPECTED_TOTAL = 11921;
const EXPECTED_CROATIA = 80;

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

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;

describe('Croatia Production QA (final)', () => {
  const dataDir = path.join(__dirname, '../data/croatia');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const qaReport = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PRODUCTION_QA_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const historicalDebt = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_QA_HISTORICAL_TEST_DEBT.json'), 'utf8'),
  ) as {
    summary: {
      REAL_COUNTRY_REGRESSIONS: number;
      STALE_TOTAL_FAILURES: number;
      HISTORICAL_SUITES_FAILED: number;
    };
    prior_country_verification: {regressions: unknown[]};
  };
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Array<{id: string; brand: string; name: string; city: string; lat: number; lng: number}>;
  const approved = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_APPROVED_CURRENT_PRODUCTION.json'), 'utf8'),
  ) as Array<{id: string}>;
  const reconciliation = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PRODUCTION_RECONCILIATION_REPORT.json'), 'utf8'),
  ) as {zero_delta: {insertions: number; removals: number; updates: number}};
  const perf = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'CROATIA_PRODUCTION_QA_PERF.json'), 'utf8'),
  ) as {catalog_total: number; assessment: string; architecture: string; crosses_12500: boolean};

  const shaBefore = fs
    .readFileSync(path.join(dataDir, 'CROATIA_PRODUCTION_QA_SHA_BEFORE.txt'), 'utf8')
    .trim();
  const shaAfter = fs
    .readFileSync(path.join(dataDir, 'CROATIA_PRODUCTION_QA_SHA_AFTER.txt'), 'utf8')
    .trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  const hrCenters = ALL_GYM_CENTERS.filter(c => c.id.startsWith('hr_'));

  test('frozen production baseline and QA SHA', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(hrCenters.length).toBe(EXPECTED_CROATIA);
    expect(sha).toBe(LIVE_SHA);
    expect(shaBefore).toBe(LIVE_SHA);
    expect(shaAfter).toBe(LIVE_SHA);
    expect(qaReport.production_modified).toBe(false);
  });

  test('authoritative inventory 80/80/80 exact ID equality', () => {
    expect(keep.length).toBe(80);
    expect(approved.length).toBe(80);
    const keepIds = new Set(keep.map(r => r.id));
    const approvedIds = new Set(approved.map(r => r.id));
    const prodIds = new Set(hrCenters.map(r => r.id));
    expect([...keepIds].filter(id => !prodIds.has(id))).toEqual([]);
    expect([...prodIds].filter(id => !keepIds.has(id))).toEqual([]);
    expect([...approvedIds].filter(id => !prodIds.has(id))).toEqual([]);
    const inv = qaReport.inventory as {material_metadata_drift: unknown[]};
    expect(inv.material_metadata_drift).toEqual([]);
  });

  test('zero-delta reconciliation remains idempotent', () => {
    expect(reconciliation.zero_delta.insertions).toBe(0);
    expect(reconciliation.zero_delta.removals).toBe(0);
    expect(reconciliation.zero_delta.updates).toBe(0);
    expect(reconciliation.zero_delta.total_before).toBe(EXPECTED_TOTAL);
    expect(reconciliation.zero_delta.total_after).toBe(EXPECTED_TOTAL);
  });

  test('Class A five-brand inventory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of hrCenters) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    expect(byBrand).toEqual(EXPECTED_BRANDS);
    expect(Object.keys(byBrand).length).toBe(5);
  });

  test('Gyms4you and THE Fitness estates + coming soon safety', () => {
    const g4y = qaReport.gyms4you as {live: number; coming_soon: number; coming_soon_live_leakage: number};
    const tf = qaReport.the_fitness as {live: number; coming_soon: number; coming_soon_live_leakage: number};
    expect(g4y.live).toBe(48);
    expect(g4y.coming_soon).toBe(6);
    expect(g4y.coming_soon_live_leakage).toBe(0);
    expect(tf.live).toBe(21);
    expect(tf.coming_soon).toBe(2);
    expect(tf.coming_soon_live_leakage).toBe(0);
    expect(hrCenters.some(c => /orlandofit/i.test(c.brand))).toBe(false);
    expect(hrCenters.some(c => /^Play Fitness$/i.test(c.brand))).toBe(false);
  });

  test('other chains, wellness, excluded, hotel/specialist/institutional', () => {
    const oc = qaReport.other_chains as Record<string, number>;
    expect(oc.gibi_gib).toBe(4);
    expect(oc.fitness_centar_joker).toBe(4);
    expect(oc.multihealth).toBe(3);
    const w = qaReport.wellness as {additive: number; ids: string[]};
    expect(w.additive).toBe(2);
    expect(w.ids.sort()).toEqual(WELLNESS_IDS.sort());
    const ex = qaReport.excluded as {staging_total: number; production_leakage: unknown[]};
    expect(ex.staging_total).toBe(37);
    expect(ex.production_leakage).toEqual([]);
    const safety = qaReport.safety as Record<string, number>;
    expect(safety.hotel_resort_leakage).toBe(0);
    expect(safety.specialist_leakage).toBe(0);
    expect(safety.institutional_leakage).toBe(0);
  });

  test('cross-border, Neum, Brod, duplicates, rebrand', () => {
    const dup = qaReport.duplicates as {
      global_duplicate_ids: number;
      hard_duplicate_conflicts: number;
      diacritic_duplicate_conflicts: number;
    };
    expect(dup.global_duplicate_ids).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    const rb = qaReport.rebrand as {conflicts: number; legacy_leakage: number};
    expect(rb.conflicts).toBe(0);
    expect(rb.legacy_leakage).toBe(0);
    const cb = qaReport.cross_border as {live_outliers: unknown[]};
    expect(cb.live_outliers).toEqual([]);
  });

  test('data quality all green on 80 live rows', () => {
    for (const c of hrCenters) {
      expect(c.id).toMatch(/^hr_[a-f0-9]{10}$/);
      expect(c.country).toBe('Croatia');
      expect(CROATIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(isPlausibleCroatiaCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(String(c.name).startsWith('hr_')).toBe(false);
    }
    const dq = qaReport.data_quality as Record<string, number>;
    expect(Object.values(dq).every(v => v === 0)).toBe(true);
  });

  test('country/ID resolution', () => {
    expect(GYM_ID_PREFIX.croatia).toBe('hr_');
    expect(isCroatiaCountry('Hrvatska')).toBe(true);
    expect(gymCountryTranslationKey('Croatia')).toBe('countries.croatia');
    expect(en.countries.croatia).toBe('Croatia');
    expect(resolveGymOrStub('hr_nonexistent_test').region).toBe('Croatia');
    expect(formatGymDisplayName(keep[0].id)).not.toMatch(/^hr_/);
    expect(findGymById(keep[0].id)).toBeDefined();
  });

  test('search QA — live resolves, coming-soon/excluded absent', () => {
    getGymSearchIndex();
    const croatiaGyms = getActiveGymsByCountry('Croatia');
    for (const q of ['Croatia', 'Zagreb', 'Gyms4you', 'THE Fitness', 'Varaždin']) {
      const hits = searchGyms(q, {gyms: croatiaGyms, limit: 40});
      expect(hits.some(h => h.gym.id.startsWith('hr_'))).toBe(true);
      for (const h of hits.filter(x => x.gym.id.startsWith('hr_'))) {
        expect(COMING_SOON_IDS.includes(h.gym.id)).toBe(false);
      }
    }
    expect(normalizeGymSearchValue('Varaždin')).toBe('varazdin');
  });

  test('map QA — 80 distinct live markers', () => {
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
  });

  test('nearest sanity and check-in 199/200/201', () => {
    const croatiaGyms = getActiveGymsByCountry('Croatia');
    const nearest = findNearestGym(45.815, 15.982, croatiaGyms);
    expect(nearest?.country).toBe('Croatia');
    const d = calculateDistance(45.815, 15.982, nearest!.latitude, nearest!.longitude);
    expect(d).toBeLessThan(25000);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    const coords = getGymLatLngForCheckIn(hrCenters[0].id);
    expect(coords).not.toBeNull();
    const now = Date.now();
    expect(decideGeofenceAutoCheckout(199, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(200, null, now).action).toBe('none');
    expect(decideGeofenceAutoCheckout(201, null, now).action).toBe('set_away');
  });

  test('prior-country production counts unchanged — REAL_COUNTRY_REGRESSIONS = 0', () => {
    for (const [country, n] of Object.entries(PRIOR_COUNTS)) {
      expect(ALL_GYM_CENTERS.filter(c => c.country === country).length).toBe(n);
    }
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSIONS).toBe(0);
    expect(historicalDebt.prior_country_verification.regressions).toEqual([]);
    expect(qaReport.REAL_COUNTRY_REGRESSIONS).toBe(0);
  });

  test('historical test debt classified — stale totals non-blocking', () => {
    expect(historicalDebt.summary.HISTORICAL_SUITES_FAILED).toBeGreaterThan(0);
    expect(historicalDebt.summary.STALE_TOTAL_FAILURES).toBeGreaterThan(0);
    expect(historicalDebt.summary.REAL_COUNTRY_REGRESSIONS).toBe(0);
  });

  test('performance, global scale, final verdict READY', () => {
    expect(perf.catalog_total).toBe(EXPECTED_TOTAL);
    expect(perf.architecture).toBe('KEEP CLIENT-SIDE');
    expect(perf.assessment).toBe('HEALTHY');
    expect(perf.crosses_12500).toBe(false);
    expect(EXPECTED_TOTAL).toBeLessThan(12500);
    expect(qaReport.verdict).toBe('CROATIA STATUS: READY');
    expect(qaReport.country_expansion).toBe('UNLOCKED');
    const gates = qaReport.gates as Record<string, boolean>;
    expect(gates.zero_delta).toBe(true);
    expect(gates.prior_country_counts_unchanged).toBe(true);
  });
});
