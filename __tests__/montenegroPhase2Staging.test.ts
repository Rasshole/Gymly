/**
 * Montenegro Phase 2 staging — all NR/NC resolved; READY merge candidate set.
 * Production centers.json must remain frozen. No merge in Phase 2.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMontenegroCoordinate,
  MONTENEGRO_POSTAL_RE,
  isMontenegroCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s/;
const FALLBACK_RE =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|city.?approx/i;

const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_SHA =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_REPORT_SHA =
  '753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8';
const PHASE2_PROJECTED = 11775; // 11749 + 26 READY

const P1_UNRESOLVED = new Set([
  'me_54169ac803',
  'me_aebbd15856',
  'me_c220315889',
  'me_27a3463ee9',
  'me_9eeaa4aa02',
  'me_eaf8aa192f',
  'me_9c7043893c',
  'me_c945ad2b04',
  'me_84ef15d2b4',
  'me_0ca0ffcb7a',
  'me_fe03c93cd3',
  'me_4b2e8c0669',
  'me_5b75a6d116',
  'me_c7dbad6462',
  'me_6ac0b00f40',
  'me_1567286ea5',
  'me_350001f8be',
  'me_f984998247',
  'me_894d0a07f8',
  'me_54f77f7c9f',
  'me_56e8d53c56',
  'me_1064e5ae96',
  'me_7db3b852cf',
  'me_b348023f1d',
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

describe('Montenegro Phase 2 staging (no production merge)', () => {
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  const p1 = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/phase2/phase1_staging_snapshot.json'),
      'utf8',
    ),
  ) as Row[];
  const staging = require('../data/montenegro/montenegro_centers_staging.json') as Row[];
  const ready = require('../data/montenegro/MONTENEGRO_PHASE2_READY_TO_IMPORT.json') as Row[];
  const report = require('../data/montenegro/MONTENEGRO_PHASE2_READINESS_REPORT.json') as {
    phase1_recovered: boolean;
    phase1_unresolved_recovered: number;
    phase1_promoted_to_ready: number;
    ready_to_import: number;
    needs_review: number;
    needs_coordinates: number;
    qualifying_class_a_chains: number;
    chain_class_a_ready: number;
    small_market_independent_ready: number;
    new_legitimate_gyms_discovered: number;
    city_coverage: Record<string, string>;
    unexplained_b_gaps: number;
    unexplained_d_gaps: number;
    cross_border: Record<string, number>;
    data_quality: Record<string, number>;
    hotel_spa_leakage_ready: number;
    phase3_required: boolean;
    merge_ready: boolean;
    projected_catalog: number;
    crosses_12500: boolean;
    global_stress_qa_required_now: boolean;
    verdict: string;
    production_sha256: string;
  };
  const rebrand = require('../data/montenegro/MONTENEGRO_PHASE2_REBRAND_MAP.json') as {
    unresolved_conflicts: number;
    soko_identity_map: Record<string, string>;
    relationships: Array<{type: string; entities?: string[]}>;
  };
  const dup = require('../data/montenegro/montenegro_duplicate_analysis.json') as {
    hard_duplicate_conflicts: number;
  };

  test('production reflects Bosnia merge (11831 / ME 26); Phase 2 report freeze', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('me_')).length).toBe(26);
    expect(sha).toBe(LIVE_SHA);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA);
    expect(GYM_ID_PREFIX.montenegro).toBe('me_');
  });

  test('Phase 1 recovered exactly; all unresolved IDs decided', () => {
    expect(report.phase1_recovered).toBe(true);
    expect(p1.length).toBe(64);
    const p1Counts = p1.reduce(
      (acc, r) => {
        acc[r.import_category] = (acc[r.import_category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    expect(p1Counts.READY_TO_IMPORT || 0).toBe(0);
    expect(p1Counts.NEEDS_REVIEW).toBe(11);
    expect(p1Counts.NEEDS_COORDINATES).toBe(13);
    expect(p1Counts.CLOSED).toBe(1);
    expect(p1Counts.EXCLUDED).toBe(39);
    expect(report.phase1_unresolved_recovered).toBe(24);

    const byId = Object.fromEntries(staging.map(r => [r.id, r]));
    for (const id of P1_UNRESOLVED) {
      expect(byId[id]).toBeTruthy();
      expect(['READY_TO_IMPORT', 'EXCLUDED', 'CLOSED', 'MERGED_INTO_CATALOG']).toContain(
        byId[id].import_category,
      );
    }
  });

  test('NR=0 NC=0; READY purity + DQ gates', () => {
    expect(report.needs_review).toBe(0);
    expect(report.needs_coordinates).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(ready.length).toBe(report.ready_to_import);
    expect(ready.length).toBe(26);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.chain_class_a_ready).toBe(0);
    expect(report.small_market_independent_ready).toBe(26);

    const ids = ready.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ready) {
      expect(r.id.startsWith('me_')).toBe(true);
      expect(MONTENEGRO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat != null && r.lng != null).toBe(true);
      expect(isPlausibleMontenegroCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_RE.test(String(r.coord_source || ''))).toBe(false);
      expect(r.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      expect(r.country).toBe('Montenegro');
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(String(r.address || '').length).toBeGreaterThan(3);
      expect(String(r.city || '').length).toBeGreaterThan(1);
    }
    expect(report.data_quality.fallback_ready_coords).toBe(0);
    expect(report.data_quality.mojibake).toBe(0);
    expect(report.hotel_spa_leakage_ready).toBe(0);
  });

  test('Benex / Soko / Urban-GO / Berane / Positive / Ethno decisions', () => {
    const benex = ready.filter(r => r.brand === 'Benex Fitness');
    expect(benex.length).toBe(2);
    const soko = ready.filter(r => r.brand === 'Soko Gym');
    expect(soko.length).toBe(2);
    expect(rebrand.soko_identity_map.Lady).toMatch(/EXCLUDED/i);
    expect(rebrand.soko_identity_map['Mall wellness']).toMatch(/EXCLUDED/i);
    const urbanGo = rebrand.relationships.find(
      r => r.type === 'A_DISTINCT_CURRENT_GYMS' && (r.entities || []).includes('Urban Gym'),
    );
    expect(urbanGo).toBeTruthy();
    expect(ready.some(r => r.id === 'me_9eeaa4aa02')).toBe(true); // Urban
    expect(ready.some(r => r.id === 'me_4b2e8c0669')).toBe(true); // GO GYM
    const berane = ready.find(r => r.id === 'me_f984998247');
    expect(berane?.phase2_classification).toBe('A_PUBLIC_CONVENTIONAL_GYM');
    expect(ready.some(r => r.id === 'me_84ef15d2b4')).toBe(true);
    expect(ready.some(r => r.id === 'me_0ca0ffcb7a')).toBe(true);
    expect(staging.find(r => r.id === 'me_350001f8be')?.import_category).toBe('EXCLUDED');
  });

  test('city matrix; B/D gaps 0; border contamination 0', () => {
    for (const city of [
      'Podgorica',
      'Nikšić',
      'Budva',
      'Bar',
      'Herceg Novi',
      'Igalo',
      'Tivat',
      'Kotor',
      'Ulcinj',
      'Cetinje',
      'Bijelo Polje',
      'Berane',
      'Pljevlja',
      'Rožaje',
    ]) {
      expect(report.city_coverage[city]).toBeTruthy();
    }
    expect(report.city_coverage.Ulcinj).toBe('READY_present');
    expect(report.city_coverage.Cetinje).toBe('READY_present');
    expect(report.city_coverage.Pljevlja).toBe('READY_present');
    expect(report.city_coverage.Rožaje).toBe('A_legitimate_no_local_gym');
    expect(report.city_coverage.Kotor).toBe('READY_present');
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.cross_border.croatia_ready).toBe(0);
    expect(report.cross_border.bosnia_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.cross_border.albania_ready).toBe(0);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
  });

  test('projected catalog; Phase3 NO; merge ready; check-in unchanged', () => {
    expect(report.projected_catalog).toBe(PHASE2_PROJECTED);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(report.phase3_required).toBe(false);
    expect(report.merge_ready).toBe(true);
    expect(report.verdict).toBe('READY FOR MONTENEGRO MERGE');
    expect(report.new_legitimate_gyms_discovered).toBeGreaterThanOrEqual(5);
    expect(isMontenegroCountry('Crna Gora')).toBe(true);
    expect(String((resolveGymOrStub('me_nonexistent_test') as {region?: string}).region || '')).toMatch(
      /Montenegro/i,
    );
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
