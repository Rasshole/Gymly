/**
 * Ireland Phase 1 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleIrelandCoordinate, IRELAND_EIRCODE_RE} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const PHASE1_DOCUMENTED_PRODUCTION_TOTAL = 10772;
const CURRENT_PRODUCTION_TOTAL = 11254;
const NI_MARKERS =
  /\b(belfast|derry|londonderry|newry|lisburn|northern ireland|co\.?\s*antrim)\b/i;

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
};

describe('Ireland Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/ireland/ireland_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/ireland/IRELAND_PHASE1_READY_TO_IMPORT.json');
  const reportPath = path.join(__dirname, '../data/ireland/IRELAND_PHASE1_READINESS_REPORT.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    verdict: string;
  };
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('Phase 1 report baseline 10772; live catalog post-Ireland merge', () => {
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE1_DOCUMENTED_PRODUCTION_TOTAL);
    expect(production.filter(c => c.country === 'Ireland').length).toBe(65);
    expect(production.filter(c => String(c.id || '').startsWith('ie_')).length).toBe(65);
  });

  test('READY count matches canonical READY file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
  });

  test('all READY IDs are unique ie_* with Ireland country', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^ie_[a-f0-9]{10}$/);
      expect(r.country).toBe('Ireland');
      expect(r.is_active).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
    expect(ids.size).toBe(ready.length);
  });

  test('READY rows have required fields, valid Eircodes, finite ROI coords', () => {
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(IRELAND_EIRCODE_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat!)).toBe(true);
      expect(Number.isFinite(r.lng!)).toBe(true);
      expect(isPlausibleIrelandCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(NI_MARKERS.test(blob)).toBe(false);
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

  test('no UK/gb_* contamination in READY set', () => {
    for (const r of ready) {
      expect(r.id.startsWith('gb_')).toBe(false);
      expect((r.country || '').toLowerCase()).not.toBe('united kingdom');
    }
  });
});
