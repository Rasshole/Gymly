/**
 * Greece production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleGreeceCoordinate, GREECE_POSTAL_RE} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {getGymSearchIndex} from '../src/services/gymSearch/gymSearchIndex';
import {searchGyms} from '../src/services/gymSearch/gymSearchEngine';
import {findNearestGym} from '../src/utils/nearestGym';
import {filterMapCentersInRegion} from '../src/utils/mapVisibleCenters';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center/i;
const CYPRUS_RE = /κύπρος|cyprus|λευκωσία|nicosia|lefkosia/i;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  Alterlife: 72,
  Yava: 22,
  'Planet Fitness Greece': 5,
  'Mega Gym': 4,
  'Holmes Place': 3,
};

describe('Greece merge safety', () => {
  const greece = ALL_GYM_CENTERS.filter(c => c.country === 'Greece');
  const reportPath = path.join(__dirname, '../data/greece/GREECE_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/greece/GREECE_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/greece/greece_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/greece/GREECE_PHASE2_READY_TO_IMPORT.json');
  const idemPath = path.join(__dirname, '../data/greece/GREECE_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/greece/GREECE_MERGE_DUPLICATE_ANALYSIS.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; greece: number};
    staging_reconciliation?: {metadata_drift: string};
    yava_validation?: {legacy_rows_merged: number; result: string};
    alterlife_dense_pair?: {classification: string};
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
  }>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{
    id: string;
    source_url?: string;
    website?: string;
  }>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    proximity_classifications?: Array<{classification: string; a_id: string; b_id: string}>;
  };

  test('total catalog = 11416 live; Greece = 106', () => {
    expect(ALL_GYM_CENTERS.length).toBe(11416);
    expect(greece.length).toBe(106);
    expect(report.after.total).toBe(10878); // Greece merge-time total preserved in report
    expect(report.after.greece).toBe(106);
    expect(report.inserted).toBe(106);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(106);
    expect(approved.length).toBe(106);
    expect(phase2Ready.length).toBe(106);
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
    expect(counts['Austria']).toBe(335);
    expect(counts['Switzerland']).toBe(475);
    expect(counts['Portugal']).toBe(247);
    expect(counts['Greece']).toBe(106);
    expect(counts['Ireland']).toBe(65);
    expect(counts['Czechia']).toBe(70);
    expect(counts['Hungary']).toBe(50);
    expect(counts['Romania']).toBe(154);
    expect(counts['Slovakia']).toBe(37);
    expect(counts['Bulgaria']).toBe(82);
    expect(counts['Croatia']).toBe(80);
  });

  test('all Greece IDs are unique gr_* with valid fields', () => {
    const ids = new Set<string>();
    for (const c of greece) {
      expect(c.id.startsWith('gr_')).toBe(true);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Greece');
      expect(GREECE_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleGreeceCoordinate(c.lat!, c.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(CYPRUS_RE.test(`${c.name} ${c.address} ${c.city}`)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
      // Cyprus geography
      expect(!(c.lat! >= 34.5 && c.lat! <= 35.75 && c.lng! >= 32.0 && c.lng! <= 34.85)).toBe(true);
    }
  });

  test('islands accepted (Crete / Rhodes present among READY estate)', () => {
    const crete = greece.filter(
      c => c.lat! >= 34.8 && c.lat! <= 35.75 && c.lng! >= 23.4 && c.lng! <= 26.4,
    );
    const rhodes = greece.filter(
      c => c.lat! >= 35.85 && c.lat! <= 37.0 && c.lng! >= 26.85 && c.lng! <= 28.3,
    );
    expect(crete.length).toBeGreaterThan(0);
    expect(rhodes.length).toBeGreaterThan(0);
  });

  test('brand breakdown matches canonical READY', () => {
    const byBrand: Record<string, number> = {};
    for (const c of greece) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
  });

  test('excluded staging categories and YAVA legacy absent from production', () => {
    const unresolved = staging.filter(s =>
      ['NEEDS_COORDINATES', 'NEEDS_REVIEW', 'COMING_SOON', 'CLOSED', 'DUPLICATE', 'LEGACY'].includes(
        s.import_category,
      ),
    );
    for (const s of unresolved) {
      expect(greece.find(g => g.id === s.id)).toBeUndefined();
    }
    for (const r of phase2Ready) {
      const src = `${r.source_url || ''} ${r.website || ''}`;
      if (/yava/i.test(src) || greece.find(g => g.id === r.id)?.brand === 'Yava') {
        expect(src).toMatch(/\/content\//i);
        expect(src).not.toMatch(/[?&]gym=/i);
      }
    }
    expect(report.yava_validation?.legacy_rows_merged).toBe(0);
    expect(report.yava_validation?.result).toBe('PASS');
  });

  test('staging MERGED_INTO_CATALOG reconciles with production gr_*', () => {
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    const prod = new Set(greece.map(g => g.id));
    expect(merged.size).toBe(prod.size);
    for (const id of merged) expect(prod.has(id)).toBe(true);
    for (const id of prod) expect(merged.has(id)).toBe(true);
    expect(report.staging_reconciliation?.metadata_drift || 'NONE').toBe('NONE');
  });

  test('Alterlife Galatsi ≤25 m pair retained as classification A', () => {
    expect(greece.find(g => g.id === 'gr_f92effe0b0')).toBeTruthy();
    expect(greece.find(g => g.id === 'gr_0fc7dfed4c')).toBeTruthy();
    expect(report.alterlife_dense_pair?.classification).toBe('A');
    const pair = dup.proximity_classifications?.find(
      p =>
        (p.a_id === 'gr_f92effe0b0' && p.b_id === 'gr_0fc7dfed4c') ||
        (p.a_id === 'gr_0fc7dfed4c' && p.b_id === 'gr_f92effe0b0'),
    );
    expect(pair?.classification).toBe('A');
  });

  test('idempotency: second run inserts 0', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.pass).toBe(true);
  });

  test('check-in and auto-checkout radii remain 200', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('lightweight Greece search sanity (Athens / Θεσσαλονίκη aliases)', () => {
    const grGyms = greece.map(c => ({
      ...c,
      latitude: c.lat!,
      longitude: c.lng!,
    }));
    getGymSearchIndex(grGyms as never);
    const athens = searchGyms('Athens', {gyms: grGyms as never, limit: 20});
    expect(athens.length).toBeGreaterThan(0);
    const thess = searchGyms('Θεσσαλονίκη', {gyms: grGyms as never, limit: 20});
    expect(thess.length).toBeGreaterThan(0);
    const nearest = findNearestGym(37.9838, 23.7275, grGyms);
    expect(nearest?.country).toBe('Greece');
    const visible = filterMapCentersInRegion(
      grGyms as never,
      {latitude: 37.98, longitude: 23.73, latitudeDelta: 0.5, longitudeDelta: 0.5} as never,
    );
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every(c => c.country === 'Greece')).toBe(true);
  });
});
