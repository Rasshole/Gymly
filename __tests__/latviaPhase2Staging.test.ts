/**
 * Latvia Deep Phase 2 staging — existing production reconciliation (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLatviaCoordinate,
  LATVIA_POSTAL_RE,
  isLatviaCountry,
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
const CURRENT_PRODUCTION_TOTAL = 11923;
const LIVE_PRODUCTION_SHA256 =
  '6f40fba98eb351c54ecc076278c18d49349b0f42e7b18c4532710aa523f89c38';

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

const fakeGym = (partial: Record<string, string>) => ({
  id: partial.id ?? 'lv_probe',
  name: partial.name ?? 'Probe',
  brand: partial.brand ?? 'Probe',
  city: partial.city ?? 'Rīga',
  country: 'Latvia',
  address: 'Test 1',
  postal_code: '1050',
  lat: 56.95,
  lng: 24.11,
});

describe('Latvia Deep Phase 2 staging (existing production reconciliation)', () => {
  const dataDir = path.join(__dirname, '../data/latvia');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const existingReview = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_EXISTING_REVIEW_REQUIRED.json'), 'utf8'),
  ) as Row[];
  const comingSoon = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_COMING_SOON.json'), 'utf8'),
  ) as Row[];
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'latvia_centers_staging.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Transition[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {
    latvia_hard_duplicate_conflicts: number;
    diacritic_duplicate_conflicts: number;
    multilingual_duplicate_conflicts: number;
  };
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_CHAIN_ESTATE_AUDIT.json'), 'utf8'),
  ) as {
    summary: {
      final_class_a_chain_count: number;
      final_class_a_keep_count: number;
      chain_estate_gaps: number;
    };
  };
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'LATVIA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number; cities: Record<string, string>};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
  const prodLvIds = new Set(
    ALL_GYM_CENTERS.filter(c => c.id.startsWith('lv_')).map(c => c.id),
  );

  test('production frozen at 11923 / Latvia 33 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('lv_')).length).toBe(33);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
  });

  test('prior-country counts unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovenia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('Phase 1 recovered 74/74; every candidate transitioned exactly once', () => {
    expect(report.phase1_rows_recovered).toBe(74);
    expect(transitions.length).toBe(74);
    const ids = transitions.map(t => t.id);
    expect(new Set(ids).size).toBe(74);
    const sc = report.phase1_status_counts as Record<string, number>;
    expect(sc.READY_TO_IMPORT).toBe(33);
    expect(sc.NEEDS_REVIEW).toBe(28);
    expect(sc.COMING_SOON).toBe(1);
    expect(sc.EXCLUDED).toBe(12);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(sc.CLOSED ?? 0).toBe(0);
  });

  test('KEEP_EXISTING 33/33 reconciliation; zero existing review', () => {
    expect(keep.length).toBe(33);
    expect(existingReview.length).toBe(0);
    expect(report.keep_existing_count).toBe(33);
    expect(report.existing_review_required_count).toBe(0);
    for (const r of keep) {
      expect(prodLvIds.has(r.id)).toBe(true);
      expect(r.import_category).toBe('KEEP_EXISTING');
    }
    const rec = report.reconciliation as {
      exact_id_match: number;
      material_drift: string[];
    };
    expect(rec.exact_id_match).toBe(33);
    expect(rec.material_drift.length).toBe(0);
  });

  test('NEW_READY absent from production; actual new delta = 0', () => {
    expect(newReady.length).toBe(0);
    expect(report.new_ready_to_import_count).toBe(0);
    expect(report.actual_new_delta).toBe(0);
    for (const r of newReady) {
      expect(prodLvIds.has(r.id)).toBe(false);
    }
  });

  test('final NEEDS_REVIEW = 0; NEEDS_COORDINATES = 0', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
  });

  test('all 28 Phase 1 NR terminally resolved to EXCLUDED', () => {
    const nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(28);
    expect(nr.every(t => t.phase2_disposition === 'EXCLUDED')).toBe(true);
    expect(report.unresolved_municipal_candidates).toBe(0);
  });

  test('Phase 1 COMING_SOON revalidated; Ziepniekkalns still coming soon', () => {
    expect(comingSoon.length).toBe(1);
    expect(comingSoon[0].id).toBe('lv_eb2ad44f7d');
    expect(report.coming_soon_remain_count).toBe(1);
    expect(report.coming_soon_opened_count).toBe(0);
    const cs = transitions.filter(t => t.phase1_category === 'COMING_SOON');
    expect(cs.length).toBe(1);
    expect(cs[0].phase2_disposition).toBe('COMING_SOON');
  });

  test('final inventory arithmetic: 74 = 33 + 0 + 1 + 40 + 0', () => {
    const sc = report.status_counts as Record<string, number>;
    expect(sc.KEEP_EXISTING).toBe(33);
    expect(sc.COMING_SOON).toBe(1);
    expect(sc.EXCLUDED).toBe(40);
    expect(sc.CLOSED ?? 0).toBe(0);
    expect(33 + 1 + 40).toBe(74);
    expect(report.final_approved_latvia).toBe(33);
  });

  test('Class A chains complete: MyFitness 15, Lemon Gym 8, Gym! 10', () => {
    const byBrand = keep.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['MyFitness']).toBe(15);
    expect(byBrand['Lemon Gym']).toBe(8);
    expect(byBrand['Gym!']).toBe(10);
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.final_class_a_keep_count).toBe(33);
    expect(chain.summary.chain_estate_gaps).toBe(0);
  });

  test('city coverage: Rīga/Daugavpils A; material D gaps = 0', () => {
    expect(cityCov.cities['Rīga']).toBe('A');
    expect(cityCov.cities.Daugavpils).toBe('A');
    expect(cityCov.material_d_gaps_count).toBe(0);
  });

  test('KEEP data quality; cross-border and leakage = 0', () => {
    for (const r of keep) {
      expect(r.id).toMatch(/^lv_[a-f0-9]{10}$/);
      expect(r.country).toBe('Latvia');
      expect(LATVIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleLatviaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    expect(cross.lithuania_ready_outliers).toBe(0);
    expect(cross.estonia_ready_outliers).toBe(0);
    expect(cross.russia_ready_outliers).toBe(0);
    expect(cross.belarus_ready_outliers).toBe(0);
    expect(cross.valka_valga_identity_collisions).toBe(0);
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
    expect(dup.latvia_hard_duplicate_conflicts).toBe(0);
    expect(dup.diacritic_duplicate_conflicts).toBe(0);
    expect(dup.multilingual_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('prior-country counts, search, geofence, scale, verdict', () => {
    expect(GYM_ID_PREFIX.latvia).toBe('lv_');
    expect(isLatviaCountry('Latvija')).toBe(true);
    expect(gymCountryTranslationKey('Latvia')).toBe('countries.latvia');
    expect(en.countries.latvia).toBe('Latvia');
    expect(normalizeGymSearchValue('Liepāja')).toBe('liepaja');
    expect(normalizeGymSearchValue('Rīga')).toBe('riga');
    expect(resolveGymOrStub('lv_nonexistent_test').region).toBe('Latvia');
    const entry = buildGymSearchEntry(
      fakeGym({id: 'lv_probe', city: 'Rīga', brand: 'MyFitness'}),
    );
    expect(entry.haystack).toMatch(/latvia|latvija|myfitness/i);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(199 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(200 <= CHECK_IN_RADIUS_METERS).toBe(true);
    expect(201 <= CHECK_IN_RADIUS_METERS).toBe(false);
    expect(report.latvia_specific_radius_override).toBe(0);
    expect(report.projected_catalog_after_reconciliation).toBe(11923);
    expect(report.remaining_headroom).toBe(577);
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_after_reconciliation).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.phase3_required).toBe(false);
    expect(report.verdict).toBe('READY FOR LATVIA PRODUCTION RECONCILIATION');
  });
});
