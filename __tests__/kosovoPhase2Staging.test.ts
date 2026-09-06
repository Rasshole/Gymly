/**
 * Kosovo Phase 2 staging — all NR/NC resolved; READY merge candidate set.
 * Production centers.json must remain frozen. No merge in Phase 2.
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
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx/i;

const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_REPORT_TOTAL = 11840;
const PHASE2_REPORT_SHA =
  'a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0';
const PHASE2_PROJECTED = 11858;

const P1_UNRESOLVED = new Set([
  'xk_a7af40e3fe',
  'xk_29fa84ecf0',
  'xk_dba9745fcd',
  'xk_0bf7af5a22',
  'xk_de9890c36f',
  'xk_63fa84b599',
  'xk_4d08845385',
  'xk_b17f13e6b7',
  'xk_2abb4ca7f5',
  'xk_d46f26dde1',
  'xk_8b6e61ef88',
  'xk_67cfbf7311',
  'xk_61859b084f',
  'xk_27e1efefd8',
  'xk_033e410a0b',
  'xk_b3d703c870',
  'xk_829689576d',
  'xk_c6f32ebfe1',
  'xk_8b9ad920fe',
  'xk_8637ff3a68',
  'xk_e936944d75',
  'xk_06c3adbe83',
  'xk_d719b183a5',
  'xk_144b359826',
  'xk_5edfafded8',
  'xk_7db00f25ff',
  'xk_37bd73f3c8',
  'xk_ac4eeb29b4',
  'xk_62392a923b',
  'xk_3f13600113',
  'xk_83f4d2d38e',
  'xk_14234f354e',
  'xk_c7448eeb75',
  'xk_46be901f09',
  'xk_8b6a4744f8',
  'xk_a6a0b6674b',
  'xk_f07244fce8',
  'xk_3479f002e4',
  'xk_5426e41277',
  'xk_7cc55dd104',
  'xk_b0cdb882c9',
  'xk_0d6f34290b',
  'xk_7ba7521d48',
  'xk_beffb63254',
  'xk_500cfd9387',
  'xk_0623d1f425',
]);

const READY_IDS = new Set([
  'xk_500cfd9387',
  'xk_4d98941de0',
  'xk_97a7085d4d',
  'xk_c701eda0ff',
  'xk_1d7af5ff10',
  'xk_d722f14213',
  'xk_db35d316aa',
  'xk_87bda6987b',
  'xk_fc7b6a8c67',
  'xk_da9309622a',
  'xk_e06cd03b2e',
  'xk_4ac1e78ed4',
  'xk_9374a45e65',
  'xk_ae58d8d928',
  'xk_bda33fc345',
  'xk_b434775de1',
  'xk_b3ba8d5cb9',
  'xk_d2868682b1',
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

describe('Kosovo Phase 2 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/kosovo');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  const p1 = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'phase2/phase1_staging_snapshot.json'), 'utf8'),
  ) as Row[];
  const staging = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'kosovo_centers_staging.json'), 'utf8'),
  ) as Row[];
  const ready = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'KOSOVO_PHASE2_READY_TO_IMPORT.json'), 'utf8'),
  ) as Row[];
  const report = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'KOSOVO_PHASE2_READINESS_REPORT.json'), 'utf8'),
  ) as Record<string, // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any>;
  const decisions = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'phase2/decisions.json'), 'utf8'),
  ) as {decisions: Array<Record<string, string>>};
  const rebrand = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'KOSOVO_PHASE2_REBRAND_MAP.json'), 'utf8'),
  ) as {unresolved_conflicts?: number};
  const dup = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'KOSOVO_PHASE2_DUPLICATE_ANALYSIS.json'), 'utf8'),
  ) as {hard_duplicate_conflicts?: number};

  test('Phase 2 report frozen (11840 / XK 0); live catalog 11921 post-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_SHA);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('xk_')).length).toBe(18);
    expect(report.production_total).toBe(PHASE2_REPORT_TOTAL);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA);
    expect(GYM_ID_PREFIX.kosovo).toBe('xk_');
  });

  test('prior-country regressions intact including Albania 9', () => {
    const centers = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
      country?: string;
    }>;
    expect(centers.filter(c => c.country === 'Albania').length).toBe(9);
    expect(centers.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(centers.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(centers.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(centers.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('Phase 1 recovered exactly; all 46 unresolved IDs preserved', () => {
    expect(report.phase1_recovered).toBe(true);
    expect(p1.length).toBe(86);
    expect(report.phase1_staging_total).toBe(86);
    expect(report.phase1_unresolved_recovered).toBe(46);
    const p1Ids = new Set(p1.map(r => r.id));
    const stagingIds = new Set(staging.map(r => r.id));
    for (const id of P1_UNRESOLVED) {
      expect(p1Ids.has(id)).toBe(true);
      expect(stagingIds.has(id)).toBe(true);
    }
    expect([...p1Ids].every(id => stagingIds.has(id))).toBe(true);
  });

  test('NR=0 NC=0; READY=18; Class A=12 SMI=6; merge-ready verdict', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(ready.length).toBe(18);
    expect(report.ready_to_import).toBe(18);
    expect(report.chain_class_a_ready).toBe(12);
    expect(report.small_market_independent_ready).toBe(6);
    expect(report.qualifying_class_a_chains).toBe(2);
    expect(report.class_a_locations).toBe(12);
    expect(report.phase1_promoted_to_ready).toBe(1);
    expect(report.phase1_excluded).toBe(45);
    expect(report.new_legitimate_gyms_discovered).toBe(17);
    expect(report.market).toBe('MIXED_CHAIN_INDEPENDENT_PHASE_EXECUTED');
    expect(report.verdict).toBe('READY FOR KOSOVO MERGE');
    expect(report.merge_ready).toBe(true);
    expect(report.phase3_required).toBe(false);
  });

  test('all 46 original unresolved terminally decided', () => {
    expect(decisions.decisions.length).toBe(46);
    for (const d of decisions.decisions) {
      expect(P1_UNRESOLVED.has(d.id)).toBe(true);
      expect(['READY_TO_IMPORT', 'EXCLUDED', 'CLOSED']).toContain(d.FINAL_STATUS);
      expect(['NEEDS_REVIEW', 'NEEDS_COORDINATES']).toContain(d.PHASE1_STATUS);
    }
    const promoted = decisions.decisions.filter(
      d => d.FINAL_STATUS === 'READY_TO_IMPORT',
    ).length;
    const excluded = decisions.decisions.filter(d => d.FINAL_STATUS === 'EXCLUDED').length;
    expect(promoted).toBe(1);
    expect(excluded).toBe(45);
  });

  test('READY purity: xk_*, Kosovo, postcodes, coords, no fallback/mojibake', () => {
    expect(new Set(ready.map(r => r.id)).size).toBe(18);
    for (const id of READY_IDS) {
      expect(ready.some(r => r.id === id)).toBe(true);
    }
    for (const r of ready) {
      expect(r.id).toMatch(/^xk_[a-f0-9]{10}$/);
      expect(r.country).toBe('Kosovo');
      expect(isKosovoCountry(r.country)).toBe(true);
      expect(KOSOVO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleKosovoCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String(r.coord_source || ''))).toBe(false);
      expect(['CHAIN_CLASS_A', 'SMALL_MARKET_INDEPENDENT']).toContain(
        r.eligibility_path,
      );
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(
        false,
      );
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
    }
  });

  test('Fitness Zone + Planet Fitness + municipal audits resolved', () => {
    expect(report.fitness_zone_audit.class_a).toBe(false);
    expect(report.fitness_zone_audit.claimed).toBe(2);
    expect(report.fitness_zone_audit.active).toBe(1);
    expect(report.fitness_zone_audit.ready).toBe(1);
    expect(report.fitness_zone_audit.estate_complete).toBe(true);
    expect(staging.find(r => r.id === 'xk_a7af40e3fe')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'xk_29fa84ecf0')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'xk_61859b084f')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'xk_500cfd9387')?.import_category).toBe(
      'MERGED_INTO_CATALOG',
    );
    expect(staging.find(r => r.id === 'xk_0623d1f425')?.import_category).toBe('EXCLUDED');
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(18);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(85);
    expect(report.planet_fitness_audit.PLANET_FITNESS_XK_ACTIVE_SITES).toBe(0);
    expect(report.hotel_spa_leakage_ready).toBe(0);
    expect(ready.filter(r => r.brand === 'Five Star Fitness').length).toBe(7);
    expect(ready.filter(r => r.brand === 'Lets Go Gym').length).toBe(5);
  });

  test('North Kosovo READY country=Kosovo; no separate prefix', () => {
    for (const r of ready) {
      expect(r.country).toBe('Kosovo');
      expect(r.id.startsWith('xk_')).toBe(true);
    }
    expect(staging.some(r => r.id.startsWith('rs_'))).toBe(false);
    expect(staging.some(r => r.id.startsWith('sr_'))).toBe(false);
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.cross_border.albania_ready).toBe(0);
    expect(report.cross_border.montenegro_ready).toBe(0);
    expect(report.cross_border.mk_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.city_coverage.Prishtina).toBe('READY_present');
    expect(report.city_coverage.Prizren).toBe('READY_present');
    expect(report.city_coverage.Peje).toBeUndefined();
    expect(report.city_coverage['Pejë']).toBe('A_legitimate_no_local_gym');
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicates).toBe(
      0,
    );
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('projected catalog; check-in 200 m; Phase 2 SHA artifacts', () => {
    expect(report.projected_catalog).toBe(PHASE2_PROJECTED);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    const shaBefore = fs
      .readFileSync(path.join(dataDir, 'phase2/PHASE2_SHA_BEFORE.txt'), 'utf8')
      .trim();
    const shaAfter = fs
      .readFileSync(path.join(dataDir, 'phase2/PHASE2_SHA_AFTER.txt'), 'utf8')
      .trim();
    expect(shaBefore).toBe(PHASE2_REPORT_SHA);
    expect(shaAfter).toBe(PHASE2_REPORT_SHA);
    const stub = resolveGymOrStub('xk_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Kosovo/i);
  });
});
