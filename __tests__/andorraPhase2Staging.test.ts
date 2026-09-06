/**
 * Andorra Phase 2 staging — independent + municipal finalization (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAndorraCoordinate,
  ANDORRA_POSTAL_RE,
  isAndorraCountry,
  isLiechtensteinCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE2_REPORT_SHA256 =
  'b4f155e2501d10af07eded1ca1342f06784f5f122f4e51bb081ebf943cdb0bbc';

const P1_CANDIDATE_IDS = [
  'ad_8989e7b07f',
  'ad_488e241114',
  'ad_1fb5491cda',
  'ad_9447826d36',
  'ad_6fc179f949',
  'ad_2594f0bd4f',
  'ad_be0d30a1f0',
  'ad_2759cd904a',
  'ad_cfb6dcda5e',
  'ad_918cf36646',
  'ad_8e838a1d13',
  'ad_886040e59f',
  'ad_ae9200b719',
] as const;

const READY_EXPECTED_IDS = new Set([
  'ad_8989e7b07f', // AnyósPark
  'ad_488e241114', // Urban ALV
  'ad_1fb5491cda', // Palau de Gel Canillo
  'ad_6fc179f949', // Duplex
  'ad_2594f0bd4f', // NEXT
  'ad_be0d30a1f0', // Princiesport
  'ad_2759cd904a', // Serradells
  'ad_cfb6dcda5e', // Escaldes
  'ad_918cf36646', // CEO Ordino
  'ad_8e838a1d13', // Encamp
  'ad_886040e59f', // Pas de la Casa
  'ad_ae9200b719', // LAUesport
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
  parish?: string;
  phase2_classification?: string;
};

describe('Andorra Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/andorra/andorra_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE2_READINESS_REPORT.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE1_READY_TO_IMPORT.json',
  );
  const phase1SnapshotPath = path.join(
    __dirname,
    '../data/andorra/phase2/phase1_staging_snapshot.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/andorra/ANDORRA_PHASE2_REBRAND_MAP.json',
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
    andorra_live?: number;
    liechtenstein_live?: number;
    class_a_chains?: number;
    class_a_locations_ready?: number;
    ready_by_eligibility?: Record<string, number>;
    dq_gates?: Record<string, number>;
    parish_coverage?: Record<string, string>;
    unexplained_parish_bd_gaps?: number;
    seasonal_arinsal?: {verdict?: string};
    unique_staged?: number;
    phase1_needs_review_recovered?: number;
    new_legitimate_gyms_discovered?: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const byId = Object.fromEntries(staging.map(r => [r.id, r]));
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{id: string; country?: string}>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  it('production reflects San Marino merge (11721 / LI 7 / AD 12); Phase 2 report SHA frozen', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.id.startsWith('ad_')).length).toBe(12);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11699);
    expect(report.production_sha256).toBe(PHASE2_REPORT_SHA256);
    expect(report.andorra_live).toBe(0);
    expect(report.liechtenstein_live).toBe(7);
  });

  it('Phase 1 reconciliation preserved; Phase 1 READY still empty', () => {
    expect(phase1Ready.length).toBe(0);
    expect(phase1Snapshot.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(13);
    expect(report.phase1_needs_review_recovered).toBe(13);
    for (const id of P1_CANDIDATE_IDS) {
      expect(byId[id]).toBeTruthy();
    }
  });

  it('READY = 12 SMALL_MARKET_INDEPENDENT; Class A = 0; IDs unique ad_*', () => {
    expect(ready.length).toBe(12);
    expect(report.ready_count).toBe(12);
    expect(report.ready_by_eligibility?.CHAIN_CLASS_A).toBe(0);
    expect(report.ready_by_eligibility?.SMALL_MARKET_INDEPENDENT).toBe(12);
    expect(report.class_a_chains).toBe(0);
    expect(report.class_a_locations_ready).toBe(0);
    expect(report.small_market_model).toBe('INDEPENDENT_PHASE_EXECUTED');
    expect(new Set(ready.map(r => r.id)).size).toBe(12);
    expect(new Set(staging.map(r => r.id)).size).toBe(staging.length);
    for (const r of ready) {
      expect(r.id.startsWith(GYM_ID_PREFIX.andorra)).toBe(true);
      expect(r.id).toMatch(/^ad_[a-f0-9]{10}$/);
      expect(READY_EXPECTED_IDS.has(r.id)).toBe(true);
      expect(r.eligibility_path).toBe('SMALL_MARKET_INDEPENDENT');
      expect(r.import_category).toBe('READY_TO_IMPORT'); // Phase 2 READY artifact frozen
    }
    for (const r of staging) {
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
  });

  it('READY DQ: AD postcodes, addresses, parishes, LI coords, no ES/FR/fallback', () => {
    for (const r of ready) {
      expect(ANDORRA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.address.trim().length).toBeGreaterThan(3);
      expect(r.city.trim().length).toBeGreaterThan(0);
      expect(String(r.parish || '').trim().length).toBeGreaterThan(0);
      expect(isPlausibleAndorraCoordinate(r.lat as number, r.lng as number)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(r.country).toBe('Andorra');
    }
    expect(report.dq_gates?.spanish_contamination).toBe(0);
    expect(report.dq_gates?.french_contamination).toBe(0);
    expect(report.dq_gates?.foreign_outliers).toBe(0);
    expect(report.dq_gates?.fallback_coordinates).toBe(0);
    expect(report.dq_gates?.duplicate_ids).toBe(0);
    expect(report.dq_gates?.hard_duplicate_problems).toBe(0);
  });

  it('operator decisions: Urban/Anyós/Duplex/NEXT/Princiesport/municipals MERGED; Arinsal seasonal EXCLUDED', () => {
    const promoted = new Set([
      'ad_8989e7b07f',
      'ad_488e241114',
      'ad_1fb5491cda',
      'ad_6fc179f949',
      'ad_2594f0bd4f',
      'ad_be0d30a1f0',
      'ad_2759cd904a',
      'ad_cfb6dcda5e',
      'ad_918cf36646',
      'ad_8e838a1d13',
      'ad_886040e59f',
      'ad_ae9200b719',
    ]);
    for (const id of promoted) {
      expect(['READY_TO_IMPORT', 'MERGED_INTO_CATALOG']).toContain(byId[id].import_category);
    }
    expect(byId.ad_1fb5491cda.brand).toBe('Palau de Gel');
    expect(byId.ad_9447826d36.import_category).toBe('EXCLUDED');
    expect(byId.ad_9447826d36.phase2_classification).toBe('EXCLUDED_SEASONAL');
    expect(report.seasonal_arinsal?.verdict).toBe('EXCLUDED_SEASONAL');
  });

  it('no residual NEEDS_REVIEW; Caldea/CrossFit/Casa Wellness excluded; rebrand clean', () => {
    expect(staging.filter(r => r.import_category === 'NEEDS_REVIEW').length).toBe(0);
    expect(staging.filter(r => r.import_category === 'MERGED_INTO_CATALOG' || r.import_category === 'READY_TO_IMPORT').length).toBe(12);
    expect(staging.filter(r => r.import_category === 'EXCLUDED').length).toBe(42);
    expect(staging.some(r => /Caldea/i.test(r.name) && r.import_category === 'EXCLUDED')).toBe(
      true,
    );
    expect(
      staging.filter(r => /CrossFit/i.test(r.brand) && r.import_category === 'EXCLUDED').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      staging.some(r => /Casa Wellness/i.test(r.name) && r.import_category === 'EXCLUDED'),
    ).toBe(true);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(report.dq_gates?.unresolved_rebrand_conflicts).toBe(0);
  });

  it('all 7 parishes READY_present; unexplained B/D gaps = 0', () => {
    for (const p of [
      'Andorra la Vella',
      'Escaldes-Engordany',
      'La Massana',
      'Canillo',
      'Ordino',
      'Encamp',
      'Sant Julià de Lòria',
    ]) {
      expect(report.parish_coverage?.[p]).toBe('READY_present');
    }
    expect(report.unexplained_parish_bd_gaps).toBe(0);
    expect(report.new_legitimate_gyms_discovered).toBe(0);
  });

  it('verdict READY FOR MERGE; Phase 3 not required; projected under 12500', () => {
    expect(report.verdict).toBe('READY FOR ANDORRA MERGE');
    expect(report.phase3_required).toBe(false);
    expect(report.projected_catalog_if_merged).toBe(11711);
    expect(report.projected_catalog_if_merged!).toBeLessThan(12500);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(isAndorraCountry('Andorra')).toBe(true);
    expect(isLiechtensteinCountry('Liechtenstein')).toBe(true);
    expect(GYM_ID_PREFIX.andorra).toBe('ad_');
  });
});
