/**
 * Greece Deep Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleGreeceCoordinate, GREECE_POSTAL_RE} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CYPRUS_RE = /κύπρος|cyprus|λευκωσία|nicosia|lefkosia/i;
const PHASE2_DOCUMENTED_PRODUCTION_TOTAL = 10772;
const CURRENT_PRODUCTION_TOTAL = 11254;

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
  notes?: string;
};

describe('Greece Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/greece/greece_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/greece/GREECE_PHASE2_READY_TO_IMPORT.json');
  const reportPath = path.join(__dirname, '../data/greece/GREECE_PHASE2_READINESS_REPORT.json');
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/greece/GREECE_PHASE1_READY_TO_IMPORT.json',
  );
  const rebrandPath = path.join(__dirname, '../data/greece/GREECE_PHASE2_REBRAND_MAP.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    production_greece: number;
    phase1_ready: number;
    phase1_ready_preserved: number;
    verdict: string;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    phase1_ready_preserved_count: number;
  };
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('Phase 2 report documents pre-merge baseline; current production is post-merge', () => {
    expect(report.production_total).toBe(PHASE2_DOCUMENTED_PRODUCTION_TOTAL);
    expect(report.production_greece).toBe(0);
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(production.filter(c => c.country === 'Greece').length).toBe(106);
    expect(production.filter(c => String(c.id || '').startsWith('gr_')).length).toBe(106);
  });

  test('READY count matches canonical READY file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(ready.length).toBe(106);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(106);
  });

  test('all READY IDs are unique gr_* with Greece country', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^gr_[a-f0-9]{10}$/);
      expect(r.country).toBe('Greece');
      expect(r.is_active).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(ready.length);
  });

  test('READY rows have required fields, valid GR postcodes, finite Greece coords', () => {
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(GREECE_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat!)).toBe(true);
      expect(Number.isFinite(r.lng!)).toBe(true);
      expect(isPlausibleGreeceCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(CYPRUS_RE.test(blob)).toBe(false);
    }
  });

  test('islands may be present; foreign countries and Cyprus excluded', () => {
    const islandHit = ready.some(r =>
      /ηράκλειο|χανιά|ρόδος|κρήτ|crete|rhodes|chania|zakynth|σύρο|σαλαμίν/i.test(
        `${r.city} ${r.name} ${r.address}`,
      ),
    );
    expect(islandHit).toBe(true);
    for (const r of ready) {
      expect(r.id.startsWith('cy_')).toBe(false);
      expect(/albania|bulgaria|turkey|north macedonia|cyprus|κύπρος/i.test(`${r.country} ${r.city}`)).toBe(
        false,
      );
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
    for (const cat of excluded) {
      for (const r of staging.filter(x => x.import_category === cat)) {
        expect(ready.find(x => x.id === r.id)).toBeUndefined();
      }
    }
  });

  test('Yava and Holmes Place appear in READY set after Phase 2', () => {
    expect(ready.some(r => r.brand === 'Yava')).toBe(true);
    expect(ready.filter(r => r.brand === 'Holmes Place').length).toBeGreaterThanOrEqual(2);
  });

  test('Phase 1 READY reconciliation is documented and mostly preserved', () => {
    expect(report.phase1_ready).toBe(phase1Ready.length);
    expect(rebrand.phase1_ready_preserved_count).toBe(report.phase1_ready_preserved);
    expect(report.phase1_ready_preserved).toBeGreaterThan(40);
  });

  test('Phase 2 verdict is one of the allowed strings', () => {
    expect([
      'READY FOR GREECE MERGE',
      'GREECE PHASE 3 REQUIRED BEFORE MERGE',
    ]).toContain(report.verdict);
  });
});
