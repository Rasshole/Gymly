/**
 * Monaco Phase 2 staging — independent + municipal finalization (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMonacoCoordinate,
  MONACO_POSTAL_RE,
  isMonacoCountry,
  isAndorraCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE_REPORT_PRODUCTION_SHA256 =
  'bde8ba6b5ac7467078e971732e0deeb42e3fb338f5280f390d8395714792f02f';

const P1_CANDIDATE_IDS = [
  'mc_4d51f17fbd',
  'mc_acfff20d6b',
  'mc_cb57fc40d1',
  'mc_2771a49489',
] as const;

const READY_EXPECTED_IDS = new Set([
  'mc_4d51f17fbd', // Fit Factory
  'mc_acfff20d6b', // Eclub
  'mc_cb57fc40d1', // Hercule
  'mc_2771a49489', // Stade Louis II
]);

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
  district?: string;
  phase2_classification?: string;
};

describe('Monaco Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/monaco/monaco_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE2_READINESS_REPORT.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE1_READY_TO_IMPORT.json',
  );
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/monaco/phase2/phase1_staging_snapshot.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/monaco/MONACO_PHASE2_REBRAND_MAP.json',
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
    monaco_live?: number;
    andorra_live?: number;
    class_a_chains?: number;
    class_a_locations_ready?: number;
    ready_by_eligibility?: Record<string, number>;
    dq_gates?: Record<string, number>;
    district_coverage?: Record<string, string>;
    unexplained_district_bd_gaps?: number;
    unique_staged?: number;
    phase1_needs_review_recovered?: number;
    new_legitimate_gyms_discovered?: number;
    municipal_identity?: {classification?: string};
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const byId = Object.fromEntries(staging.map(r => [r.id, r]));
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11721 / MC 4 / AD 12); Phase 2 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.id.startsWith('mc_')).length).toBe(4);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11711);
    expect(report.production_sha256).toBe(PHASE_REPORT_PRODUCTION_SHA256);
    expect(report.monaco_live).toBe(0);
    expect(report.andorra_live).toBe(12);
  });

  it('Phase 1 reconciliation preserved; Phase 1 READY still empty', () => {
    expect(phase1Ready.length).toBe(0);
    expect(phase1Snapshot.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(4);
    expect(report.phase1_needs_review_recovered).toBe(4);
    for (const id of P1_CANDIDATE_IDS) {
      expect(byId[id]).toBeTruthy();
    }
  });

  it('READY artifact = 4 SMALL_MARKET_INDEPENDENT; Class A = 0; staging now MERGED', () => {
    expect(ready.length).toBe(4);
    expect(report.ready_count).toBe(4);
    expect(report.ready_by_eligibility?.CHAIN_CLASS_A).toBe(0);
    expect(report.ready_by_eligibility?.SMALL_MARKET_INDEPENDENT).toBe(4);
    expect(report.class_a_chains).toBe(0);
    expect(report.class_a_locations_ready).toBe(0);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_EXECUTED');
    expect(new Set(ready.map(r => r.id)).size).toBe(4);
    expect(new Set(staging.map(r => r.id)).size).toBe(staging.length);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(4);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    for (const r of ready) {
      expect(r.id.startsWith(GYM_ID_PREFIX.monaco)).toBe(true);
      expect(r.id).toMatch(/^mc_[a-f0-9]{10}$/);
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

  it('READY DQ: MC postcodes, addresses, districts, Monaco coords, no FR/fallback', () => {
    for (const r of ready) {
      expect(MONACO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(String(r.district || '').trim().length).toBeGreaterThan(0);
      expect(isPlausibleMonacoCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.country).toBe('Monaco');
    }
    expect(report.dq_gates?.french_contamination).toBe(0);
    expect(report.dq_gates?.foreign_outliers).toBe(0);
    expect(report.dq_gates?.fallback_coordinates).toBe(0);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.hard_duplicate_problems).toBe(0);
    expect(report.dq_gates?.hotel_spa_private_leakage).toBe(0);
  });

  it('operator decisions: Fit Factory/Eclub/Hercule/Stade Louis II MERGED; distinct municipals', () => {
    expect(byId.mc_4d51f17fbd.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.mc_4d51f17fbd.brand).toBe('Fit Factory');
    expect(byId.mc_acfff20d6b.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.mc_acfff20d6b.brand).toBe('Eclub');
    expect(byId.mc_cb57fc40d1.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.mc_cb57fc40d1.brand).toBe('Hercule Fitness Club');
    expect(byId.mc_2771a49489.import_category).toBe('MERGED_INTO_CATALOG');
    expect(byId.mc_2771a49489.brand).toBe('Stade Louis II');
    expect(report.municipal_identity?.classification).toBe('A_DISTINCT_PUBLIC_GYMS');
    // Distinct premises
    expect(byId.mc_cb57fc40d1.city).toBe('La Condamine');
    expect(byId.mc_2771a49489.city).toBe('Fontvieille');
  });

  it('no residual NEEDS_REVIEW; hotel/spa/World Class excluded; rebrand clean', () => {
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'NEEDS_COORDINATES').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'READY_TO_IMPORT').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG').length).toBe(4);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(35);
    expect(staging.some(r => /Fairmont|Thermes Marins|39 Monte-Carlo/i.test(`${r.brand} ${r.name}`) && r.import_category === 'EXCLUDED')).toBe(true);
    expect(
      staging.some(r => /World Class/i.test(r.brand) && /Cap/i.test(r.name) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
  });

  it('district coverage; unexplained B/D gaps = 0; no new gyms', () => {
    expect(report.district_coverage?.['Monte-Carlo']).toBe('READY_present');
    expect(report.district_coverage?.['La Condamine']).toBe('READY_present');
    expect(report.district_coverage?.['Fontvieille']).toBe('READY_present');
    expect(report.district_coverage?.['Larvotto']).toBe('READY_present');
    expect(report.unexplained_district_bd_gaps).toBe(0);
    expect(report.new_legitimate_gyms_discovered).toBe(0);
  });

  it('verdict READY FOR MERGE; Phase 3 not required; projected under 12500', () => {
    expect(report.verdict).toBe('READY FOR MONACO MERGE');
    expect(report.phase3_required).toBe(false);
    expect(report.projected_catalog_if_merged).toBe(11715);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(isMonacoCountry('Monaco')).toBe(true);
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(GYM_ID_PREFIX.monaco).toBe('mc_');
  });
});
