/**
 * Estonia Deep Phase 2 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleEstoniaCoordinate,
  ESTONIA_POSTAL_RE,
  isEstoniaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11922;
const LIVE_PRODUCTION_SHA256 =
  '18c7ed69ad1bdebcfbd77bd8b746bd48159c4963c0bb9a9c071bf5ee3e2d2bab';

type Row = {
  id: string;
  brand: string;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  import_category: string;
  phase2_disposition?: string;
  coord_source?: string | null;
};

type Transition = {
  id: string;
  phase1_category: string;
  phase2_disposition: string;
};

describe('Estonia Deep Phase 2 staging (existing production reconciliation)', () => {
  const dataDir = path.join(__dirname, '../data/estonia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'estonia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as Row[];
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Transition[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {estonia_hard_duplicate_conflicts: number; diacritic_duplicate_conflicts: number};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_CHAIN_ESTATE_AUDIT.json'), 'utf8'),
  ) as {summary: {chain_estate_gaps: number; final_class_a_chain_count: number}};
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; cities: Record<string, string>};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const prodEeIds = new Set(
    ALL_GYM_CENTERS.filter(c => c.id.startsWith('ee_')).map(c => c.id),
  );

  test('production frozen at 11922 / Estonia 68 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(68);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ee_')).length).toBe(68);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
  });

  test('Phase 1 recovered 103/103 with exact status counts', () => {
    expect(report.phase1_rows_recovered).toBe(103);
    const sc = report.phase1_status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(68);
    expect(sc.NEEDS_REVIEW).toBe(8);
    expect(sc.NEEDS_COORDINATES).toBe(0);
    expect(sc.COMING_SOON).toBe(5);
    expect(sc.EXCLUDED).toBe(22);
    expect(sc.CLOSED).toBe(0);
  });

  test('every Phase 1 candidate transitioned exactly once', () => {
    expect(transitions.length).toBe(103);
    const ids = transitions.map(t => t.id);
    expect(new Set(ids).size).toBe(103);
    const phase1Staging = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'ESTONIA_PHASE1_STAGING.json'), 'utf8'),
    ) as {id: string}[];
    expect(phase1Staging.map(r => r.id).sort()).toEqual(ids.sort());
  });

  test('KEEP_EXISTING 68/68 exact production match; EXISTING_REVIEW = 0', () => {
    expect(keep.length).toBe(68);
    expect(existingReview.length).toBe(0);
    expect(report.existing_review_required_count).toBe(0);
    const keepIds = new Set(keep.map(r => r.id));
    expect(keepIds.size).toBe(68);
    for (const id of keepIds) {
      expect(prodEeIds.has(id)).toBe(true);
    }
    expect([...keepIds].sort()).toEqual([...prodEeIds].sort());
  });

  test('NEW_READY = 1 FitLife; absent from production; NR and NC = 0', () => {
    expect(newReady.length).toBe(1);
    expect(newReady[0].id).toBe('ee_91d7bd69f0');
    expect(newReady[0].brand).toBe('FitLife');
    expect(prodEeIds.has(newReady[0].id)).toBe(false);
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
  });

  test('all 8 Phase 1 NR terminally resolved', () => {
    const nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(8);
    expect(nr.filter(t => t.phase2_disposition === 'NEW_READY_TO_IMPORT').length).toBe(1);
    expect(nr.filter(t => t.phase2_disposition === 'EXCLUDED').length).toBe(7);
  });

  test('all 5 Phase 1 COMING_SOON revalidated; none opened yet', () => {
    expect(comingSoon.length).toBe(5);
    expect(report.coming_soon_remain_count).toBe(5);
    expect(report.coming_soon_opened_count).toBe(0);
    const cs = transitions.filter(t => t.phase1_category === 'COMING_SOON');
    expect(cs.every(t => t.phase2_disposition === 'COMING_SOON')).toBe(true);
  });

  test('final inventory arithmetic: 103 = 68 + 1 + 5 + 29 + 0', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(sc.KEEP_EXISTING).toBe(68);
    expect(sc.NEW_READY_TO_IMPORT).toBe(1);
    expect(sc.COMING_SOON).toBe(5);
    expect(sc.EXCLUDED).toBe(29);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(68 + 1 + 5 + 29).toBe(103);
    expect(report.final_approved_estonia).toBe(69);
    expect(report.actual_new_delta).toBe(1);
  });

  test('Class A chains complete: MyFitness 19, 24-7 31, Gym! 15, Golden Club 3', () => {
    const byBrand = keep.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['MyFitness']).toBe(19);
    expect(byBrand['24-7 Fitness']).toBe(31);
    expect(byBrand['Gym!']).toBe(15);
    expect(byBrand['Golden Club']).toBe(3);
    expect(chain.summary.final_class_a_chain_count).toBe(4);
    expect(chain.summary.chain_estate_gaps).toBe(0);
  });

  test('D gaps resolved: Paide/Põlva/Elva/Sillamäe → B; material D = 0', () => {
    expect(cityCov.cities.Paide).toBe('B');
    expect(cityCov.cities.Põlva).toBe('B');
    expect(cityCov.cities.Elva).toBe('B');
    expect(cityCov.cities.Sillamäe).toBe('B');
    expect(cityCov.material_d_gaps_count).toBe(0);
  });

  test('NEW_READY and KEEP data quality; cross-border and leakage = 0', () => {
    for (const r of newReady) {
      expect(r.country).toBe('Estonia');
      expect(ESTONIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleEstoniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address}`)).toBe(false);
    }
    expect(cross.latvia_ready_outliers).toBe(0);
    expect(cross.russia_ready_outliers).toBe(0);
    expect(cross.finland_ready_outliers).toBe(0);
    expect(cross.valga_valka_identity_collisions).toBe(0);
    expect(cross.narva_ivangorod_identity_collisions).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
    expect(dup.estonia_hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('prior-country counts, search, geofence, scale, verdict', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);

    expect(GYM_ID_PREFIX.estonia).toBe('ee_');
    expect(isEstoniaCountry('Eesti')).toBe(true);
    expect(gymCountryTranslationKey('Estonia')).toBe('countries.estonia');
    expect(en.countries.estonia).toBe('Estonia');
    expect(normalizeGymSearchValue('Pärnu')).toBe('parnu');
    expect(normalizeGymSearchValue('Jõhvi')).toBe('johvi');
    expect(resolveGymOrStub('ee_nonexistent_test').region).toBe('Estonia');
    const entry = buildGymSearchEntry({
      id: 'ee_probe',
      name: 'MyFitness Viru',
      brand: 'MyFitness',
      city: 'Tallinn',
      country: 'Estonia',
      address: 'Viru väljak 4',
      postalCode: '10111',
      region: 'Estonia',
      latitude: 59.43,
      longitude: 24.75,
      _center: {
        id: 'ee_probe',
        name: 'MyFitness Viru',
        brand: 'MyFitness',
        address: 'Viru väljak 4',
        postal_code: '10111',
        city: 'Tallinn',
        country: 'Estonia',
        lat: 59.43,
        lng: 24.75,
        is_active: true,
      },
    });
    expect(entry.haystack).toMatch(/estonia|eesti/i);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.estonia_specific_radius_override).toBe(0);
    expect(report.projected_catalog_after_reconciliation).toBe(11923);
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.phase3_required).toBe(false);
    expect(report.verdict).toBe('READY FOR ESTONIA PRODUCTION RECONCILIATION');
  });
});
