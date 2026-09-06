/**
 * Romania Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleRomaniaCoordinate,
  ROMANIA_POSTAL_RE,
} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11254;
const PHASE2_DOCUMENTED_PRODUCTION_TOTAL = 11063;
const POST_MERGE_SHA256 =
  '91ffadd49497614f96eaf11f9d01edbdb127df2a6d8ce87bb7d7ad4443717840';
const FOREIGN =
  /\b(hungary|magyarország|serbia|beograd|bulgaria|ukraine|kyiv)\b/i;
/** True Moldova contamination — not Bucharest street "Bulevardul Chișinău". */
function isMoldovaContamination(r: StagingRow): boolean {
  const city = (r.city || '').toLowerCase();
  const country = (r.country || '').toLowerCase();
  return (
    country === 'moldova' ||
    city === 'chișinău' ||
    city === 'chisinau'
  );
}

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

describe('Romania Phase 2 staging', () => {
  const stagingPath = path.join(
    __dirname,
    '../data/romania/romania_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_PHASE2_READINESS_REPORT.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_PHASE1_READY_TO_IMPORT.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    verdict: string;
    phase1_ready?: number;
  };
  const phase1Ready = JSON.parse(
    fs.readFileSync(phase1ReadyPath, 'utf8'),
  ) as StagingRow[];
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('live catalog post-Romania merge; Phase 2 report retains pre-merge baseline', () => {
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE2_DOCUMENTED_PRODUCTION_TOTAL);
    expect(production.filter(c => c.country === 'Romania').length).toBe(154);
    expect(production.filter(c => String(c.id || '').startsWith('ro_')).length).toBe(154);
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(POST_MERGE_SHA256);
  });

  test('READY count matches canonical Phase 2 READY file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
  });

  test('all READY IDs are unique ro_* with Romania country', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^ro_[a-f0-9]{10}$/);
      expect(r.country).toBe('Romania');
      expect(r.is_active).toBe(true);
      expect(r.is_coming_soon).not.toBe(true);
      expect(r.is_closed).not.toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(ready.length);
  });

  test('READY rows have required fields, valid 6-digit postcodes, finite coords', () => {
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(ROMANIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(String(r.postal_code).length).toBe(6);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat!)).toBe(true);
      expect(Number.isFinite(r.lng!)).toBe(true);
      expect(isPlausibleRomaniaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(isMoldovaContamination(r)).toBe(false);
    }
  });

  test('leading-zero postcodes preserved in READY', () => {
    const leadingZero = ready.filter(r => String(r.postal_code).startsWith('0'));
    expect(leadingZero.length).toBeGreaterThan(0);
    for (const r of leadingZero) {
      expect(String(r.postal_code)).toMatch(/^0\d{5}$/);
    }
  });

  test('excluded statuses absent from READY file', () => {
    const excluded = new Set([
      'COMING_SOON',
      'CLOSED',
      'NEEDS_COORDINATES',
      'NEEDS_REVIEW',
      'DUPLICATE',
      'LEGACY',
    ]);
    expect(ready.every(r => !excluded.has(r.import_category))).toBe(true);
  });

  test('Phase 1 READY reconciled — majority preserved by ID when still valid', () => {
    const p2Ids = new Set(ready.map(r => r.id));
    const preserved = phase1Ready.filter(r => p2Ids.has(r.id)).length;
    // Allow some attrition from re-discovery / reclassification; require material retention
    expect(preserved).toBeGreaterThanOrEqual(Math.floor(phase1Ready.length * 0.5));
    expect(phase1Ready.length).toBe(63);
  });

  test('major chains present in READY when Phase 2 succeeds coverage', () => {
    const brands = new Set(ready.map(r => r.brand));
    expect(brands.has('World Class')).toBe(true);
    expect(brands.has('18GYM')).toBe(true);
    expect(brands.has('Stay Fit Gym')).toBe(true);
  });

  test('no duplicate IDs across full staging', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
