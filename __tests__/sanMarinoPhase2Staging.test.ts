/**
 * San Marino Phase 2 staging — independent + public gym finalization (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSanMarinoCoordinate,
  SAN_MARINO_POSTAL_RE,
  isSanMarinoCountry,
  isMonacoCountry,
  isAndorraCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback|castello.?approx/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_REPORT_SHA256 =
  '0e21508d09f038bcd4d20d59f37f8b09d326faa9ecacf262e09db330852e0c28';

const P1_CANDIDATE_IDS = [
  'sm_54007fb102', // Dynamic Fitness Center
  'sm_8e18d472a9', // Phisicol
  'sm_cc1fd3ba1d', // Energia
  'sm_3c035258fb', // MOVE
  'sm_d1cb014d10', // FSBB
  'sm_a5d9743343', // FitLife
] as const;

const READY_EXPECTED_IDS = new Set(P1_CANDIDATE_IDS);

const VALID_STATUS = new Set([
  'READY_TO_IMPORT',
  'NEEDS_COORDINATES',
  'NEEDS_REVIEW',
  'COMING_SOON',
  'CLOSED',
  'DUPLICATE',
  'LEGACY',
  'EXCLUDED',
  'MERGED_INTO_CATALOG',
]);

type StagingRow = {
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
  eligibility_path?: string | null;
  discovery_class?: string;
  castello?: string;
  district?: string;
  phase2_classification?: string;
};

describe('San Marino Phase 2 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/san-marino/san_marino_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE2_READINESS_REPORT.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE1_READY_TO_IMPORT.json',
  );
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/san-marino/phase2/phase1_staging_snapshot.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/san-marino/SAN_MARINO_PHASE2_REBRAND_MAP.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const phase1Snapshot = JSON.parse(
    fs.readFileSync(phase1SnapshotPath, 'utf8'),
  ) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    production_total?: number;
    production_sha256?: string;
    ready_count?: number;
    status_counts?: Record<string, number>;
    phase3_required?: boolean;
    verdict?: string;
    small_market_model?: string;
    projected_catalog_if_merged?: number;
    san_marino_live?: number;
    monaco_live?: number;
    andorra_live?: number;
    liechtenstein_live?: number;
    iceland_live?: number;
    class_a_chains?: number;
    class_a_locations_ready?: number;
    ready_by_eligibility?: Record<string, number>;
    dq_gates?: Record<string, number>;
    castello_coverage?: Record<string, string>;
    unexplained_castello_bd_gaps?: number;
    unique_staged?: number;
    phase1_needs_review_recovered?: number;
    phase1_promoted?: number;
    phase1_excluded_from_review?: number;
    new_legitimate_gyms_discovered?: number;
    fsbb_classification?: string;
    energia_wellness_role?: string;
    multieventi_remains_excluded?: boolean;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const byId = Object.fromEntries(staging.map(r => [r.id, r]));
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11800 / SM 6 / MC 4); Phase 2 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.id.startsWith('sm_')).length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11715);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA256);
    expect(report.san_marino_live).toBe(0);
    expect(report.monaco_live).toBe(4);
    expect(report.andorra_live).toBe(12);
    expect(report.liechtenstein_live).toBe(7);
    expect(report.iceland_live).toBe(27);
  });

  it('Phase 1 reconciliation: 6/6 recovered; Phase 1 READY still empty', () => {
    expect(phase1Ready.length).toBe(0);
    expect(phase1Snapshot.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(6);
    expect(report.phase1_needs_review_recovered).toBe(6);
    expect(report.phase1_promoted).toBe(6);
    expect(report.phase1_excluded_from_review).toBe(0);
    for (const id of P1_CANDIDATE_IDS) {
      expect(byId[id]).toBeTruthy();
      expect(phase1Snapshot.find(r => r.id === id)?.import_category).toBe('NEEDS_REVIEW');
    }
  });

  it('READY artifact = 6 SMALL_MARKET_INDEPENDENT; Class A = 0; staging now MERGED', () => {
    expect(ready.length).toBe(6);
    expect(report.ready_count).toBe(6);
    expect(report.ready_by_eligibility?.CHAIN_CLASS_A).toBe(0);
    expect(report.ready_by_eligibility?.SMALL_MARKET_INDEPENDENT).toBe(6);
    expect(report.class_a_chains).toBe(0);
    expect(report.class_a_locations_ready).toBe(0);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_EXECUTED');
    expect(new Set(ready.map(r => r.id)).size).toBe(6);
    expect(new Set(staging.map(r => r.id)).size).toBe(staging.length);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(6);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    for (const r of ready) {
      expect(r.id.startsWith(GYM_ID_PREFIX.sanMarino)).toBe(true);
      expect(r.id).toMatch(/^sm_[a-f0-9]{10}$/);
      expect(READY_EXPECTED_IDS.has(r.id)).toBe(true);
      expect(r.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      expect(r.import_category).toBe('READY_TO_IMPORT'); // frozen Phase 2 artifact
      expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(
        staging.find(s => s.id === r.id)?.import_category,
      );
    }
    for (const r of staging) {
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
  });

  it('READY DQ: SM postcodes, addresses, castelli, San Marino coords, no IT/fallback', () => {
    for (const r of ready) {
      expect(SAN_MARINO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(String(r.castello || r.district || '').trim().length).toBeGreaterThan(0);
      expect(isPlausibleSanMarinoCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.country).toBe('San Marino');
    }
    expect(report.dq_gates?.italian_contamination).toBe(0);
    expect(report.dq_gates?.foreign_outliers).toBe(0);
    expect(report.dq_gates?.fallback_coordinates).toBe(0);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.hard_duplicate_problems).toBe(0);
    expect(report.dq_gates?.hotel_spa_private_leakage).toBe(0);
  });

  it('operator decisions: all six MERGED; FSBB public; Energia additive; Multieventi excluded', () => {
    expect(byId.sm_54007fb102.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.sm_54007fb102.brand).toBe('Dynamic Fitness Center');
    expect(byId.sm_8e18d472a9.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.sm_8e18d472a9.brand).toBe('Phisicol');
    expect(byId.sm_cc1fd3ba1d.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.sm_cc1fd3ba1d.brand).toBe('Energia Wellness & Fitness');
    expect(byId.sm_3c035258fb.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.sm_3c035258fb.brand).toBe('MOVE');
    expect(byId.sm_d1cb014d10.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.sm_d1cb014d10.phase2_classification).toBe('A_PUBLIC_CONVENTIONAL_GYM');
    expect(byId.sm_a5d9743343.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.sm_a5d9743343.brand).toBe('FitLife');
    expect(report.fsbb_classification).toBe('A_PUBLIC_CONVENTIONAL_GYM');
    expect(report.energia_wellness_role).toBe('ADDITIVE');
    expect(report.multieventi_remains_excluded).toBe(true);
    expect(
      staging.some(r => /Multieventi/i.test(r.brand) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(ready.some(r => /Piletas/i.test(`${r.brand} ${r.name}`))).toBe(false);
    expect(ready.some(r => /MoveUP/i.test(`${r.brand} ${r.name}`))).toBe(false);
  });

  it('missed sweep: no new READY; Bodyline/PFC excluded; Games Fit closed; rebrand clean', () => {
    expect(report.new_legitimate_gyms_discovered).toBe(0);
    expect(
      staging.some(
        r => /Bodyline/i.test(r.brand) && r.import_category === 'EXCLUDED',
      ),
    ).toBe(true);
    expect(
      staging.some(r => /PFC Studio/i.test(r.brand) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(
      staging.some(r => /Games Fit/i.test(r.brand) && r.import_category === 'CLOSED'),
    ).toBe(true);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
  });

  it('castello coverage; unexplained B/D gaps = 0', () => {
    expect(report.castello_coverage?.['San Marino']).toBe('READY_present');
    expect(report.castello_coverage?.['Borgo Maggiore']).toBe('READY_present');
    expect(report.castello_coverage?.['Serravalle']).toBe('READY_present');
    expect(report.castello_coverage?.['Domagnano']).toBe('READY_present');
    expect(report.castello_coverage?.['Fiorentino']).toBe('A_legitimate_no_local_gym');
    expect(report.castello_coverage?.['Acquaviva']).toBe('A_legitimate_no_local_gym');
    expect(report.castello_coverage?.['Faetano']).toBe('A_legitimate_no_local_gym');
    expect(report.castello_coverage?.['Chiesanuova']).toBe('A_legitimate_no_local_gym');
    expect(report.castello_coverage?.['Montegiardino']).toBe('A_legitimate_no_local_gym');
    expect(report.unexplained_castello_bd_gaps).toBe(0);
  });

  it('verdict READY FOR MERGE; Phase 3 not required; projected under 12500', () => {
    expect(report.verdict).toBe('READY FOR SAN MARINO MERGE');
    expect(report.phase3_required).toBe(false);
    expect(report.projected_catalog_if_merged).toBe(11721);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(isSanMarinoCountry('San Marino')).toBe(true);
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(GYM_ID_PREFIX.sanMarino).toBe('sm_');
  });
});
