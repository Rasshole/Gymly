/**
 * Hungary production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleHungaryCoordinate, HUNGARY_POSTAL_RE} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN =
  /\b(austria|österreich|slovakia|romania|croatia|serbia|slovenia|ukraine|wien|bratislava)\b/i;

const EXPECTED_TOTAL = 11063; // Hungary merge-time catalog (report artifact)
const CURRENT_CATALOG_TOTAL = 11254; // live catalog after Slovakia merge
const EXPECTED_HUNGARY = 50;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  Fitness5: 16,
  '4% Fitness': 7,
  'Cutler Gym': 7,
  'Life1 Fitness': 6,
  'Chili Fitness': 5,
  'Thor Gym': 4,
  'Nr1 Fitness': 3,
  'Oxygen Wellness': 1,
  'Prestige Fitness': 1,
};

describe('Hungary merge safety', () => {
  const hungary = ALL_GYM_CENTERS.filter(c => c.country === 'Hungary');
  const reportPath = path.join(__dirname, '../data/hungary/HUNGARY_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/hungary/HUNGARY_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/hungary/hungary_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/hungary/HUNGARY_PHASE2_READY_TO_IMPORT.json');
  const idemPath = path.join(__dirname, '../data/hungary/HUNGARY_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/hungary/HUNGARY_MERGE_DUPLICATE_ANALYSIS.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; hungary: number};
    staging_reconciliation?: {
      metadata_drift: string;
      missing_production_ids: string[];
      unexpected_production_ids: string[];
    };
    pre_merge_validation?: {foreign_outliers: number; result: string};
    post_merge?: {
      same_brand_lte_25m: number;
      same_brand_lte_25m_disallowed: number;
      same_brand_lte_50m: number;
      same_brand_lte_100m: number;
      same_brand_lte_200m: number;
      identical_coordinate_clusters: number;
      different_brand_colocations: number;
    };
    rebrand_validation?: {
      gilda_max_live: number;
      prestige_fay_id: string;
      prestige_fay_brand: string;
      result: string;
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
    known_legitimate?: Record<string, string>;
    proximity_classifications?: Array<{classification: string; a_name?: string; b_name?: string}>;
  };

  test('total catalog and Hungary count match Phase 2 READY insert', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_CATALOG_TOTAL);
    expect(hungary.length).toBe(EXPECTED_HUNGARY);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.hungary).toBe(EXPECTED_HUNGARY);
    expect(report.inserted).toBe(EXPECTED_HUNGARY);
    expect(phase2Ready.length).toBe(EXPECTED_HUNGARY);
    expect(approved.length).toBe(EXPECTED_HUNGARY);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_HUNGARY,
    );
  });

  test('existing country counts unchanged including Czechia', () => {
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

  test('all Hungary IDs are unique hu_* with valid NNNN and HU coords', () => {
    const ids = new Set<string>();
    for (const c of hungary) {
      expect(c.id).toMatch(/^hu_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Hungary');
      expect(c.is_active).toBe(true);
      expect(HUNGARY_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleHungaryCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
    }
    expect(ids.size).toBe(hungary.length);
  });

  test('brand breakdown matches Phase 2 READY; Gilda Max absent', () => {
    const byBrand: Record<string, number> = {};
    for (const c of hungary) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.keys(byBrand).sort()).toEqual(Object.keys(EXPECTED_BRAND_BREAKDOWN).sort());
    expect(hungary.every(c => !/gilda/i.test(`${c.brand} ${c.name}`))).toBe(true);
    expect(report.rebrand_validation?.gilda_max_live).toBe(0);
  });

  test('Prestige Fáy stable ID and brand', () => {
    const fay = hungary.find(c => c.id === 'hu_cb9223a0d5');
    expect(fay).toBeTruthy();
    expect(fay!.brand).toBe('Prestige Fitness');
    expect(fay!.name).toMatch(/Fáy|Fay/);
    expect(report.rebrand_validation?.prestige_fay_brand).toBe('Prestige Fitness');
    expect(report.rebrand_validation?.result).toBe('PASS');
  });

  test('canonical ID reconciliation with approved + staging MERGED', () => {
    const prod = new Set(hungary.map(c => c.id));
    const ap = new Set(approved.map(a => a.id));
    const ready = new Set(phase2Ready.map(r => r.id));
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prod.size).toBe(50);
    expect(ap.size).toBe(50);
    expect(ready.size).toBe(50);
    expect(merged.size).toBe(50);
    for (const id of prod) {
      expect(ap.has(id)).toBe(true);
      expect(ready.has(id)).toBe(true);
      expect(merged.has(id)).toBe(true);
    }
    expect(report.staging_reconciliation?.missing_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.unexpected_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
  });

  test('unresolved staging statuses absent from production', () => {
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
    expect(unresolved.length).toBeGreaterThan(0);
    const prodIds = new Set(hungary.map(c => c.id));
    for (const s of unresolved) {
      expect(prodIds.has(s.id)).toBe(false);
    }
    expect(staging.some(s => /Crush/i.test(s.name || '') && s.import_category !== 'MERGED_INTO_CATALOG')).toBe(
      true,
    );
  });

  test('known legitimate proximity/co-location classifications retained', () => {
    expect(dup.known_legitimate?.garden_onlygirls).toMatch(/A_legitimate/);
    expect(report.post_merge?.same_brand_lte_25m_disallowed).toBe(0);
    const garden = hungary.find(c => /GARDEN/i.test(c.name));
    const only = hungary.find(c => /ONLYGIRLS/i.test(c.name));
    expect(garden).toBeTruthy();
    expect(only).toBeTruthy();
    expect(garden!.lat).toBeCloseTo(only!.lat!, 5);
    expect(garden!.lng).toBeCloseTo(only!.lng!, 5);
  });

  test('check-in and auto-checkout radii unchanged at 200', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('importer idempotent', () => {
    expect(idem.pass).toBe(true);
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL);
  });
});
