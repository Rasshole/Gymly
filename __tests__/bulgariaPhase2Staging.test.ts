/**
 * Bulgaria Phase 2 staging validation — READY rows only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleBulgariaCoordinate,
  BULGARIA_POSTAL_RE,
  isBulgariaCountry,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const CURRENT_PRODUCTION_TOTAL = 11416;
const PRODUCTION_SHA256 =
  '644fb590b8327a773d1a0bc60fbebfe7558d5b112ad3aa838bd291849523d4ec';
const FOREIGN =
  /\b(romania|bucharest|serbia|beograd|macedonia|skopje|greece|thessaloniki|turkey|istanbul|strumica)\b/i;

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
  discovery_class?: string;
  notes?: string;
};

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe('Bulgaria Phase 2 staging', () => {
  const stagingPath = path.join(__dirname, '../data/bulgaria/bulgaria_centers_staging.json');
  const readyPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE2_READY_TO_IMPORT.json',
  );
  const reportPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE2_READINESS_REPORT.json',
  );
  const phase1ReadyPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE1_READY_TO_IMPORT.json',
  );
  const rebrandPath = path.join(
    __dirname,
    '../data/bulgaria/BULGARIA_PHASE2_REBRAND_MAP.json',
  );
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const phase1Ready = JSON.parse(
    fs.readFileSync(phase1ReadyPath, 'utf8'),
  ) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    verdict?: string;
    ready_count?: number;
    production_total?: number;
    production_sha?: string;
    production_modified?: boolean;
    bulgaria_live?: number;
    phase1_ready_preserved?: number;
    projected_catalog_if_merged_alone?: number;
    status_counts?: Record<string, number>;
    data_quality?: Record<string, number>;
    material_blockers?: string[];
  };
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as Record<
    string,
    unknown
  >;

  it('production catalog reflects Bulgaria merge; Phase 2 report remains historical', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(sha).toBe(PRODUCTION_SHA256);
    // Phase 2 readiness report is frozen pre-merge evidence.
    expect(report.bulgaria_live).toBe(0);
    expect(report.production_modified).toBe(false);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('bg_')).length).toBe(82);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bulgaria').length).toBe(82);
  });

  it('keeps check-in / auto-checkout radii at 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  it('Phase 2 READY file matches Phase 2 report (staging may advance in Phase 3)', () => {
    expect(ready.length).toBe(report.ready_count);
    expect(ready.length).toBe(67);
    expect(report.production_total).toBe(11254);
    expect(report.projected_catalog_if_merged_alone).toBe(11254 + ready.length);
    expect(report.verdict).toMatch(/PHASE 3 REQUIRED/i);
    const cats = staging.reduce<Record<string, number>>((acc, r) => {
      acc[r.import_category] = (acc[r.import_category] || 0) + 1;
      return acc;
    }, {});
    expect(
      (cats.READY_TO_IMPORT || 0) + (cats.MERGED_INTO_CATALOG || 0),
    ).toBeGreaterThanOrEqual(ready.length);
    expect(cats.EXCLUDED).toBeGreaterThanOrEqual(15);
    expect(cats.CLOSED || 0).toBe(0);
  });

  it('Phase 2 READY rows remain present in current staging', () => {
    const byId = new Map(staging.map(r => [r.id, r]));
    for (const r of ready) {
      expect(byId.has(r.id)).toBe(true);
      expect(r.id).toMatch(/^bg_[a-f0-9]{10}$/);
    }
    expect(ready.every(r => r.is_coming_soon !== true)).toBe(true);
    expect(ready.every(r => r.is_closed !== true)).toBe(true);
  });

  it('all READY rows are unique bg_* with valid BG geography/postcodes', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^bg_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.country).toBe('Bulgaria');
      expect(isBulgariaCountry(r.country)).toBe(true);
      expect(String(r.name || '').trim().length).toBeGreaterThan(0);
      expect(String(r.brand || '').trim().length).toBeGreaterThan(0);
      expect(String(r.address || '').trim().length).toBeGreaterThan(8);
      expect(String(r.city || '').trim().length).toBeGreaterThan(0);
      expect(typeof r.postal_code).toBe('string');
      expect(BULGARIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleBulgariaCoordinate(r.lat!, r.lng!)).toBe(true);
      const blob = `${r.name} ${r.address} ${r.city} ${r.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
    }
    expect(ids.size).toBe(ready.length);
  });

  it('no same-brand READY pairs closer than 50 m and no identical coords', () => {
    for (let i = 0; i < ready.length; i++) {
      for (let j = i + 1; j < ready.length; j++) {
        const a = ready[i];
        const b = ready[j];
        if (a.brand !== b.brand) continue;
        const d = haversineM(a.lat!, a.lng!, b.lat!, b.lng!);
        expect(d).toBeGreaterThanOrEqual(50);
        expect(!(a.lat === b.lat && a.lng === b.lng)).toBe(true);
      }
    }
  });

  it('excludes hotel / foreign Pulse from READY; Atlantis remains EXCLUDED', () => {
    expect(ready.every(r => !/therme|royal hotel|atlantis/i.test(r.name))).toBe(true);
    const excluded = staging.filter(r => r.import_category === 'EXCLUDED');
    expect(excluded.some(r => /atlantis/i.test(r.name))).toBe(true);
    expect(excluded.some(r => /therme/i.test(r.name))).toBe(true);
    const readyIds = new Set(ready.map(r => r.id));
    for (const r of excluded) {
      expect(readyIds.has(r.id)).toBe(false);
    }
  });

  it('accounts for Phase 1 READY preservation / demotion', () => {
    expect(phase1Ready.length).toBe(11);
    expect(report.phase1_ready_preserved).toBeGreaterThanOrEqual(0);
    expect(report.phase1_ready_preserved).toBeLessThanOrEqual(11);
    const readyIds = new Set(ready.map(r => r.id));
    let preserved = 0;
    for (const r of phase1Ready) {
      if (readyIds.has(r.id)) preserved += 1;
    }
    expect(preserved).toBe(report.phase1_ready_preserved);
  });

  it('records rebrand / legacy rules', () => {
    expect(rebrand.Pulse_hotel_foreign).toBeTruthy();
    expect(rebrand.Pulse_Platinum).toBeTruthy();
    expect(rebrand.Hammer_Gym_Platinum).toBeTruthy();
  });

  it('READY hard defects are zero in report data_quality', () => {
    const dq = report.data_quality || {};
    expect(dq.duplicate_ids).toBe(0);
    expect(dq.same_brand_lte_25m).toBe(0);
    expect(dq.identical_coordinate_clusters).toBe(0);
    expect(dq.invalid_postcodes).toBe(0);
    expect(dq.missing_ready_addresses).toBe(0);
    expect(dq.missing_ready_cities).toBe(0);
    expect(dq.invalid_ready_coordinates).toBe(0);
    expect(dq.fallback_coordinates).toBe(0);
    expect(dq.foreign_outliers).toBe(0);
    expect(dq.mojibake).toBe(0);
  });

  it('no duplicate IDs across full staging', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Next Level estate is complete or near-complete in Phase 2', () => {
    const nlReady = ready.filter(r => r.brand === 'Next Level Fitness');
    expect(nlReady.length).toBeGreaterThanOrEqual(27);
  });
});
