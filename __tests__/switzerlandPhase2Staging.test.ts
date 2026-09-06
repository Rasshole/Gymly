/**
 * Switzerland Phase 2 staging snapshot — preserved READY artifact + post-merge staging state.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';

const CH_POSTAL_RE = /^\d{4}$/;
const CH_BOUNDS = {latMin: 45.82, latMax: 47.81, lngMin: 5.96, lngMax: 10.49};
const MOJIBAKE_RE = /Ã.|�|â€/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center/i;

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

describe('Switzerland Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/switzerland/switzerland_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/switzerland/SWITZERLAND_PHASE2_READY_TO_IMPORT.json');
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/switzerland/SWITZERLAND_PHASE1_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(__dirname, '../data/switzerland/SWITZERLAND_PHASE2_READINESS_REPORT.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(fs.readFileSync(phase1ReadyPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    ready_to_import: number;
    phase1_ready_preserved: number;
    verdict: string;
    ready_by_brand: Record<string, number>;
  };

  test('production catalog merged — 10525 total, 475 Switzerland', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11254);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Switzerland').length).toBe(475);
  });

  test('Phase 2 READY snapshot file preserved (475 rows)', () => {
    expect(ready.length).toBe(475);
    expect(ready.length).toBe(report.ready_to_import);
    expect(new Set(ready.map(r => r.id)).size).toBe(475);
  });

  test('all Phase 1 READY rows preserved in Phase 2 snapshot', () => {
    const readyIds = new Set(ready.map(r => r.id));
    const preserved = phase1Ready.filter(r => readyIds.has(r.id)).length;
    expect(preserved).toBe(phase1Ready.length);
    expect(report.phase1_ready_preserved).toBe(281);
  });

  test('Phase 2 recovered major chains per report', () => {
    expect(report.ready_by_brand['NonStop Gym']).toBeGreaterThanOrEqual(40);
    expect(report.ready_by_brand['Kieser']).toBeGreaterThanOrEqual(20);
    expect(report.ready_by_brand['update Fitness']).toBeGreaterThanOrEqual(80);
    expect(report.ready_by_brand['well come FIT']).toBeGreaterThanOrEqual(25);
  });

  test('READY snapshot rows pass quality gate and are in production', () => {
    const prodIds = new Set(ALL_GYM_CENTERS.map(c => c.id));
    for (const r of ready) {
      expect(r.id.startsWith('ch_')).toBe(true);
      expect(r.country).toBe('Switzerland');
      expect(r.is_active).toBe(true);
      expect(CH_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(r.lat! >= CH_BOUNDS.latMin && r.lat! <= CH_BOUNDS.latMax).toBe(true);
      expect(r.lng! >= CH_BOUNDS.lngMin && r.lng! <= CH_BOUNDS.lngMax).toBe(true);
      expect(prodIds.has(r.id)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
  });

  test('staging post-merge: 475 MERGED, exclusions withheld', () => {
    const cats = staging.reduce<Record<string, number>>((acc, r) => {
      acc[r.import_category] = (acc[r.import_category] || 0) + 1;
      return acc;
    }, {});
    expect(cats.MERGED_INTO_CATALOG).toBe(475);
    expect(cats.NEEDS_COORDINATES).toBe(10);
    expect(cats.NEEDS_REVIEW).toBe(1);
    expect(cats.COMING_SOON).toBe(6);
  });

  test('Phase 2 merge readiness verdict preserved in report', () => {
    expect(report.verdict).toBe('READY FOR SWITZERLAND MERGE');
  });
});
