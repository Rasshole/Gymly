/**
 * Ireland Phase 3 final recovery — READY gate (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleIrelandCoordinate, IRELAND_EIRCODE_RE} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const NI_RE =
  /\b(belfast|derry|londonderry|newry|lisburn|northern ireland|co\.?\s*antrim|co\.?\s*down|BT\d{1,2})\b/i;
const PHASE3_DOCUMENTED_PRODUCTION_TOTAL = 10878;
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

describe('Ireland Phase 3 staging', () => {
  const stagingPath = path.join(__dirname, '../data/ireland/ireland_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/ireland/IRELAND_PHASE3_READY_TO_IMPORT.json');
  const phase2ReadyPath = path.join(
    __dirname,
    '../data/ireland/IRELAND_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(__dirname, '../data/ireland/IRELAND_PHASE3_READINESS_REPORT.json');
  const rebrandPath = path.join(__dirname, '../data/ireland/IRELAND_PHASE3_REBRAND_MAP.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase2Ready = JSON.parse(fs.readFileSync(phase2ReadyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status_counts: Record<string, number>;
    ready_count: number;
    production_total: number;
    production_ireland: number;
    phase2_ready: number;
    phase2_ready_preserved: number;
    verdict: string;
    ready_by_brand: Record<string, number>;
    data_quality: Record<string, number>;
    projected_catalog: number;
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    phase2_ready_preserved_count: number;
    one_escape_to_iconic_smithfield: {id: string};
  };
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{
    id?: string;
    country?: string;
  }>;

  test('Phase 3 report documents pre-merge baseline; live catalog post-Ireland merge', () => {
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE3_DOCUMENTED_PRODUCTION_TOTAL);
    expect(report.production_ireland).toBe(0);
    expect(production.filter(c => c.country === 'Ireland').length).toBe(65);
    expect(production.filter(c => String(c.id || '').startsWith('ie_')).length).toBe(65);
  });

  test('final READY count matches canonical Phase 3 file and report', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(report.status_counts.READY_TO_IMPORT || 0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(ready.length).toBeGreaterThanOrEqual(phase2Ready.length);
    expect(ready.length).toBeGreaterThan(50);
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

  test('READY rows have valid Eircodes, addresses, finite Ireland coords', () => {
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
      expect(NI_RE.test(blob)).toBe(false);
    }
  });

  test('no Northern Ireland contamination; legacy brands absent from READY', () => {
    for (const r of ready) {
      expect(r.id.startsWith('gb_')).toBe(false);
      expect(NI_RE.test(`${r.city} ${r.address} ${r.name}`)).toBe(false);
      expect(/one escape/i.test(r.brand)).toBe(false);
      expect(/flyehub/i.test(r.brand)).toBe(false);
    }
    expect(ready.some(r => r.brand === 'FLYEfit')).toBe(true);
    expect(ready.some(r => r.brand === 'Energie Fitness')).toBe(true);
    expect(ready.some(r => r.brand === 'West Wood Club')).toBe(true);
    expect(ready.some(r => r.brand === 'Gym Plus')).toBe(true);
  });

  test('unresolved statuses absent from READY file', () => {
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

  test('Phase 2 READY reconciliation preserved', () => {
    expect(report.phase2_ready).toBe(phase2Ready.length);
    expect(report.phase2_ready_preserved).toBe(phase2Ready.length);
    expect(rebrand.phase2_ready_preserved_count).toBe(phase2Ready.length);
    const readyIds = new Set(ready.map(r => r.id));
    for (const r of phase2Ready) {
      expect(readyIds.has(r.id)).toBe(true);
    }
  });

  test('Phase 3 recovers priority estates beyond Phase 2', () => {
    expect(report.ready_by_brand['West Wood Club'] || 0).toBeGreaterThanOrEqual(5);
    expect(report.ready_by_brand['Energie Fitness'] || 0).toBeGreaterThanOrEqual(15);
    expect(report.ready_by_brand['Iconic Health Clubs'] || 0).toBe(4);
    expect(report.ready_by_brand['Ben Dunne Gyms'] || 0).toBeGreaterThanOrEqual(4);
    expect(report.ready_by_brand['Shoreline Leisure'] || 0).toBe(2);
    expect(report.ready_by_brand['Gym Plus'] || 0).toBe(7);
  });

  test('data quality gate clean on READY', () => {
    expect(report.data_quality.duplicate_ids).toBe(0);
    expect(report.data_quality.same_brand_le_25m).toBe(0);
    expect(report.data_quality.invalid_eircodes).toBe(0);
    expect(report.data_quality.missing_ready_fields).toBe(0);
    expect(report.data_quality.invalid_coords).toBe(0);
    expect(report.data_quality.fallback_coords).toBe(0);
    expect(report.data_quality.ni_contamination).toBe(0);
    expect(report.data_quality.mojibake).toBe(0);
  });

  test('One Escape rebrand maps to Iconic Smithfield', () => {
    expect(rebrand.one_escape_to_iconic_smithfield.id).toBe('ie_42999953b2');
    const smithfield = ready.find(r => r.id === 'ie_42999953b2');
    expect(smithfield?.brand).toBe('Iconic Health Clubs');
    expect(smithfield?.postal_code).toMatch(/D07\s*VKP9/i);
  });

  test('Energie Tallaght and Citywest are distinct READY sites', () => {
    const tallaght = ready.find(r => /tallaght/i.test(r.name) && r.brand === 'Energie Fitness');
    const citywest = ready.find(r => /citywest/i.test(r.name) && r.brand === 'Energie Fitness');
    expect(tallaght).toBeTruthy();
    expect(citywest).toBeTruthy();
    expect(tallaght!.postal_code).not.toBe(citywest!.postal_code);
    expect(tallaght!.lat).not.toBe(citywest!.lat);
    expect(tallaght!.lng).not.toBe(citywest!.lng);
  });

  test('projected catalog and verdict are coherent', () => {
    expect(report.projected_catalog).toBe(PHASE3_DOCUMENTED_PRODUCTION_TOTAL + ready.length);
    expect(report.projected_catalog).toBeLessThan(12500);
    expect(['READY FOR IRELAND MERGE', 'IRELAND PHASE 4 REQUIRED BEFORE MERGE']).toContain(
      report.verdict,
    );
  });

  test('staging has concrete unresolved reasons where not READY', () => {
    const unresolved = staging.filter(r => r.import_category !== 'READY_TO_IMPORT');
    expect(unresolved.length).toBeGreaterThan(0);
    for (const r of unresolved) {
      const reason =
        (r as StagingRow & {unresolved_reason?: string}).unresolved_reason ||
        r.notes ||
        '';
      expect(String(reason).trim().length).toBeGreaterThan(5);
    }
  });
});
