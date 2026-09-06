/**
 * Ireland production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {isPlausibleIrelandCoordinate, IRELAND_EIRCODE_RE} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES = /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const NI_RE =
  /\b(belfast|derry|londonderry|newry|lisburn|bangor|armagh|enniskillen|coleraine|ballymena|northern ireland|co\.?\s*antrim|co\.?\s*down|BT\d{1,2})\b/i;

const EXPECTED_TOTAL = 11254;
const EXPECTED_IRELAND = 65;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  FLYEfit: 17,
  'Energie Fitness': 16,
  'Gym Plus': 7,
  'West Wood Club': 6,
  'Anytime Fitness': 5,
  'Aura Leisure': 4,
  'Ben Dunne Gyms': 4,
  'Iconic Health Clubs': 4,
  'Shoreline Leisure': 2,
};

describe('Ireland merge safety', () => {
  const ireland = ALL_GYM_CENTERS.filter(c => c.country === 'Ireland');
  const reportPath = path.join(__dirname, '../data/ireland/IRELAND_MERGE_REPORT.json');
  const approvedPath = path.join(__dirname, '../data/ireland/IRELAND_APPROVED_FOR_MERGE.json');
  const stagingPath = path.join(__dirname, '../data/ireland/ireland_centers_staging.json');
  const readyPath = path.join(__dirname, '../data/ireland/IRELAND_PHASE4_READY_TO_IMPORT.json');
  const idemPath = path.join(__dirname, '../data/ireland/IRELAND_MERGE_IDEMPOTENCY.json');
  const dupPath = path.join(__dirname, '../data/ireland/IRELAND_MERGE_DUPLICATE_ANALYSIS.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; ireland: number};
    staging_reconciliation?: {metadata_drift: string};
    energie_tallaght_citywest?: {classification: string; distance_m: number};
    pre_merge_validation?: {northern_ireland_contamination: number; result: string};
    post_merge?: {
      same_brand_lte_25m: number;
      same_brand_lte_50m: number;
      same_brand_lte_100m: number;
      same_brand_lte_200m: number;
      identical_coordinate_clusters: number;
      different_brand_colocations: number;
    };
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{id: string}>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
  }>;
  const phase4Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{id: string}>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
    final_catalog: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    energie_tallaght_citywest?: {classification: string};
  };

  test('total catalog and Ireland count match Phase 4 READY insert', () => {
    expect(ALL_GYM_CENTERS.length).toBe(EXPECTED_TOTAL);
    expect(ireland.length).toBe(EXPECTED_IRELAND);
    expect(report.after.total).toBe(10943); // historical Ireland merge snapshot
    expect(report.after.ireland).toBe(EXPECTED_IRELAND);
    expect(report.inserted).toBe(EXPECTED_IRELAND);
    expect(phase4Ready.length).toBe(EXPECTED_IRELAND);
    expect(approved.length).toBe(EXPECTED_IRELAND);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_IRELAND,
    );
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
  });

  test('all Ireland IDs are unique ie_* with valid Eircodes and ROI coords', () => {
    const ids = new Set<string>();
    for (const c of ireland) {
      expect(c.id).toMatch(/^ie_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Ireland');
      expect(c.is_active).toBe(true);
      expect(IRELAND_EIRCODE_RE.test(String(c.postal_code))).toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleIrelandCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(NI_RE.test(blob)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || ''))).toBe(
        false,
      );
      // Explicit NI bbox exclusion
      expect(!(c.lat! >= 54.02 && c.lat! <= 55.32 && c.lng! >= -7.05 && c.lng! <= -5.4)).toBe(true);
    }
    expect(ids.size).toBe(ireland.length);
  });

  test('brand breakdown matches Phase 4 READY; legacy brands absent', () => {
    const byBrand: Record<string, number> = {};
    for (const c of ireland) byBrand[c.brand] = (byBrand[c.brand] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
    for (const c of ireland) {
      expect(/one escape/i.test(`${c.brand} ${c.name}`)).toBe(false);
      expect(/flyehub/i.test(`${c.brand} ${c.name}`)).toBe(false);
    }
    expect(ireland.find(c => c.id === 'ie_42999953b2')?.brand).toBe('Iconic Health Clubs');
  });

  test('unresolved Phase 4 rows absent from production', () => {
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
    expect(unresolved.length).toBe(17);
    for (const s of unresolved) {
      expect(ireland.find(g => g.id === s.id)).toBeUndefined();
    }
    // Known Eircode-debt / excluded rows
    expect(ireland.find(g => g.id === 'ie_31276d22be')).toBeUndefined(); // De Paul
  });

  test('staging MERGED_INTO_CATALOG reconciles with production ie_*', () => {
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    const prod = new Set(ireland.map(g => g.id));
    expect(merged.size).toBe(prod.size);
    for (const id of merged) expect(prod.has(id)).toBe(true);
    for (const id of prod) expect(merged.has(id)).toBe(true);
    expect(report.staging_reconciliation?.metadata_drift || 'NONE').toBe('NONE');
  });

  test('Energie Tallaght vs Citywest retained as legitimate separate clubs', () => {
    expect(ireland.find(g => g.id === 'ie_6930f99872')).toBeTruthy();
    expect(ireland.find(g => g.id === 'ie_2574437176')).toBeTruthy();
    expect(report.energie_tallaght_citywest?.classification).toMatch(/A_legitimate|A/);
    expect(report.energie_tallaght_citywest?.distance_m).toBeGreaterThan(3000);
    expect(dup.energie_tallaght_citywest?.classification).toBe('A_legitimate');
  });

  test('duplicate proximity gates clean on Ireland production', () => {
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.pre_merge_validation?.northern_ireland_contamination).toBe(0);
  });

  test('idempotency: second run inserts 0', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.pass).toBe(true);
    expect(idem.final_catalog).toBe(10943); // historical Ireland idempotency snapshot
  });

  test('check-in and auto-checkout radii remain 200', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });
});
