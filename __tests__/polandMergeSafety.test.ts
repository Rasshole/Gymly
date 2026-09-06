/**
 * Poland production merge safety — post-merge catalog integrity.
 * Validates the 621 READY_TO_IMPORT rows merged into centers.json.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS, getEffectiveLatLng} from '../src/data/centerRegistry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const PL_POSTAL_RE = /^\d{2}-\d{3}$/;
const PL_BOUNDS = {latMin: 49.0, latMax: 54.9, lngMin: 14.07, lngMax: 24.15};
const MOJIBAKE_RE = /Ã.|�|â€/;
const LEGACY_BRANDS = ['Fitness Platinium', 'Smart Gym', 'McFIT Poland'];

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

function normalizeBrand(b: string): string {
  return String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

describe('Poland merge safety', () => {
  const poland = ALL_GYM_CENTERS.filter(c => c.country === 'Poland');
  const reportPath = path.join(__dirname, '../data/poland/POLAND_MERGE_REPORT.json');

  test('total catalog = 10050; Poland = 621', () => {
    expect(ALL_GYM_CENTERS.length).toBe(10050);
    expect(poland.length).toBe(621);
  });

  test('existing country counts unchanged', () => {
    const counts: Record<string, number> = {};
    ALL_GYM_CENTERS.forEach(c => {
      counts[c.country] = (counts[c.country] || 0) + 1;
    });
    expect(counts['Denmark']).toBe(354);
    expect(counts['Sweden']).toBe(639);
    expect(counts['Norway']).toBe(535);
    expect(counts['Finland']).toBe(429);
    expect(counts['Germany']).toBe(1424);
    expect(counts['United Kingdom']).toBe(1474);
    expect(counts['Netherlands']).toBe(600);
    expect(counts['France']).toBe(1712);
    expect(counts['Spain']).toBe(976);
    expect(counts['Italy']).toBe(588);
    expect(counts['Belgium']).toBe(363);
    expect(counts['Poland']).toBe(621);
  });

  test('all Poland IDs are unique pl_*', () => {
    const ids = poland.map(c => c.id);
    expect(new Set(ids).size).toBe(621);
    expect(ids.every(id => id.startsWith('pl_'))).toBe(true);
    expect(ids.some(id => !id.startsWith('pl_'))).toBe(false);
  });

  test('Poland rows have valid postcodes, coords, names, brands, addresses', () => {
    for (const c of poland) {
      expect(c.country).toBe('Poland');
      expect(c.is_active).toBe(true);
      expect(String(c.name || '').trim().length).toBeGreaterThan(0);
      expect(String(c.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(c.address || '').trim().length).toBeGreaterThan(0);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof c.postal_code).toBe('string');
      expect(PL_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(c.lat).not.toBe(0);
      expect(c.lng).not.toBe(0);
      expect(c.lat! >= PL_BOUNDS.latMin && c.lat! <= PL_BOUNDS.latMax).toBe(true);
      expect(c.lng! >= PL_BOUNDS.lngMin && c.lng! <= PL_BOUNDS.lngMax).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(LEGACY_BRANDS).not.toContain(c.brand);
    }
  });

  test('no fallback coordinates for Poland production rows', () => {
    for (const c of poland) {
      const {lat, lng} = getEffectiveLatLng(c);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
      expect(lat).not.toBe(52.2297);
      expect(lng).not.toBe(21.0122);
    }
  });

  test('no same-brand physical duplicates within 100m', () => {
    const pairs: Array<{a: string; b: string; d: number}> = [];
    for (let i = 0; i < poland.length; i++) {
      for (let j = i + 1; j < poland.length; j++) {
        const a = poland[i]!;
        const b = poland[j]!;
        if (normalizeBrand(a.brand) !== normalizeBrand(b.brand)) continue;
        const d = haversineMeters(a.lat!, a.lng!, b.lat!, b.lng!);
        if (d < 100) pairs.push({a: a.id, b: b.id, d: Math.round(d)});
      }
    }
    expect(pairs).toEqual([]);
  });

  test('brand breakdown sums to 621', () => {
    const byBrand: Record<string, number> = {};
    poland.forEach(c => {
      byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    });
    expect(byBrand['Zdrofit']).toBe(212);
    expect(byBrand['Xtreme Fitness Gyms']).toBe(185);
    expect(byBrand['Well Fitness']).toBe(97);
    expect(byBrand['Just GYM']).toBe(55);
    expect(byBrand['CityFit']).toBe(24);
    expect(byBrand['Fit Fabric']).toBe(21);
    expect(byBrand['Fabryka Formy']).toBe(18);
    expect(byBrand['Calypso Fitness']).toBe(9);
    expect(Object.values(byBrand).reduce((a, b) => a + b, 0)).toBe(621);
  });

  test('CHECK_IN_RADIUS_METERS = 200 unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('merge report confirms 621 inserted and idempotency', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.inserted).toBe(621);
    expect(report.before.total).toBe(9094);
    expect(report.before.poland).toBe(0);
    expect(report.after.total).toBe(9715);
    expect(report.after.poland).toBe(621);
    expect(report.stopped_short_of_expected).toBe(false);
    expect(report.duplicate_ids_in_catalog).toEqual([]);
    expect(report.brand_sum).toBe(621);
  });

  test('staging reconciliation: 621 MERGED_INTO_CATALOG', () => {
    const stagingPath = path.join(__dirname, '../data/poland/poland_centers_staging.json');
    const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
    const merged = staging.filter((r: {import_category: string}) => r.import_category === 'MERGED_INTO_CATALOG');
    const ready = staging.filter((r: {import_category: string}) => r.import_category === 'READY_TO_IMPORT');
    expect(merged.length).toBe(621);
    expect(ready.length).toBe(0);
    const prodIds = new Set(poland.map(c => c.id));
    const mergedIds = new Set(merged.map((r: {id: string}) => r.id));
    expect([...prodIds].every(id => mergedIds.has(id))).toBe(true);
  });
});
