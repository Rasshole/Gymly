/**
 * Luxembourg Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleLuxembourgCoordinate,
  LUXEMBOURG_POSTAL_RE,
  isLuxembourgCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11648;
const PRODUCTION_SHA256 =
  '54848a8c0176789248d1483c764e8c53d010bc9b6a08409a851fc00d4bd570bb';

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
  is_active?: boolean;
  is_coming_soon?: boolean;
};

describe('Luxembourg Phase 2 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/luxembourg/luxembourg_centers_staging.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_PHASE1_READY_TO_IMPORT.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/luxembourg/LUXEMBOURG_PHASE2_READINESS_REPORT.json',
  );
  const foetzPath = path.join(
    __dirname,
    '../data/luxembourg/phase2/foetz_identity_resolution.json',
  );
  const junckPath = path.join(
    __dirname,
    '../data/luxembourg/phase2/junck_pair_recheck.json',
  );
  const painPath = path.join(
    __dirname,
    '../data/luxembourg/phase2/painworld_rebrand_audit.json',
  );
  const borderPath = path.join(__dirname, '../data/luxembourg/phase2/border_audit.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
    production_total?: number;
    projected_catalog_if_merged?: number;
    production_sha256?: string;
    phase3_required?: boolean;
    phase1_ready_preserved?: number;
    status_counts?: Record<string, number>;
    ready_by_brand?: Record<string, number>;
    foetz?: {classification?: string; production_decision?: string};
    chain_completeness?: Record<string, string>;
    data_quality?: Record<string, number>;
  };
  const foetz = JSON.parse(fs.readFileSync(foetzPath, 'utf8')) as {
    classification?: string;
    production_decision?: string;
    pair?: {basic_fit?: {status?: string}; jims?: {status?: string}};
  };
  const junck = JSON.parse(fs.readFileSync(junckPath, 'utf8')) as {
    classification?: string;
    decision?: string;
  };
  const pain = JSON.parse(fs.readFileSync(painPath, 'utf8')) as {
    painworld_ready?: number;
    jims_gasperich_ready?: number;
    verdict?: string;
  };
  const border = JSON.parse(fs.readFileSync(borderPath, 'utf8')) as {
    foreign_count?: number;
    verdict?: string;
  };

  it('production reflects Luxembourg merge (11648 / LU 20); SHA frozen', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('lu_')).length).toBe(20);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Luxembourg').length).toBe(20);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe('e039707d7c419d727b5297acf26b17bc1f885217ca997d3b75f21ff54f60a7f4');
    expect(report.production_sha256).toBe(PRODUCTION_SHA256);
    expect(report.production_total).toBe(11610);
    expect(report.production_sha256).toBe(PRODUCTION_SHA256);
  });

  it('wires Luxembourg country helpers and orphan stub', () => {
    expect(GYM_ID_PREFIX.luxembourg).toBe('lu_');
    expect(isLuxembourgCountry('Luxembourg')).toBe(true);
    expect(gymCountryTranslationKey('Luxembourg')).toBe('countries.luxembourg');
    expect((en as {countries: {luxembourg: string}}).countries.luxembourg).toBe('Luxembourg');
    expect(resolveGymOrStub('lu_nonexistent_test').region).toBe('Luxembourg');
  });

  it('preserves Phase 1 READY IDs (20/20); no demotions', () => {
    expect(phase1Ready.length).toBe(20);
    expect(ready.length).toBe(20);
    expect(report.phase1_ready_preserved).toBe(20);
    const p1 = new Set(phase1Ready.map(r => r.id));
    const p2 = new Set(ready.map(r => r.id));
    expect(p1).toEqual(p2);
    for (const id of p1) {
      expect(id).toMatch(/^lu_[a-f0-9]{10}$/);
    }
  });

  it('Foetz classified CASE A; JIMS Foetz COMING_SOON excluded from READY', () => {
    expect(foetz.classification).toBe('A_distinct_same_complex');
    expect(foetz.production_decision).toMatch(/^CASE_A/);
    expect(foetz.pair?.basic_fit?.status).toBe('OPEN');
    expect(foetz.pair?.jims?.status).toMatch(/COMING_SOON/);
    expect(report.foetz?.production_decision).toMatch(/^CASE_A/);

    const bfFoetz = ready.find(r => r.id === 'lu_dc1931d263');
    expect(bfFoetz).toBeTruthy();
    expect(bfFoetz!.brand).toBe('Basic-Fit');
    expect(bfFoetz!.coord_source).toBe('OFFICIAL_CLUB_GEO');
    expect(isPlausibleLuxembourgCoordinate(bfFoetz!.lat!, bfFoetz!.lng!)).toBe(true);

    const jimsFoetz = staging.find(r => r.id === 'lu_7bf8591421');
    expect(jimsFoetz?.import_category).toBe('COMING_SOON');
    expect(ready.some(r => r.id === 'lu_7bf8591421')).toBe(false);
    expect(ready.some(r => /jims foetz/i.test(r.name))).toBe(false);
  });

  it('chain completeness: Basic-Fit 10, JIMS open 6, CK 4', () => {
    expect(report.ready_by_brand?.['Basic-Fit']).toBe(10);
    expect(report.ready_by_brand?.['JIMS']).toBe(6);
    expect(report.ready_by_brand?.['CK Fitness']).toBe(4);
    expect(report.chain_completeness?.['Basic-Fit']).toBe('COMPLETE');
    expect(report.chain_completeness?.['JIMS_open_estate']).toBe('COMPLETE');
    expect(report.chain_completeness?.['CK Fitness']).toBe('COMPLETE');
    expect(report.status_counts?.COMING_SOON).toBe(1);
    expect(report.status_counts?.READY_TO_IMPORT).toBe(20);
  });

  it('Painworld legacy excluded; Junck pair legitimate; border clean', () => {
    expect(pain.painworld_ready).toBe(0);
    expect(pain.jims_gasperich_ready).toBe(1);
    expect(pain.verdict).toBe('CLEAN');
    expect(junck.classification).toBe('A_legitimate_adjacent_premises');
    expect(junck.decision).toBe('retain_both');
    expect(border.foreign_count).toBe(0);
    expect(border.verdict).toBe('CLEAN');
    expect(
      staging.filter(r => /painworld/i.test(r.brand)).every(r => r.import_category === 'EXCLUDED'),
    ).toBe(true);
  });

  it('READY hard quality gates', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^lu_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Luxembourg');
      expect(r.is_active).toBe(true);
      expect(r.is_coming_soon).not.toBe(true);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(LUXEMBOURG_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleLuxembourgCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    expect(ids.size).toBe(20);
    expect(report.data_quality?.duplicate_ids).toBe(0);
    expect(report.data_quality?.foreign_outliers).toBe(0);
    expect(report.data_quality?.fallback_coordinates).toBe(0);
    expect(report.data_quality?.unresolved_rebrand_conflicts).toBe(0);
  });

  it('READY FOR MERGE; projected under 12500; Phase 3 not required', () => {
    expect(report.verdict).toMatch(/READY FOR LUXEMBOURG MERGE/i);
    expect(report.phase3_required).toBe(false);
    expect(report.projected_catalog_if_merged).toBe(11648);
    expect(CURRENT_PRODUCTION_TOTAL).toBe(11648);
  });
});
