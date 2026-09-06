/**
 * Czechia production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleCzechiaCoordinate, CZECHIA_POSTAL_RE} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN =
  /\b(deutschland|germany|österreich|austria|slovakia|slovensko|poland|polsko)\b/i;

const EXPECTED_TOTAL = 11254;
const EXPECTED_CZECHIA = 70;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Form Factory': 43,
  'Max Fitness': 23,
  'Oktagon Gym': 1,
  FITINN: 1,
  'clever fit': 1,
  'JOHN REED': 1,
};

describe('Czechia merge safety', () => {
  const czechia = ALL_GYM_CENTERS.filter(c => c.country === 'Czechia');
  const reportPath = path.join(__dirname, '../data/czechia/CZECHIA_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/czechia/CZECHIA_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/czechia/czechia_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/czechia/CZECHIA_PHASE2_READY_TO_IMPORT.json');
  const idemPath = path.join(__dirname, '../data/czechia/CZECHIA_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/czechia/CZECHIA_MERGE_DUPLICATE_ANALYSIS.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; czechia: number};
    staging_reconciliation?: {metadata_drift: string};
    pre_merge_validation?: {foreign_outliers: number; result: string};
    post_merge?: {
      same_brand_lte_25m: number;
      same_brand_lte_50m: number;
      same_brand_lte_100m: number;
      same_brand_lte_200m: number;
      identical_coordinate_clusters: number;
      different_brand_colocations: number;
    };
    international_chain_checks?: {
      mcfit_count: number;
      john_reed_count: number;
      clever_fit_count: number;
      fitinn_count: number;
    };
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    name?: string;
  }>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
    final_catalog: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    pre_merge_proximity?: {lt25: unknown[]};
  };

  test('total catalog and Czechia count match Phase 2 READY insert', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(czechia.length).toBe(EXPECTED_CZECHIA);
    expect(report.after.total).toBe(11013); // Czechia merge-time total (pre-Hungary)
    expect(report.after.czechia).toBe(EXPECTED_CZECHIA);
    expect(report.inserted).toBe(EXPECTED_CZECHIA);
    expect(phase2Ready.length).toBe(EXPECTED_CZECHIA);
    expect(approved.length).toBe(EXPECTED_CZECHIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_CZECHIA,
    );
  });

  test('existing country counts unchanged including Ireland', () => {
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
  });

  test('all Czechia IDs are unique cz_* with valid PSČ and CZ coords', () => {
    const ids = new Set<string>();
    for (const c of czechia) {
      expect(c.id).toMatch(/^cz_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Czechia');
      expect(c.is_active).toBe(true);
      expect(CZECHIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleCzechiaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    expect(ids.size).toBe(czechia.length);
  });

  test('brand breakdown matches Phase 2 READY; McFIT absent', () => {
    const byBrand: Record<string, number> = {};
    for (const c of czechia) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.keys(byBrand).sort()).toEqual(Object.keys(EXPECTED_BRAND_BREAKDOWN).sort());
    expect(czechia.every(c => !/mcfit/i.test(`${c.brand} ${c.name}`))).toBe(true);
    expect(report.international_chain_checks?.mcfit_count).toBe(0);
  });

  test('unresolved Phase 2 rows absent from production', () => {
    const unresolved = staging.filter(s =>
      [
        'NEEDS_COORDINATES',
        'NEEDS_REVIEW',
        'COMING_SOON',
        'CLOSED',
        'DUPLICATE',
        'LEGACY',
        'EXCLUDED',
      ].includes(s.import_category),
    );
    expect(unresolved.length).toBe(15);
    for (const s of unresolved) {
      expect(czechia.find(g => g.id === s.id)).toBeUndefined();
    }
    expect(unresolved.some(s => /pankrác|pankrac/i.test(s.name || ''))).toBe(true);
    expect(unresolved.some(s => /dejvice/i.test(s.name || ''))).toBe(true);
  });

  test('staging MERGED_INTO_CATALOG reconciles with production cz_*', () => {
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    const prod = new Set(czechia.map(g => g.id));
    expect(merged.size).toBe(prod.size);
    for (const id of merged) expect(prod.has(id)).toBe(true);
    for (const id of prod) expect(merged.has(id)).toBe(true);
    expect(report.staging_reconciliation?.metadata_drift || 'NONE').toBe('NONE');
  });

  test('international chains present exactly once each', () => {
    expect(report.international_chain_checks?.john_reed_count).toBe(1);
    expect(report.international_chain_checks?.clever_fit_count).toBe(1);
    expect(report.international_chain_checks?.fitinn_count).toBe(1);
    const jr = czechia.find(c => c.brand === 'JOHN REED');
    expect(jr?.city).toBe('Praha');
    expect(/karlovo/i.test(jr?.address || '')).toBe(true);
    expect(jr?.postal_code).toBe('120 00');
    const cf = czechia.find(c => c.brand === 'clever fit');
    expect(/kladno/i.test(`${cf?.city} ${cf?.name}`)).toBe(true);
    const fi = czechia.find(c => c.brand === 'FITINN');
    expect(/brno/i.test(`${fi?.city} ${fi?.name}`)).toBe(true);
  });

  test('diacritic display preserved', () => {
    expect(czechia.some(c => c.city === 'Plzeň')).toBe(true);
    expect(czechia.some(c => c.city === 'Ústí nad Labem')).toBe(true);
    expect(czechia.some(c => c.city === 'České Budějovice')).toBe(true);
  });

  test('duplicate proximity gates clean on Czechia production', () => {
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.pre_merge_validation?.foreign_outliers).toBe(0);
    expect(dup.pre_merge_proximity?.lt25?.length ?? 0).toBe(0);
  });

  test('idempotency: second run inserts 0', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.pass).toBe(true);
    expect(idem.final_catalog).toBe(11013); // Czechia merge-time idempotency artifact
  });

  test('check-in radius constants unchanged', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
