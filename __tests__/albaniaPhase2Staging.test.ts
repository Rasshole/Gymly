/**
 * Albania Phase 2 staging — all NR/NC resolved; READY merge candidate set.
 * Production centers.json must remain frozen. No merge in Phase 2.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAlbaniaCoordinate,
  ALBANIA_POSTAL_RE,
  isAlbaniaCountry,
  isMontenegroCountry,
  isNorthMacedoniaCountry,
  isGreeceCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx/i;

const PHASE2_REPORT_TOTAL = 11831;
const PHASE2_REPORT_SHA =
  '5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e';
const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_PROJECTED = 11840;

const P1_UNRESOLVED = new Set([
  'al_05d95d21f5',
  'al_0cb916e01d',
  'al_158c6b2054',
  'al_15db0d4060',
  'al_1d3ecf3888',
  'al_1f1dd66080',
  'al_2002d5b349',
  'al_271a5c98d9',
  'al_29624d469b',
  'al_308485e69c',
  'al_33f34e6832',
  'al_36c04c3f26',
  'al_38791206d2',
  'al_3c469a48c2',
  'al_4c11873a38',
  'al_5125e8c161',
  'al_5224452e13',
  'al_5d547309b6',
  'al_61dca99977',
  'al_63db3f3a75',
  'al_6bbcd24508',
  'al_6d7f1b5900',
  'al_732e51b2b0',
  'al_7366a9a592',
  'al_74be039864',
  'al_84b5ff1200',
  'al_8deab02dcd',
  'al_94957484e2',
  'al_97da7476ce',
  'al_9ccb45b0ac',
  'al_9cf7944b63',
  'al_9f00e1407b',
  'al_a153565f54',
  'al_a1d2fcd224',
  'al_ae1e02eb99',
  'al_b7ea5d2aed',
  'al_bec40239b7',
  'al_c4405b1b3d',
  'al_cd82bbcd2e',
  'al_ce0d993af0',
  'al_cf819586a8',
  'al_dd630e4f17',
  'al_dec0965f5e',
  'al_e79659bec9',
  'al_ee54d79fc0',
  'al_fcbf72919b',
  'al_fddc0d9db6',
]);

const READY_IDS = new Set([
  'al_2002d5b349',
  'al_4c11873a38',
  'al_36c04c3f26',
  'al_9ccb45b0ac',
  'al_63db3f3a75',
  'al_a153565f54',
  'al_9cf7944b63',
  'al_33f34e6832',
  'al_ee54d79fc0',
]);

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
  eligibility_path?: string;
  phase2_classification?: string;
  foreign_probe?: boolean;
  territory?: string;
  hotel_spa_risk?: boolean;
};

describe('Albania Phase 2 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/albania');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  const p1 = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'phase2/phase1_staging_snapshot.json'), 'utf8'),
  ) as Row[];
  const staging = require('../data/albania/albania_centers_staging.json') as Row[];
  const ready = require('../data/albania/ALBANIA_PHASE2_READY_TO_IMPORT.json') as Row[];
  const report = require('../data/albania/ALBANIA_PHASE2_READINESS_REPORT.json') as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const chain = require('../data/albania/ALBANIA_PHASE2_CHAIN_INVENTORY.json') as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const rebrand = require('../data/albania/ALBANIA_PHASE2_REBRAND_MAP.json') as {
    unresolved_conflicts?: number;
    repeat_audit?: Record<string, unknown>;
    flex_audit?: Record<string, unknown>;
  };
  const dup = require('../data/albania/ALBANIA_PHASE2_DUPLICATE_ANALYSIS.json') as {
    hard_duplicate_conflicts?: number;
  };
  const decisionsDoc = require('../data/albania/phase2/decisions.json') as {
    decisions: Record<string, {status: string}>;
  };
  const decisions = decisionsDoc.decisions;

  test('Phase 2 report frozen (11831 / AL 0); live catalog 11921 post-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_SHA);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('al_')).length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(report.production_total).toBe(PHASE2_REPORT_TOTAL);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA);
    expect(report.albania_live).toBe(0);
    expect(GYM_ID_PREFIX.albania).toBe('al_');
  });

  test('Phase 1 recovered exactly; all 47 unresolved IDs preserved', () => {
    expect(report.phase1_recovered).toBe(true);
    expect(p1.length).toBe(90);
    expect(report.phase1_staging_total).toBe(90);
    expect(report.phase1_unresolved_recovered).toBe(47);
    const p1Ids = new Set(p1.map(r => r.id));
    const stagingIds = new Set(staging.map(r => r.id));
    expect(p1Ids.size).toBe(90);
    expect(stagingIds.size).toBe(90);
    for (const id of P1_UNRESOLVED) {
      expect(p1Ids.has(id)).toBe(true);
      expect(stagingIds.has(id)).toBe(true);
    }
    expect([...p1Ids].every(id => stagingIds.has(id))).toBe(true);
    expect(Object.keys(decisions).length).toBe(47);
  });

  test('NR=0 NC=0; READY=9; SMI=9; verdict merge-ready', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(ready.length).toBe(9);
    expect(report.ready_to_import).toBe(9);
    expect(report.chain_class_a_ready).toBe(0);
    expect(report.small_market_independent_ready).toBe(9);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.phase1_promoted_to_ready).toBe(9);
    expect(report.phase1_excluded).toBe(38);
    expect(report.phase1_closed).toBe(0);
    expect(report.new_legitimate_gyms_discovered).toBe(0);
    expect(report.market).toBe('INDEPENDENT_PHASE_EXECUTED');
    expect(report.verdict).toBe('READY FOR ALBANIA MERGE');
    expect(report.merge_ready).toBe(true);
    expect(report.phase3_required).toBe(false);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(9);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(81);
    expect(staging.every(r =>
      ['MERGED_INTO_CATALOG', 'EXCLUDED', 'CLOSED'].includes(r.import_category),
    )).toBe(true);
  });

  test('all 47 original unresolved candidates terminally decided', () => {
    for (const id of P1_UNRESOLVED) {
      const row = staging.find(r => r.id === id)!;
      expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG', 'EXCLUDED', 'CLOSED']).toContain(row.import_category);
      if (row.import_category === 'MERGED_INTO_CATALOG') {
        expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
          decisions[id]?.status ?? row.import_category,
        );
      } else {
        expect(decisions[id]?.status ?? row.import_category).toBe(row.import_category);
      }
    }
    expect([...P1_UNRESOLVED].filter(id => READY_IDS.has(id)).length).toBe(9);
    expect([...P1_UNRESOLVED].filter(id => !READY_IDS.has(id)).length).toBe(38);
  });

  test('READY purity: al_*, postcodes, coords, eligibility, no fallback/mojibake', () => {
    expect(new Set(ready.map(r => r.id)).size).toBe(9);
    for (const r of ready) {
      expect(r.id).toMatch(/^al_[a-f0-9]{10}$/);
      expect(r.country).toBe('Albania');
      expect(ALBANIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleAlbaniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String(r.coord_source || ''))).toBe(false);
      expect(r.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(false);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
    }
    expect(report.hotel_spa_leakage_ready).toBe(0);
  });

  test('Repeat estate: 2 READY Wilson+TEG; Nobis EXCLUDED; not Class A', () => {
    expect(report.repeat_audit.REPEAT_CLASS_A).toBe(false);
    expect(report.repeat_audit.REPEAT_CONVENTIONAL_PUBLIC_SITES).toBe(2);
    expect(report.repeat_audit.ready_sites).toEqual(['Wilson', 'TEG']);
    expect(report.repeat_audit.excluded_sites).toContain('Nobis');
    expect(ready.filter(r => r.brand === 'Repeat').length).toBe(2);
    expect(staging.find(r => r.id === 'al_fddc0d9db6')?.import_category).toBe('EXCLUDED');
    expect(chain.qualifying_class_a_chains).toBe(0);
    expect(rebrand.repeat_audit).toBeTruthy();
  });

  test('Flex estate reconciled; Planet Fitness confusion resolved; municipal EXCLUDED', () => {
    expect(report.flex_audit.FLEX_CLASS_A).toBe(false);
    expect(report.flex_audit.FLEX_CONVENTIONAL_SITES).toBe(1);
    expect(ready.filter(r => r.brand === 'Flex Gym').length).toBe(1);
    expect(report.planet_fitness_audit.PLANET_FITNESS_AL_ACTIVE_SITES).toBe(0);
    expect(staging.find(r => r.id === 'al_97da7476ce')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'al_5125e8c161')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'al_61dca99977')?.import_category).toBe('EXCLUDED');
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    for (const city of ['Tirana', 'Durrës', 'Vlorë', 'Shkodër']) {
      expect(report.city_coverage[city]).toBe('READY_present');
    }
    for (const city of [
      'Elbasan',
      'Fier',
      'Korçë',
      'Golem',
      'Ksamil',
      'Konispol',
      'Peshkopi',
    ]) {
      expect(report.city_coverage[city]).toBe('A_legitimate_no_local_gym');
    }
    expect(report.cross_border.montenegro_ready).toBe(0);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(report.cross_border.mk_ready).toBe(0);
    expect(report.cross_border.greece_ready).toBe(0);
    expect(report.hotel_spa_leakage_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicates).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('Dibër/Debar and border identity; orphan al_*; check-in 200 m; SHA after', () => {
    expect(isAlbaniaCountry('Albania')).toBe(true);
    expect(isMontenegroCountry('Albania')).toBe(false);
    expect(isNorthMacedoniaCountry('Albania')).toBe(false);
    expect(isGreeceCountry('Albania')).toBe(false);
    const stub = resolveGymOrStub('al_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Albania/i);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.projected_catalog).toBe(PHASE2_PROJECTED);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_SHA);
    const shaBefore = fs
      .readFileSync(path.join(dataDir, 'ALBANIA_PHASE2_SHA_BEFORE.txt'), 'utf8')
      .trim();
    const shaAfterFile = fs
      .readFileSync(path.join(dataDir, 'ALBANIA_PHASE2_SHA_AFTER.txt'), 'utf8')
      .trim();
    expect(shaBefore).toBe(PHASE2_REPORT_SHA);
    expect(shaAfterFile).toBe(PHASE2_REPORT_SHA);
  });
});
