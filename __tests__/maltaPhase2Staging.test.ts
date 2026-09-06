/**
 * Malta Deep Phase 2 staging — existing production reconciliation prep (no catalog writes).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMaltaCoordinate,
  MALTA_POSTAL_RE,
  isMaltaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
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
  coord_source?: string | null;
  phase2_disposition?: string;
  eligibility?: string;
};

describe('Malta Deep Phase 2 staging (existing production reconciliation prep)', () => {
  const dataDir = path.join(__dirname, '../data/malta');
  const phase2Dir = path.join(dataDir, 'phase2');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'malta_centers_staging.json'), 'utf8'),
  ) as Row[];
  const keep = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_KEEP_EXISTING.json'), 'utf8'),
  ) as Row[];
  const newReady = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const transitions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE1_TO_PHASE2_TRANSITIONS.json'), 'utf8'),
  ) as Array<{id: string; phase1_category: string; phase2_disposition: string}>;
  const reconciliation = JSON.parse(
    fs.readFileSync(
      path.join(dataDir, 'MALTA_PHASE2_EXISTING_PRODUCTION_RECONCILIATION.json'),
      'utf8',
    ),
  ) as {
    exact_id_match: number;
    phase1_ready_vs_production_overlap: number;
    material_drift: string[];
  };
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, unknown>;
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts: number; fitness_cafe_resolved: boolean};
  const cross = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_CROSS_BORDER_AUDIT.json'), 'utf8'),
  ) as Record<string, number>;
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts: number; unresolved_rebrand_conflicts: number};
  const chain = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_CHAIN_AUDIT.json'), 'utf8'),
  ) as {summary: {chain_estate_gaps: number; final_class_a_chain_count: number}};
  const cityCov = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'MALTA_PHASE2_CITY_COVERAGE.json'), 'utf8'),
  ) as {material_d_gaps_count: number};
  const cafe = JSON.parse(
    fs.readFileSync(path.join(phase2Dir, 'fitness_cafe_vs_build.json'), 'utf8'),
  ) as {classification: string; unresolved: boolean};
  const shaBefore = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_BEFORE.txt'), 'utf8').trim();
  const shaAfter = fs.readFileSync(path.join(phase2Dir, 'PHASE2_SHA_AFTER.txt'), 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 11923 / Malta 18 / SHA unchanged', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Malta').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mt_')).length).toBe(18);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
  });

  test('prior-country counts unchanged', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Lithuania').length).toBe(61);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Latvia').length).toBe(33);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Estonia').length).toBe(69);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('Phase 1 recovered 101/101 — every identity transitions exactly once', () => {
    expect(staging.length).toBe(101);
    expect(transitions.length).toBe(101);
    expect(new Set(transitions.map(t => t.id)).size).toBe(101);
    expect(report.phase1_rows_recovered).toBe(101);
  });

  test('existing 18/18 reconciled — zero material drift, zero review required', () => {
    expect(keep.length).toBe(18);
    expect(reconciliation.exact_id_match).toBe(18);
    expect(reconciliation.phase1_ready_vs_production_overlap).toBe(18);
    expect(reconciliation.material_drift).toEqual([]);
    expect(report.existing_review_required_count).toBe(0);
  });

  test('all 40 Phase 1 NEEDS_REVIEW terminally resolved; final NR/NC = 0', () => {
    const nr = transitions.filter(t => t.phase1_category === 'NEEDS_REVIEW');
    expect(nr.length).toBe(40);
    expect(nr.every(t => t.phase2_disposition === 'EXCLUDED')).toBe(true);
    const sc = report.status_counts as Record<string, number>;
    expect(sc.NEEDS_REVIEW ?? 0).toBe(0);
    expect(sc.NEEDS_COORDINATES ?? 0).toBe(0);
    expect(report.phase1_nr_resolved).toBe(40);
    expect(report.phase1_nr_unresolved).toBe(0);
  });

  test('Fitness Café rebrand resolved — Build Fitness predecessor', () => {
    expect(cafe.unresolved).toBe(false);
    expect(rebrand.fitness_cafe_resolved).toBe(true);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(dup.unresolved_rebrand_conflicts).toBe(0);
    expect(cafe.classification).toMatch(/historical/i);
  });

  test('Class A estates complete — BGM 10, 24/7 4, Challenger 4', () => {
    const byBrand = keep.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] ?? 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Best Gyms Malta']).toBe(10);
    expect(byBrand['24/7 Fitness Club']).toBe(4);
    expect(byBrand['Challenger Fitness']).toBe(4);
    expect(chain.summary.final_class_a_chain_count).toBe(3);
    expect(chain.summary.chain_estate_gaps).toBe(0);
    const cs = staging.filter(r => r.import_category === 'COMING_SOON');
    expect(cs.length).toBe(1);
    expect(cs[0]!.name.toLowerCase()).toContain('birgu');
  });

  test('qualifying independents promoted — 6 NEW_READY', () => {
    expect(newReady.length).toBe(6);
    expect(report.new_ready_to_import_count).toBe(6);
    expect(report.actual_new_delta).toBe(6);
    expect(report.final_approved_malta).toBe(24);
    const brands = new Set(newReady.map(r => r.brand));
    expect(brands.has('Fort Fitness')).toBe(true);
    expect(brands.has('Cynergi')).toBe(true);
    expect(brands.has('ActiveZone')).toBe(true);
    expect(brands.has('Kinetika Gozo')).toBe(true);
    expect(newReady.every(r => r.eligibility === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('NEW_READY and KEEP quality gates — postcodes, coords, no leakage', () => {
    const approved = [...keep, ...newReady];
    for (const r of approved) {
      expect(r.id.startsWith(GYM_ID_PREFIX.malta)).toBe(true);
      expect(r.country).toBe('Malta');
      expect(MALTA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(typeof r.lat).toBe('number');
      expect(typeof r.lng).toBe('number');
      expect(isPlausibleMaltaCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address}`)).toBe(false);
    }
    expect(report.hotel_resort_ready_leakage).toBe(0);
    expect(report.specialist_ready_leakage).toBe(0);
    expect(report.institutional_ready_leakage).toBe(0);
    expect(cross.italy_ready_outliers).toBe(0);
    expect(cross.sicily_ready_outliers).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(cityCov.material_d_gaps_count).toBe(0);
  });

  test('country resolution / check-in / scale / verdict', () => {
    expect(isMaltaCountry('Malta')).toBe(true);
    expect(gymCountryTranslationKey('Malta')).toBe('countries.malta');
    expect(en.countries.malta).toBe('Malta');
    expect(resolveGymOrStub('mt_nonexistent_test').name.length).toBeGreaterThan(0);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.malta_specific_radius_override).toBe(0);
    expect(report.projected_catalog_after_reconciliation).toBe(11929);
    expect(report.projected_crosses_12500).toBe(false);
    expect(report.architecture).toBe('KEEP CLIENT-SIDE');
    expect(report.verdict).toBe('READY FOR MALTA PRODUCTION RECONCILIATION');
  });
});
