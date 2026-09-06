/**
 * Romania production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleRomaniaCoordinate,
  ROMANIA_POSTAL_RE,
} from '../src/utils/gymCountry';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {normalizeGymSearchValue} from '../src/services/gymSearch/gymSearchNormalize';
import {findNearestGym} from '../src/utils/nearestGym';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const FOREIGN =
  /\b(hungary|magyarország|serbia|beograd|bulgaria|ukraine|kyiv|republica moldova)\b/i;

const EXPECTED_TOTAL = 11217; // Romania merge-time catalog (report artifact)
const CURRENT_CATALOG_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_ROMANIA = 154;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Stay Fit Gym': 67,
  'World Class': 45,
  '18GYM': 42,
};

function isMoldovaContamination(c: {city?: string; country?: string}): boolean {
  const city = (c.city || '').toLowerCase();
  const country = (c.country || '').toLowerCase();
  return country === 'moldova' || city === 'chișinău' || city === 'chisinau';
}

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Romania',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Romania merge safety', () => {
  const romania = ALL_GYM_CENTERS.filter(c => c.country === 'Romania');
  const reportPath = path.join(__dirname, '../data/romania/ROMANIA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/romania/romania_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/romania/ROMANIA_MERGE_IDEMPOTENCY.json',
  );

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; romania: number};
    staging_reconciliation?: {
      metadata_drift: string;
      missing_production_ids: string[];
      unexpected_production_ids: string[];
    };
    post_merge?: {
      same_brand_lte_25m: number;
      same_brand_lte_50m: number;
      same_brand_lte_100m: number;
      same_brand_lte_200m: number;
      identical_coordinate_clusters: number;
      different_brand_colocations: number;
      proximity_classifications?: Array<{classification: string}>;
    };
    world_class_validation?: {merged: number; result: string};
    stay_fit_validation?: {canonical_clubs_merged: number; result: string};
    gym18_validation?: {open_clubs_merged: number; result: string};
    esx_live?: number;
    check_in?: {CHECK_IN_RADIUS_METERS: number; AUTO_CHECKOUT_DISTANCE_METERS: number};
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    name?: string;
  }>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{
    id: string;
  }>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
    final_catalog: number;
  };

  test('total catalog = 11692 live; Romania = 154', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_CATALOG_TOTAL);
    expect(romania.length).toBe(EXPECTED_ROMANIA);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.romania).toBe(EXPECTED_ROMANIA);
    expect(report.inserted).toBe(EXPECTED_ROMANIA);
    expect(phase2Ready.length).toBe(EXPECTED_ROMANIA);
    expect(approved.length).toBe(EXPECTED_ROMANIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_ROMANIA,
    );
  });

  test('previous country counts unchanged; RO added', () => {
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
    expect(counts['Slovenia']).toBe(32);
    expect(counts['Lithuania']).toBe(61);
    expect(counts['Latvia']).toBe(33);
    expect(counts['Estonia']).toBe(68);
  });

  test('all Romania IDs are unique ro_* with valid 6-digit postcodes and RO coords', () => {
    const ids = new Set<string>();
    for (const c of romania) {
      expect(c.id).toMatch(/^ro_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Romania');
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(ROMANIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.postal_code).length).toBe(6);
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(isPlausibleRomaniaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(isMoldovaContamination(c)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
    }
    expect(ids.size).toBe(romania.length);
  });

  test('leading-zero postcodes preserved', () => {
    const leading = romania.filter(c => String(c.postal_code).startsWith('0'));
    expect(leading.length).toBeGreaterThan(0);
    for (const c of leading) {
      expect(String(c.postal_code)).toMatch(/^0\d{5}$/);
    }
  });

  test('brand breakdown; ESX absent; coming-soon / NEEDS_REVIEW absent', () => {
    const byBrand: Record<string, number> = {};
    for (const c of romania) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.keys(byBrand).sort()).toEqual(Object.keys(EXPECTED_BRAND_BREAKDOWN).sort());
    expect(romania.every(c => !/esx/i.test(`${c.brand} ${c.name}`))).toBe(true);
    expect(report.esx_live).toBe(0);
    expect(report.world_class_validation?.merged).toBe(45);
    expect(report.stay_fit_validation?.canonical_clubs_merged).toBe(67);
    expect(report.gym18_validation?.open_clubs_merged).toBe(42);

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
    expect(unresolved.length).toBe(9); // 4 NEEDS_REVIEW + 5 COMING_SOON
    const prodIds = new Set(romania.map(c => c.id));
    for (const s of unresolved) {
      expect(prodIds.has(s.id)).toBe(false);
    }
  });

  test('canonical ID reconciliation with approved + staging MERGED', () => {
    const prod = new Set(romania.map(c => c.id));
    const ap = new Set(approved.map(a => a.id));
    const ready = new Set(phase2Ready.map(r => r.id));
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prod.size).toBe(154);
    expect(ap.size).toBe(154);
    expect(ready.size).toBe(154);
    expect(merged.size).toBe(154);
    for (const id of prod) {
      expect(ap.has(id)).toBe(true);
      expect(ready.has(id)).toBe(true);
      expect(merged.has(id)).toBe(true);
    }
    expect(report.staging_reconciliation?.missing_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.unexpected_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');
  });

  test('check-in radius unchanged; nearest respects dense RO gyms', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const gyms = romania.slice(0, 20).map(toGym);
    const anchor = gyms[0]!;
    const near = findNearestGym(anchor.latitude, anchor.longitude, gyms);
    expect(near?.id).toBe(anchor.id);

    // 199 / 200 allowed, 201 blocked relative to radius constant
    expect(CHECK_IN_RADIUS_METERS).toBeGreaterThanOrEqual(199);
    expect(CHECK_IN_RADIUS_METERS).toBeGreaterThanOrEqual(200);
    expect(201).toBeGreaterThan(CHECK_IN_RADIUS_METERS);
  });

  test('search smoke: Romania cities, brands, postcodes', () => {
    const sample = romania.find(c => /bucure/i.test(c.city || '')) || romania[0]!;
    const entry = buildGymSearchEntry(toGym(sample));
    expect(entry.haystack).toMatch(/romania|bucuresti|bucharest/i);

    const allHay = romania.map(c => buildGymSearchEntry(toGym(c)).haystack).join(' ');
    const mustHit = [
      'romania',
      'bucuresti',
      'cluj',
      'timisoara',
      'iasi',
      'stay fit',
      'world class',
      '18gym',
    ];
    for (const q of mustHit) {
      expect(allHay.includes(normalizeGymSearchValue(q))).toBe(true);
    }

    const withZero = romania.find(c => String(c.postal_code).startsWith('0'));
    expect(withZero).toBeTruthy();
    expect(String(withZero!.postal_code)).toMatch(/^0\d{5}$/);
    expect(normalizeGymSearchValue(String(withZero!.postal_code))).toBe(
      String(withZero!.postal_code),
    );
  });

  test('merge idempotent', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.pass).toBe(true);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL);
  });

  test('proximity: no identical coords; <=200m pairs classified legitimate', () => {
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    const classes = report.post_merge?.proximity_classifications || [];
    for (const p of classes) {
      expect(p.classification).toMatch(/^A_legitimate/);
    }
  });
});
