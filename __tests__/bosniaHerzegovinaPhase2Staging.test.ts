/**
 * Bosnia & Herzegovina Phase 2 staging — all NR/NC resolved; READY merge candidate set.
 * Production centers.json must remain frozen. No merge in Phase 2.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBosniaHerzegovinaCoordinate,
  BOSNIA_HERZEGOVINA_POSTAL_RE,
  isBosniaHerzegovinaCountry,
  isCroatiaCountry,
  isMontenegroCountry,
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
const PHASE2_FROZEN_SHA =
  '6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112';
const PHASE2_PROJECTED = 11831;

const P1_UNRESOLVED = new Set([
  'ba_0116ad0cd5',
  'ba_0ace57c4b2',
  'ba_0bf4cc7be5',
  'ba_1e88b67b77',
  'ba_21c2e65f54',
  'ba_23287d2052',
  'ba_234269c33b',
  'ba_327db3a237',
  'ba_342f507ce7',
  'ba_383806522f',
  'ba_3b9800cdd0',
  'ba_446902cbcb',
  'ba_4b2b262dac',
  'ba_57da7dd70d',
  'ba_5a82ca68bf',
  'ba_5ddab9c740',
  'ba_5fd8cc9b20',
  'ba_605d38b631',
  'ba_64b95bab44',
  'ba_68ec8f2d3d',
  'ba_69162d2178',
  'ba_6e8f727eb6',
  'ba_760fbe82ce',
  'ba_7612d3d4c2',
  'ba_78f8ad5126',
  'ba_7aeec79730',
  'ba_7d8fd80b4a',
  'ba_82f2fa3809',
  'ba_957417e083',
  'ba_ba510b2696',
  'ba_bc60505bc2',
  'ba_cced171393',
  'ba_d10bc012e8',
  'ba_d705f4fca7',
  'ba_d8a16be7ac',
  'ba_deeabeda92',
  'ba_e6ba48931b',
  'ba_e6bae3c12c',
  'ba_f63cafd3fe',
  'ba_fa6f3c8b99',
  'ba_fbb6ab9577',
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
  entity?: string;
  hotel_spa_risk?: boolean;
};

describe('Bosnia & Herzegovina Phase 2 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/bosnia-herzegovina');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  const p1 = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'phase2/phase1_staging_snapshot.json'), 'utf8'),
  ) as Row[];
  const staging = require('../data/bosnia-herzegovina/bosnia_herzegovina_centers_staging.json') as Row[];
  const ready = require('../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_READY_TO_IMPORT.json') as Row[];
  const report = require('../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_READINESS_REPORT.json') as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const chain = require('../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_CHAIN_INVENTORY.json') as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const rebrand = require('../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_PHASE2_REBRAND_MAP.json') as {
    unresolved_conflicts?: number;
    all_in_fitness_audit?: Record<string, unknown>;
    kron_audit?: Record<string, unknown>;
  };
  const dup = require('../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_DUPLICATE_ANALYSIS.json') as {
    hard_duplicate_conflicts?: number;
  };
  const crossBorder = require('../data/bosnia-herzegovina/BOSNIA_HERZEGOVINA_CROSS_BORDER_AUDIT.json') as {
    croatia_ready?: number;
    serbia_ready?: number;
    montenegro_ready?: number;
  };

  test('production reflects BA merge (11831 / BA 31); Phase 2 report freeze', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_SHA);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('ba_')).length).toBe(31);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(report.production_total).toBe(11800);
    expect(report.production_sha256).toBe(PHASE2_FROZEN_SHA);
    expect(report.bosnia_herzegovina_live).toBe(0);
    expect(report.ba_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.bosniaHerzegovina).toBe('ba_');
  });

  test('Phase 1 recovered exactly; all 41 unresolved IDs preserved', () => {
    expect(report.phase1_recovered).toBe(true);
    expect(p1.length).toBe(75);
    expect(report.phase1_staging_total).toBe(75);
    expect(report.phase1_unresolved_recovered).toBe(41);
    const p1Ids = new Set(p1.map(r => r.id));
    const stagingIds = new Set(staging.map(r => r.id));
    expect(p1Ids.size).toBe(75);
    expect(stagingIds.size).toBe(75);
    for (const id of P1_UNRESOLVED) {
      expect(p1Ids.has(id)).toBe(true);
      expect(stagingIds.has(id)).toBe(true);
    }
    expect([...p1Ids].every(id => stagingIds.has(id))).toBe(true);
  });

  test('NR=0 NC=0; READY=31; Class A=7 SMI=24; verdict merge-ready', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(ready.length).toBe(31);
    expect(report.ready_to_import).toBe(31);
    expect(report.chain_class_a_ready).toBe(7);
    expect(report.small_market_independent_ready).toBe(24);
    expect(report.qualifying_class_a_chains).toBe(2);
    expect(report.phase1_promoted_to_ready).toBe(31);
    expect(report.phase1_excluded).toBe(10);
    expect(report.phase1_closed).toBe(0);
    expect(report.new_legitimate_gyms_discovered).toBe(0);
    expect(report.verdict).toBe('READY FOR BOSNIA & HERZEGOVINA MERGE');
    expect(report.merge_ready).toBe(true);
    expect(report.phase3_required).toBe(false);
    expect(staging.every(r =>
      ['READY_TO_IMPORT', 'EXCLUDED', 'CLOSED', 'MERGED_INTO_CATALOG'].includes(
        r.import_category,
      ),
    )).toBe(true);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(31);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
  });

  test('READY purity: ba_*, postcodes, coords, eligibility, no fallback/mojibake', () => {
    expect(new Set(ready.map(r => r.id)).size).toBe(31);
    for (const r of ready) {
      expect(r.id).toMatch(/^ba_[a-f0-9]{10}$/);
      expect(r.country).toBe('Bosnia and Herzegovina');
      expect(BOSNIA_HERZEGOVINA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleBosniaHerzegovinaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String(r.coord_source || ''))).toBe(false);
      expect(['CHAIN_CLASS_A', 'SMALL_MARKET_INDEPENDENT']).toContain(r.eligibility_path);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(false);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(r.hotel_spa_risk).not.toBe(true);
    }
    expect(ready.filter(r => r.eligibility_path === 'CHAIN_CLASS_A').length).toBe(7);
    expect(ready.filter(r => r.eligibility_path === 'SMALL_MARKET_INDEPENDENT').length).toBe(24);
  });

  test('Class A audits: ALL IN FITNESS ×3 + Kron ×4', () => {
    expect(chain.qualifying_class_a_chains).toBe(2);
    expect(chain.class_a_locations).toBe(7);
    expect(report.all_in_fitness_audit.CLASS_A).toBe(true);
    expect(report.all_in_fitness_audit.ALL_IN_ACTIVE_SITES).toBe(3);
    expect(report.kron_audit.CLASS_A).toBe(true);
    expect(report.kron_audit.KRON_ACTIVE_SITES).toBe(4);
    expect(ready.filter(r => r.brand === 'ALL IN FITNESS').length).toBe(3);
    expect(ready.filter(r => r.brand === 'Kron Fitness').length).toBe(4);
    expect(ready.every(r => r.brand === 'ALL IN FITNESS' || r.brand === 'Kron Fitness' ? r.eligibility_path === 'CHAIN_CLASS_A' : r.eligibility_path === 'SMALL_MARKET_INDEPENDENT')).toBe(true);
  });

  test('entity unity; municipal resolved; Gradačac gap closed', () => {
    expect(staging.every(r => r.country === 'Bosnia and Herzegovina' || r.foreign_probe)).toBe(true);
    expect(staging.every(r => !r.id.startsWith('rs_'))).toBe(true);
    expect(staging.every(r => !r.id.startsWith('fbih_'))).toBe(true);
    expect(staging.some(r => r.entity === 'Republika Srpska')).toBe(true);
    expect(staging.some(r => r.entity === 'Federation of BiH')).toBe(true);
    expect(staging.some(r => r.entity === 'Brčko District')).toBe(true);
    expect(report.city_coverage.Gradačac).toBe('A_legitimate_no_local_gym');
    expect(staging.filter(r => r.discovery_class === 'municipal_public_candidate').every(r => r.import_category === 'EXCLUDED')).toBe(true);
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    for (const city of [
      'Sarajevo',
      'Banja Luka',
      'Tuzla',
      'Mostar',
      'Zenica',
      'Bijeljina',
      'Bihać',
      'Brčko',
      'Prijedor',
      'Doboj',
      'Trebinje',
      'Cazin',
      'Travnik',
      'Gračanica',
      'Živinice',
      'Goražde',
    ]) {
      expect(report.city_coverage[city]).toBe('READY_present');
    }
    for (const city of ['Gradačac', 'Lukavac', 'Visoko', 'Konjic', 'Bugojno', 'Jajce', 'Livno']) {
      expect(report.city_coverage[city]).toBe('A_legitimate_no_local_gym');
    }
    expect(report.cross_border.croatia_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.cross_border.montenegro_ready).toBe(0);
    expect(crossBorder.croatia_ready ?? 0).toBe(0);
    expect(crossBorder.serbia_ready ?? 0).toBe(0);
    expect(crossBorder.montenegro_ready ?? 0).toBe(0);
    expect(report.hotel_spa_leakage_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicates).toBe(0);
    expect(rebrand.unresolved_conflicts ?? report.data_quality.unresolved_rebrands).toBe(0);
  });

  test('projected 11831; check-in; orphan; SHA unchanged; country resolution', () => {
    expect(report.projected_catalog).toBe(PHASE2_PROJECTED);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(isBosniaHerzegovinaCountry('Bosnia and Herzegovina')).toBe(true);
    expect(isCroatiaCountry('Bosnia and Herzegovina')).toBe(false);
    expect(isMontenegroCountry('Bosnia and Herzegovina')).toBe(false);
    expect(String((resolveGymOrStub('ba_nonexistent_test') as {region?: string}).region || '')).toMatch(
      /Bosnia/i,
    );
    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_SHA);
    const shaBefore = fs
      .readFileSync(path.join(dataDir, 'phase2/PHASE2_SHA_BEFORE.txt'), 'utf8')
      .trim();
    expect(shaBefore).toBe(PHASE2_FROZEN_SHA);
  });
});
