/**
 * Czechia Deep Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {isPlausibleCzechiaCoordinate, CZECHIA_POSTAL_RE} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const PHASE2_DOCUMENTED_PRODUCTION_TOTAL = 10943;
const CURRENT_PRODUCTION_TOTAL = 11254;
const FOREIGN =
  /\b(deutschland|germany|österreich|austria|slovakia|slovensko|poland|polsko)\b/i;

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
  source_url?: string;
};

describe('Czechia Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/czechia/czechia_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/czechia/CZECHIA_PHASE2_READY_TO_IMPORT.json');
  const reportPath = path.join(__dirname, '../data/czechia/CZECHIA_PHASE2_READINESS_REPORT.json');
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/czechia/CZECHIA_PHASE1_READY_TO_IMPORT.json',
  );
  const rebrandPath = path.join(__dirname, '../data/czechia/CZECHIA_PHASE2_REBRAND_MAP.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    production_czechia: number;
    phase1_ready: number;
    phase1_ready_preserved: number;
    verdict: string;
    ready_by_brand: Record<string, number>;
    projected_catalog: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    phase1_ready_preserved_count: number;
  };
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('Phase 2 report documents pre-merge baseline; live catalog is post-merge', () => {
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE2_DOCUMENTED_PRODUCTION_TOTAL);
    expect(report.production_czechia).toBe(0);
    expect(production.filter(c => c.country === 'Czechia').length).toBe(70);
    expect(production.filter(c => String(c.id || '').startsWith('cz_')).length).toBe(70);
  });

  test('READY count matches canonical READY file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(ready.length).toBeGreaterThanOrEqual(65);
  });

  test('all READY IDs are unique cz_* with Czechia country', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^cz_[a-f0-9]{10}$/);
      expect(r.country).toBe('Czechia');
      expect(r.is_active).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(ready.length);
  });

  test('READY rows have required fields, valid CZ postcodes, finite coords', () => {
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(CZECHIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat!)).toBe(true);
      expect(Number.isFinite(r.lng!)).toBe(true);
      expect(isPlausibleCzechiaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
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
    for (const r of staging.filter(x => excluded.has(x.import_category))) {
      expect(ready.find(x => x.id === r.id)).toBeUndefined();
    }
  });

  test('no DE/AT/SK/PL prefix contamination in READY set', () => {
    for (const r of ready) {
      expect(r.id.startsWith('de_')).toBe(false);
      expect(r.id.startsWith('at_')).toBe(false);
      expect(r.id.startsWith('sk_')).toBe(false);
      expect(r.id.startsWith('pl_')).toBe(false);
    }
  });

  test('Phase 1 READY preserved or explicitly reconciled', () => {
    expect(report.phase1_ready).toBe(phase1Ready.length);
    expect(rebrand.phase1_ready_preserved_count).toBe(report.phase1_ready_preserved);
    expect(report.phase1_ready_preserved).toBeGreaterThanOrEqual(50);
    const readyIds = new Set(ready.map(r => r.id));
    const preserved = phase1Ready.filter(r => readyIds.has(r.id));
    expect(preserved.length).toBe(report.phase1_ready_preserved);
  });

  test('diacritic display preserved in READY cities', () => {
    expect(ready.some(r => r.city === 'Plzeň' || r.city.includes('Plzeň'))).toBe(true);
    expect(ready.some(r => r.city === 'Olomouc')).toBe(true);
    expect(ready.some(r => r.city === 'Ústí nad Labem')).toBe(true);
    expect(ready.some(r => r.city === 'České Budějovice')).toBe(true);
    expect(ready.some(r => r.name.includes('Anděl') || r.name.includes('Andel'))).toBe(true);
  });

  test('ASCII search normalization resolves Czech diacritic cities', () => {
    const czGyms = ready.map(r => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      address: r.address,
      city: r.city,
      country: r.country,
      postal_code: r.postal_code,
      lat: r.lat!,
      lng: r.lng!,
    }));
    getGymSearchIndex(czGyms as never);
    expect(
      searchGyms('Plzen', {gyms: czGyms as never, limit: 20}).some(r =>
        /plzeň/i.test(r.gym.city || r.gym.name || ''),
      ),
    ).toBe(true);
    expect(
      searchGyms('Usti nad Labem', {gyms: czGyms as never, limit: 20}).some(r =>
        /ústí/i.test(r.gym.city || r.gym.name || ''),
      ),
    ).toBe(true);
    expect(
      searchGyms('Ceske Budejovice', {gyms: czGyms as never, limit: 20}).some(r =>
        /české budějovice/i.test(r.gym.city || r.gym.name || ''),
      ),
    ).toBe(true);
  });

  test('Phase 2 expanded beyond Phase 1 with new chains and Form Factory the-gym slugs', () => {
    expect(staging.length).toBeGreaterThan(phase1Ready.length);
    expect(report.ready_by_brand['Form Factory'] || 0).toBeGreaterThan(28);
    expect(report.ready_by_brand['clever fit'] || 0).toBe(1);
    expect(report.ready_by_brand['JOHN REED'] || 0).toBe(1);
    expect(staging.some(r => r.source_url?.includes('the-gym-'))).toBe(true);
  });

  test('projected catalog stays below Global Stress QA threshold', () => {
    expect(report.projected_catalog).toBe(PHASE2_DOCUMENTED_PRODUCTION_TOTAL + ready.length);
    expect(report.projected_catalog).toBeLessThan(12500);
  });

  test('Phase 2 verdict is one of the allowed strings', () => {
    expect(['READY FOR CZECHIA MERGE', 'CZECHIA PHASE 3 REQUIRED BEFORE MERGE']).toContain(
      report.verdict,
    );
  });
});
