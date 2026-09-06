/**
 * Switzerland Phase 1 staging validation — READY rows only (no production merge).
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

describe('Switzerland Phase 1 staging', () => {
  const stagingPath = path.join(__dirname, '../data/switzerland/switzerland_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/switzerland/SWITZERLAND_PHASE1_READY_TO_IMPORT.json');
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];

  test('Phase 1 READY artifact frozen at 281 rows (historical pre-merge snapshot)', () => {
    expect(ready.length).toBe(281);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
  });

  test('READY file contains only READY_TO_IMPORT rows', () => {
    expect(ready.length).toBeGreaterThan(200);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(new Set(ready.map(r => r.id)).size).toBe(ready.length);
  });

  test('all READY rows use ch_* IDs and Switzerland country', () => {
    for (const r of ready) {
      expect(r.id.startsWith('ch_')).toBe(true);
      expect(r.id).toMatch(/^ch_[a-f0-9]{10}$/);
      expect(r.country).toBe('Switzerland');
      expect(r.is_active).toBe(true);
      // Phase 1 artifact predates merge — IDs may now exist in production after Switzerland merge.
    }
  });

  test('READY rows have valid postcodes, addresses, cities, coordinates', () => {
    for (const r of ready) {
      expect(String(r.address || '').trim().length).toBeGreaterThan(3);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(CH_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(r.lat).not.toBeNull();
      expect(r.lng).not.toBeNull();
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(r.lat! >= CH_BOUNDS.latMin && r.lat! <= CH_BOUNDS.latMax).toBe(true);
      expect(r.lng! >= CH_BOUNDS.lngMin && r.lng! <= CH_BOUNDS.lngMax).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(String(r.notes || '')).not.toMatch(/liechtenstein_excluded/);
    }
  });

  test('no duplicate READY IDs or same-brand same-address keys', () => {
    const ids = new Set<string>();
    const addrKeys = new Set<string>();
    for (const r of ready) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      const key = [
        (r.brand || '').toLowerCase(),
        (r.address || '').toLowerCase().replace(/[^a-z0-9äöüéèàç]+/g, ' ').trim(),
        r.postal_code,
        (r.city || '').toLowerCase(),
      ].join('|');
      expect(addrKeys.has(key)).toBe(false);
      addrKeys.add(key);
    }
  });

  test('no Liechtenstein postcodes or cities in READY set', () => {
    const liCities = ['vaduz', 'schaan', 'triesen', 'balzers', 'eschen', 'mauren'];
    for (const r of ready) {
      expect(r.postal_code.startsWith('948') || r.postal_code.startsWith('949')).toBe(false);
      const city = (r.city || '').toLowerCase();
      expect(liCities.some(c => city.includes(c))).toBe(false);
      expect((r.country || '').toLowerCase()).not.toBe('liechtenstein');
    }
  });

  test('no READY row within 50m of foreign production gym at border', () => {
    const foreign = ALL_GYM_CENTERS.filter(
      c =>
        ['Germany', 'Austria', 'France', 'Italy'].includes(c.country) &&
        c.lat != null &&
        c.lng != null,
    );
    const hits: string[] = [];
    for (const r of ready) {
      if (r.lat == null || r.lng == null) continue;
      for (const f of foreign) {
        const d = haversineMeters(r.lat, r.lng, f.lat!, f.lng!);
        if (d <= 50) {
          hits.push(`${r.id} vs ${f.id} (${d.toFixed(1)}m)`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  test('Phase 1 staging artifact documents unresolved buckets (historical)', () => {
    const phase1Report = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../data/switzerland/SWITZERLAND_PHASE1_READINESS_REPORT.json'),
        'utf8',
      ),
    ) as {status_counts: Record<string, number>};
    expect(phase1Report.status_counts.READY_TO_IMPORT).toBe(281);
    expect(
      (phase1Report.status_counts.NEEDS_COORDINATES || 0) +
        (phase1Report.status_counts.COMING_SOON || 0),
    ).toBeGreaterThan(0);
  });
});
