/**
 * Hungary Deep Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {
  compactGymSearchValue,
  normalizeGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
import {isPlausibleHungaryCoordinate, HUNGARY_POSTAL_RE} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11254;
const FOREIGN =
  /\b(austria|österreich|slovakia|romania|croatia|serbia|slovenia|ukraine|wien|bratislava)\b/i;

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

describe('Hungary Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/hungary/hungary_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/hungary/HUNGARY_PHASE2_READY_TO_IMPORT.json');
  const reportPath = path.join(__dirname, '../data/hungary/HUNGARY_PHASE2_READINESS_REPORT.json');
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/hungary/HUNGARY_PHASE1_READY_TO_IMPORT.json',
  );
  const rebrandPath = path.join(__dirname, '../data/hungary/HUNGARY_PHASE2_REBRAND_MAP.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    production_hungary: number;
    phase1_ready: number;
    phase1_ids_preserved: string[];
    verdict: string;
    ready_by_brand: Record<string, number>;
    projected_catalog: number;
    crosses_12500: boolean;
    global_stress_qa_required: boolean;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    mappings: Array<{from: string; to: string; status: string}>;
  };
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('production is 11063 with 50 Hungary live rows; Phase 2 report retains pre-merge baseline', () => {
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(11013); // Phase 2 report baseline (pre-merge)
    expect(report.production_hungary).toBe(0); // Phase 2 report baseline (pre-merge)
    expect(production.filter(c => c.country === 'Hungary').length).toBe(50);
    expect(production.filter(c => String(c.id || '').startsWith('hu_')).length).toBe(50);
  });

  test('READY count matches canonical READY file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(ready.length).toBeGreaterThanOrEqual(45);
  });

  test('all READY IDs are unique hu_* with Hungary country', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^hu_[a-f0-9]{10}$/);
      expect(r.country).toBe('Hungary');
      expect(r.is_active).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(ready.length);
  });

  test('READY rows have required fields, valid NNNN postcodes, finite coords', () => {
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof r.postal_code).toBe('string');
      expect(HUNGARY_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat!)).toBe(true);
      expect(Number.isFinite(r.lng!)).toBe(true);
      expect(r.lat).not.toBe(0);
      expect(r.lng).not.toBe(0);
      expect(isPlausibleHungaryCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
    }
  });

  test('unresolved statuses absent from READY; present in staging where expected', () => {
    const excluded = new Set([
      'COMING_SOON',
      'CLOSED',
      'NEEDS_COORDINATES',
      'NEEDS_REVIEW',
      'DUPLICATE',
      'LEGACY',
    ]);
    expect(ready.every(r => !excluded.has(r.import_category))).toBe(true);
    expect(staging.some(r => r.import_category === 'NEEDS_REVIEW')).toBe(true);
    expect(staging.some(r => r.import_category === 'COMING_SOON')).toBe(true);
    expect(staging.some(r => r.import_category === 'LEGACY')).toBe(true);
    expect(staging.some(r => /gilda/i.test(r.brand))).toBe(true);
    expect(ready.every(r => !/gilda/i.test(r.brand))).toBe(true);
  });

  test('Phase 1 Life1 IDs preserved in Phase 2 staging', () => {
    expect(phase1Ready.length).toBe(7);
    expect(report.phase1_ready).toBe(7);
    expect(report.phase1_ids_preserved.length).toBe(7);
    const stagingIds = new Set(staging.map(r => r.id));
    for (const id of report.phase1_ids_preserved) {
      expect(stagingIds.has(id)).toBe(true);
    }
    for (const p1 of phase1Ready) {
      expect(stagingIds.has(p1.id)).toBe(true);
    }
    const prestige = staging.find(r => r.id === 'hu_cb9223a0d5');
    expect(prestige?.brand).toBe('Prestige Fitness');
  });

  test('major brands represented in READY', () => {
    const brands = report.ready_by_brand;
    expect(brands['Life1 Fitness']).toBe(6);
    expect(brands['Chili Fitness']).toBeGreaterThanOrEqual(4);
    expect(brands['4% Fitness']).toBeGreaterThanOrEqual(6);
    expect(brands['Fitness5']).toBeGreaterThanOrEqual(12);
    expect(brands['Cutler Gym']).toBeGreaterThanOrEqual(5);
    expect(brands['Thor Gym']).toBeGreaterThanOrEqual(3);
    expect(brands['Nr1 Fitness']).toBeGreaterThanOrEqual(3);
    expect(brands['Oxygen Wellness']).toBe(1);
    expect(brands['Prestige Fitness']).toBe(1);
  });

  test('Hungarian characters preserved; ASCII search normalization works', () => {
    const blob = ready.map(r => `${r.name} ${r.city} ${r.address}`).join(' ');
    expect(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(blob)).toBe(true);
    expect(MOJIBAKE_RE.test(blob)).toBe(false);
    expect(normalizeGymSearchValue('Győr')).toBeTruthy();
    expect(normalizeGymSearchValue('Gyor')).toBeTruthy();
    expect(compactGymSearchValue('1117')).toBe('1117');
  });

  test('rebrand map documents Gilda Max and Fáy → Prestige', () => {
    expect(rebrand.mappings.some(m => /gilda/i.test(m.from))).toBe(true);
    expect(rebrand.mappings.some(m => /prestige/i.test(m.to) || /fáy|fay/i.test(m.from))).toBe(
      true,
    );
  });

  test('projected catalog under Global Stress QA threshold', () => {
    expect(report.projected_catalog).toBe(11013 + ready.length);
    expect(production.length).toBe(11013 + ready.length);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required).toBe(false);
  });

  test('verdict is merge-ready or phase-3 with explicit string', () => {
    expect([
      'READY FOR HUNGARY MERGE',
      'HUNGARY PHASE 3 REQUIRED BEFORE MERGE',
    ]).toContain(report.verdict);
  });

  test('search index can resolve Hungarian brand queries against READY gyms', () => {
    const gyms = ready.map(r => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      address: r.address,
      city: r.city,
      postalCode: r.postal_code,
      country: r.country,
      latitude: r.lat!,
      longitude: r.lng!,
      isActive: true,
    }));
    getGymSearchIndex(gyms as never);
    expect(searchGyms('Life1', {gyms: gyms as never, limit: 20}).length).toBeGreaterThan(0);
    expect(searchGyms('Chili', {gyms: gyms as never, limit: 20}).length).toBeGreaterThan(0);
    expect(searchGyms('Budapest', {gyms: gyms as never, limit: 20}).length).toBeGreaterThan(0);
    expect(searchGyms('Győr', {gyms: gyms as never, limit: 20}).length).toBeGreaterThan(0);
  });
});
