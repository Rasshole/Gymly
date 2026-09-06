/**
 * Portugal Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausiblePortugalCoordinate, PORTUGAL_POSTAL_RE} from '../src/utils/gymCountry';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center/i;
const PHASE2_DOCUMENTED_PRODUCTION_TOTAL = 10525;
const CURRENT_PRODUCTION_TOTAL = 11254;
const LEGACY_BRANDS = [/fitness\s*hut/i, /pump\s*fitness/i, /virgin\s*active/i];

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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normAddr(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Portugal Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/portugal/portugal_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/portugal/PORTUGAL_PHASE2_READY_TO_IMPORT.json');
  const reportPath = path.join(__dirname, '../data/portugal/PORTUGAL_PHASE2_READINESS_REPORT.json');
  const baselinePath = path.join(__dirname, '../data/portugal/portugal_phase1_staging_baseline.json');
  const p1ReadyPath = path.join(__dirname, '../data/portugal/PORTUGAL_PHASE1_READY_TO_IMPORT.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const rebrandPath = path.join(__dirname, '../data/portugal/PORTUGAL_PHASE2_REBRAND_MAP.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict: string;
    phase2: {ready_count: number; status_counts: Record<string, number>};
    phase1: {READY_TO_IMPORT: number; ready_preserved_non_rebuilt?: number};
    production: {total: number; portugal: number};
  };
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as StagingRow[];
  const p1Ready = JSON.parse(fs.readFileSync(p1ReadyPath, 'utf8')) as StagingRow[];
  const production = JSON.parse(fs.readFileSync(centersPath, 'utf8')) as Array<{id?: string; country?: string}>;
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as Record<string, unknown>;

  test('Phase 2 report documents pre-merge baseline; current production is post-merge', () => {
    expect(report.production.total).toBe(PHASE2_DOCUMENTED_PRODUCTION_TOTAL);
    expect(report.production.portugal).toBe(0);
    expect(production.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(production.filter(c => String(c.id || '').startsWith('pt_')).length).toBe(247);
  });

  test('Phase 1 baseline preserved on disk and READY count documented', () => {
    expect(baseline.length).toBe(271);
    expect(p1Ready.length).toBe(164);
    expect(report.phase1.READY_TO_IMPORT).toBe(164);
    expect(typeof report.phase1.ready_preserved_non_rebuilt).toBe('number');
  });

  test('canonical Phase 2 READY count matches artifacts', () => {
    expect(ready.length).toBe(report.phase2.ready_count);
    expect(ready.length).toBe(report.phase2.status_counts.READY_TO_IMPORT);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(ready.length).toBeGreaterThan(200);
  });

  test('all READY IDs are unique pt_* Portugal rows', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^pt_[a-f0-9]{10}$/);
      expect(r.country).toBe('Portugal');
      expect(r.is_active).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
  });

  test('READY rows have valid postcodes, fields, finite PT coords including islands', () => {
    let madeiraOrAzores = 0;
    for (const r of ready) {
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(PORTUGAL_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausiblePortugalCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      if (
        (r.lat! >= 32.35 && r.lat! <= 33.2) ||
        (r.lng! <= -24.9 && r.lng! >= -31.35)
      ) {
        madeiraOrAzores += 1;
      }
    }
    expect(madeiraOrAzores).toBeGreaterThan(0);
  });

  test('excludes CLOSED, COMING_SOON, NEEDS_*, DUPLICATE, LEGACY from READY file', () => {
    const excluded = new Set([
      'COMING_SOON',
      'CLOSED',
      'NEEDS_COORDINATES',
      'NEEDS_REVIEW',
      'DUPLICATE',
      'LEGACY',
    ]);
    expect(ready.every(r => !excluded.has(r.import_category))).toBe(true);
    for (const r of staging.filter(s => excluded.has(s.import_category))) {
      expect(ready.find(x => x.id === r.id)).toBeUndefined();
    }
  });

  test('legacy brands excluded from READY', () => {
    for (const r of ready) {
      for (const re of LEGACY_BRANDS) {
        expect(re.test(r.brand)).toBe(false);
        expect(re.test(r.name)).toBe(false);
      }
    }
    expect(Object.keys(rebrand).length).toBeGreaterThan(0);
  });

  test('no obvious same-brand physical duplicates within 25m with identical address', () => {
    const hits: string[] = [];
    for (let i = 0; i < ready.length; i++) {
      const a = ready[i];
      for (let j = i + 1; j < ready.length; j++) {
        const b = ready[j];
        if ((a.brand || '').toLowerCase() !== (b.brand || '').toLowerCase()) continue;
        if (a.lat == null || b.lat == null) continue;
        const d = haversineMeters(a.lat, a.lng!, b.lat, b.lng!);
        if (d <= 25 && normAddr(a.address) === normAddr(b.address)) {
          hits.push(`${a.id}/${b.id}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  test('verdict is READY FOR PORTUGAL MERGE', () => {
    expect(report.verdict).toBe('READY FOR PORTUGAL MERGE');
  });
});
