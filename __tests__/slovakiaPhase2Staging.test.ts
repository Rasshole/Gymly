/**
 * Slovakia Phase 2 staging — canonical READY before merge decision (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSlovakiaCoordinate,
  SLOVAKIA_POSTAL_RE,
  CZECHIA_POSTAL_RE,
  isSlovakiaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {resolveGymOrStub} from '../src/utils/gymDisplay';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11254;
const PHASE2_DOCUMENTED_PRODUCTION_TOTAL = 11217;
const POST_MERGE_SHA256 =
  '91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840';
const FOREIGN =
  /\b(czechia|česko|praha|austria|österreich|wien|vienna|hungary|magyarország|poland|polska|ukraine|kyiv|uzhhorod)\b/i;

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
  is_closed?: boolean;
};

describe('Slovakia Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/slovakia/slovakia_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_PHASE2_READY_TO_IMPORT.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_PHASE2_READINESS_REPORT.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
    production_total?: number;
    projected_catalog?: number;
    status_counts?: Record<string, number>;
    brands?: Record<string, {ready?: number; verdict?: string}>;
  };

  it('live catalog post-Slovakia merge; Phase 2 report retains pre-merge baseline', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(sha).toBe(POST_MERGE_SHA256);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('sk_')).length).toBe(37);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Slovakia').length).toBe(37);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.production_total).toBe(PHASE2_DOCUMENTED_PRODUCTION_TOTAL);
    expect(report.projected_catalog).toBe(11254);
  });

  it('canonical READY count and verdict (Phase 2 artifact)', () => {
    expect(ready.length).toBe(37);
    expect(report.ready_count).toBe(37);
    expect(report.verdict).toMatch(/READY FOR SLOVAKIA MERGE/i);
    expect(GYM_ID_PREFIX.slovakia).toBe('sk_');
    expect(isSlovakiaCountry('Slovakia')).toBe(true);
    expect(resolveGymOrStub('sk_nonexistent_test').region).toBe('Slovakia');
  });

  it('status counts: 37 MERGED, 3 COMING_SOON, 1 CLOSED, 0 NEEDS_*', () => {
    const cats = staging.reduce<Record<string, number>>((acc, r) => {
      acc[r.import_category] = (acc[r.import_category] || 0) + 1;
      return acc;
    }, {});
    expect(cats.MERGED_INTO_CATALOG).toBe(37);
    expect(cats.READY_TO_IMPORT || 0).toBe(0);
    expect(cats.COMING_SOON).toBe(3);
    expect(cats.CLOSED).toBe(1);
    expect(cats.NEEDS_COORDINATES || 0).toBe(0);
    expect(cats.NEEDS_REVIEW || 0).toBe(0);
  });

  it('READY brand breakdown exact', () => {
    const byBrand = ready.reduce<Record<string, number>>((acc, r) => {
      acc[r.brand] = (acc[r.brand] || 0) + 1;
      return acc;
    }, {});
    expect(byBrand['Form Factory']).toBe(15);
    expect(byBrand['Golem Club']).toBe(11);
    expect(byBrand['365 Fit&Co']).toBe(8);
    expect(byBrand.FITINN).toBe(3);
  });

  it('preserves Phase 1 READY IDs in Phase 2 READY set', () => {
    const readyIds = new Set(ready.map(r => r.id));
    const missing = phase1Ready.filter(r => !readyIds.has(r.id));
    expect(missing).toEqual([]);
  });

  it('all READY rows are unique sk_* with valid SK geography/PSČ', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^sk_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Slovakia');
      expect(r.is_coming_soon).not.toBe(true);
      expect(r.is_closed).not.toBe(true);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(SLOVAKIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(CZECHIA_POSTAL_RE.test(String(r.postal_code))).toBe(false);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleSlovakiaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    expect(ids.size).toBe(37);
  });

  it('excludes coming-soon Form Factory and Digital Park closed', () => {
    const coming = staging.filter(r => r.import_category === 'COMING_SOON');
    expect(coming.length).toBe(3);
    expect(coming.every(r => /budatínska|europa|slnečnice|slnecnice/i.test(r.name))).toBe(true);
    const closed = staging.filter(r => r.import_category === 'CLOSED');
    expect(closed.some(r => /digital\s*park/i.test(r.name))).toBe(true);
    const readyIds = new Set(ready.map(r => r.id));
    for (const r of [...coming, ...closed]) {
      expect(readyIds.has(r.id)).toBe(false);
    }
  });

  it('excludes EfectFit / MultiSport aggregators; FitCamp only as Form Factory club', () => {
    expect(ready.filter(r => /efectfit|multisport|^esx$/i.test(`${r.brand}`)).length).toBe(0);
    expect(ready.filter(r => /^FitCamp$/i.test(r.brand)).length).toBe(0);
    // Form Factory FitCamp location is the current successor club — allowed
    expect(ready.some(r => r.brand === 'Form Factory' && /fitcamp/i.test(r.name))).toBe(true);
  });

  it('recovers Sky Park + full 365 Fit&Co 8-club estate', () => {
    expect(ready.some(r => /sky\s*park/i.test(r.name))).toBe(true);
    const fit365 = ready.filter(r => r.brand === '365 Fit&Co');
    expect(fit365.length).toBe(8);
    expect(fit365.some(r => /hypertesco/i.test(r.name))).toBe(true);
    expect(fit365.some(r => /roca/i.test(r.name))).toBe(true);
    expect(fit365.some(r => /južanka|juzanka/i.test(r.name))).toBe(true);
    expect(fit365.some(r => /spišská|spisska/i.test(r.name))).toBe(true);
    const juz = fit365.find(r => /južanka|juzanka/i.test(r.name))!;
    expect(juz.postal_code).toBe('911 08');
  });

  it('preserves Slovak diacritics in display cities', () => {
    expect(ready.some(r => r.city === 'Košice')).toBe(true);
    expect(ready.some(r => r.city === 'Žilina')).toBe(true);
    expect(normalizeGymSearchValue('Košice')).toBe('kosice');
    expect(normalizeGymSearchValue('Žilina')).toBe('zilina');
  });

  it('chain verdicts are complete/near-complete for merge', () => {
    expect(report.brands?.['Golem Club']?.verdict).toMatch(/COMPLETE/i);
    expect(report.brands?.['365 Fit&Co']?.verdict).toMatch(/COMPLETE/i);
    expect(report.brands?.FITINN?.verdict).toMatch(/COMPLETE/i);
    expect(report.brands?.['Form Factory']?.verdict).toMatch(/COMPLETE|NEAR-COMPLETE/i);
  });
});
