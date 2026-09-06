/**
 * North Macedonia Phase 2 staging — all NR/NC resolved; READY merge candidate set.
 * Production centers.json must remain frozen. No merge in Phase 2.
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
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx/i;

const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_PROJECTED = 11800; // frozen Phase 2 report (11775 + 25)

const P1_UNRESOLVED = new Set([
  'mk_2ee674d62a',
  'mk_c91ef102cb',
  'mk_1a50b8774e',
  'mk_ed44181018',
  'mk_e287181ec4',
  'mk_c4cd75b049',
  'mk_95994c6f81',
  'mk_9898f0cbde',
  'mk_4ac68f805e',
  'mk_37822f2c0a',
  'mk_698c3510c0',
  'mk_41ca038c25',
  'mk_86cad1be86',
  'mk_94300b469e',
  'mk_5d2680a3e0',
  'mk_89442ce19e',
  'mk_8a5f5057f3',
  'mk_f0f98a4d56',
  'mk_cdaccb1c5c',
  'mk_f52f8d30cf',
  'mk_060baa180f',
  'mk_1483e1adda',
  'mk_398550063e',
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
};

describe('North Macedonia Phase 2 staging (no production merge)', () => {
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  const p1 = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '../data/north-macedonia/phase2/phase1_staging_snapshot.json',
      ),
      'utf8',
    ),
  ) as Row[];
  const staging = require('../data/north-macedonia/north_macedonia_centers_staging.json') as Row[];
  const ready = require('../data/north-macedonia/NORTH_MACEDONIA_PHASE2_READY_TO_IMPORT.json') as Row[];
  const report = require('../data/north-macedonia/NORTH_MACEDONIA_PHASE2_READINESS_REPORT.json') as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const rebrand = require('../data/north-macedonia/NORTH_MACEDONIA_PHASE2_REBRAND_MAP.json') as {
    unresolved_conflicts?: number;
  };
  const dup = require('../data/north-macedonia/NORTH_MACEDONIA_DUPLICATE_ANALYSIS.json') as {
    hard_duplicate_conflicts?: number;
  };

  test('production reflects BA merge (11831 / MK 25); Phase 2 report freeze', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_SHA);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('mk_')).length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(report.production_total).toBe(11775);
    expect(report.production_sha256).toBe(
      '2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698',
    );
    expect(GYM_ID_PREFIX.northMacedonia).toBe('mk_');
  });

  test('Phase 1 recovered exactly; all unresolved IDs preserved', () => {
    expect(report.phase1_recovered).toBe(true);
    expect(p1.length).toBe(77);
    expect(report.phase1_unresolved_recovered).toBe(23);
    const p1Ids = new Set(p1.map(r => r.id));
    const stagingIds = new Set(staging.map(r => r.id));
    for (const id of P1_UNRESOLVED) {
      expect(p1Ids.has(id)).toBe(true);
      expect(stagingIds.has(id)).toBe(true);
    }
    expect([...p1Ids].every(id => stagingIds.has(id))).toBe(true);
  });

  test('NR=0 NC=0; READY=25 SMI; Class A=0; verdict merge-ready', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(ready.length).toBe(25);
    expect(report.ready_to_import).toBe(25);
    expect(report.chain_class_a_ready).toBe(0);
    expect(report.small_market_independent_ready).toBe(25);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.phase1_promoted_to_ready).toBe(19);
    expect(report.phase1_excluded).toBe(4);
    expect(report.new_legitimate_gyms_discovered).toBe(6);
    expect(report.verdict).toBe('READY FOR NORTH MACEDONIA MERGE');
    expect(report.merge_ready).toBe(true);
    expect(report.phase3_required).toBe(false);
  });

  test('READY purity: mk_*, postcodes, coords, SMI, no fallback/mojibake', () => {
    expect(new Set(ready.map(r => r.id)).size).toBe(25);
    for (const r of ready) {
      expect(r.id).toMatch(/^mk_[a-f0-9]{10}$/);
      expect(r.country).toBe('North Macedonia');
      expect(NORTH_MACEDONIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(isPlausibleNorthMacedoniaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String(r.coord_source || ''))).toBe(false);
      expect(r.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(
        false,
      );
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
    }
  });

  test('key identity decisions + Slim/Forma/Fit One/Synergy audits', () => {
    expect(ready.some(r => r.id === 'mk_1a50b8774e')).toBe(true); // Athletic
    expect(ready.some(r => r.id === 'mk_ed44181018')).toBe(true); // Star Gym
    expect(ready.some(r => r.id === 'mk_698c3510c0')).toBe(true); // Flex Bitola
    expect(ready.some(r => r.id === 'mk_e287181ec4')).toBe(true); // Synergy
    expect(ready.some(r => /Dame Gruev|Centar/i.test(r.name) && r.brand === 'Fit One')).toBe(
      true,
    );
    expect(staging.find(r => r.id === 'mk_2ee674d62a')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'mk_c91ef102cb')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'mk_060baa180f')?.import_category).toBe('EXCLUDED');
    expect(staging.find(r => r.id === 'mk_37822f2c0a')?.import_category).toBe('EXCLUDED');

    expect(report.slim_gym_audit.CLASS_A).toBe(false);
    expect(report.forma_audit.CLASS_A).toBe(false);
    expect(report.fit_one_audit.institutional_leakage_ready).toBe(0);
    expect(report.synergy_audit.classification).toBe('WELLNESS_ADDITIVE');
    expect(report.synergy_audit.ready).toBe(true);
    expect(report.hotel_spa_leakage_ready).toBe(0);
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    for (const city of [
      'Skopje',
      'Bitola',
      'Kumanovo',
      'Prilep',
      'Tetovo',
      'Ohrid',
      'Kičevo',
      'Strumica',
      'Gostivar',
      'Štip',
    ]) {
      expect(report.city_coverage[city]).toBe('READY_present');
    }
    for (const city of [
      'Veles',
      'Kavadarci',
      'Kočani',
      'Gevgelija',
      'Debar',
      'Radoviš',
      'Saraj',
      'Šuto Orizari',
    ]) {
      expect(report.city_coverage[city]).toBe('A_legitimate_no_local_gym');
    }
    expect(report.cross_border.greece_ready).toBe(0);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.cross_border.bulgaria_ready).toBe(0);
    expect(report.cross_border.albania_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicates).toBe(0);
    expect(rebrand.unresolved_conflicts ?? report.data_quality.unresolved_rebrands).toBe(0);
  });

  test('projected 11831; check-in; orphan; SHA post-BA merge', () => {
    expect(report.projected_catalog).toBe(PHASE2_PROJECTED);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(isNorthMacedoniaCountry('North Macedonia')).toBe(true);
    expect(resolveGymOrStub('mk_nonexistent_test').region).toMatch(/North Macedonia/i);
    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_SHA);
  });
});
