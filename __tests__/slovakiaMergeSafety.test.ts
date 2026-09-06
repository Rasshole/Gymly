/**
 * Slovakia production merge safety — post-merge catalog integrity.
 */
import fs from 'fs';
import path from 'path';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSlovakiaCoordinate,
  SLOVAKIA_POSTAL_RE,
  CZECHIA_POSTAL_RE,
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
  /\b(czechia|česko|praha|austria|österreich|wien|vienna|hungary|magyarország|poland|polska|ukraine|kyiv|uzhhorod)\b/i;

const EXPECTED_TOTAL = 11254; // Slovakia merge-time catalog (report artifact)
const CURRENT_CATALOG_TOTAL = 11692; // live catalog after Cyprus merge
const EXPECTED_SLOVAKIA = 37;

const EXPECTED_BRAND_BREAKDOWN: Record<string, number> = {
  'Form Factory': 15,
  'Golem Club': 11,
  '365 Fit&Co': 8,
  FITINN: 3,
};

function toGym(c: (typeof ALL_GYM_CENTERS)[number]): DanishGym {
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    postalCode: c.postal_code,
    country: c.country,
    region: 'Slovakia',
    latitude: c.lat!,
    longitude: c.lng!,
    brand: c.brand,
    _center: c as never,
  };
}

describe('Slovakia merge safety', () => {
  const slovakia = ALL_GYM_CENTERS.filter(c => c.country === 'Slovakia');
  const reportPath = path.join(__dirname, '../data/slovakia/SLOVAKIA_MERGE_REPORT.json');
  const approvedPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_APPROVED_FOR_MERGE.json',
  );
  const stagingPath = path.join(
    __dirname,
    '../data/slovakia/slovakia_centers_staging.json',
  );
  const readyPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_PHASE2_READY_TO_IMPORT.json',
  );
  const idemPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_MERGE_IDEMPOTENCY.json',
  );
  const dupPath = path.join(
    __dirname,
    '../data/slovakia/SLOVAKIA_MERGE_DUPLICATE_ANALYSIS.json',
  );

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    inserted: number;
    after: {total: number; slovakia: number};
    staging_reconciliation?: {
      metadata_drift: string;
      MERGED_INTO_CATALOG: number;
      NEEDS_COORDINATES: number;
      NEEDS_REVIEW: number;
      COMING_SOON: number;
      CLOSED: number;
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
      duplicate_ids: number;
    };
    exclusions?: {
      coming_soon_absent: boolean;
      digital_park_absent: boolean;
      fitinn_stale_absent: boolean;
      fitcamp_legacy_brand_absent: boolean;
      form_factory_fitcamp_present: boolean;
      excluded_operators_absent: boolean;
    };
    check_in?: {CHECK_IN_RADIUS_METERS: number; AUTO_CHECKOUT_DISTANCE_METERS: number};
    brand_breakdown?: Record<string, number>;
  };
  const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8')) as Array<{
    id: string;
  }>;
  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
    id: string;
    import_category: string;
    name?: string;
    brand?: string;
  }>;
  const phase2Ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as Array<{
    id: string;
  }>;
  const idem = JSON.parse(fs.readFileSync(idemPath, 'utf8')) as {
    second_run_insertions: number;
    pass: boolean;
    final_catalog: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    included: Array<{id: string}>;
  };

  test('total catalog = 11692 live; Slovakia = 37', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_CATALOG_TOTAL);
    expect(slovakia.length).toBe(EXPECTED_SLOVAKIA);
    expect(report.after.total).toBe(EXPECTED_TOTAL);
    expect(report.after.slovakia).toBe(EXPECTED_SLOVAKIA);
    expect(report.inserted).toBe(EXPECTED_SLOVAKIA);
    expect(phase2Ready.length).toBe(EXPECTED_SLOVAKIA);
    expect(approved.length).toBe(EXPECTED_SLOVAKIA);
    expect(staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').length).toBe(
      EXPECTED_SLOVAKIA,
    );
    expect(dup.included.length).toBe(EXPECTED_SLOVAKIA);
  });

  test('previous country counts unchanged; SK added', () => {
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
      expect(counts['Luxembourg']).toBe(20);
      expect(counts['Malta']).toBe(18);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(CURRENT_CATALOG_TOTAL);
  });

  test('all Slovakia IDs are unique sk_* with valid PSČ and SK coords', () => {
    const ids = new Set<string>();
    for (const c of slovakia) {
      expect(c.id).toMatch(/^sk_[a-f0-9]{10}$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.country).toBe('Slovakia');
      expect(c.is_active).toBe(true);
      expect(c.is_coming_soon).not.toBe(true);
      expect(SLOVAKIA_POSTAL_RE.test(String(c.postal_code))).toBe(true);
      expect(CZECHIA_POSTAL_RE.test(String(c.postal_code))).toBe(false);
      expect(typeof c.postal_code).toBe('string');
      expect(String(c.address || '').trim().length).toBeGreaterThan(3);
      expect(String(c.city || '').trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      expect(!(c.lat === 0 && c.lng === 0)).toBe(true);
      expect(isPlausibleSlovakiaCoordinate(c.lat!, c.lng!)).toBe(true);
      const blob = `${c.name} ${c.address} ${c.city} ${c.brand}`;
      expect(MOJIBAKE_RE.test(blob)).toBe(false);
      expect(FOREIGN.test(blob)).toBe(false);
      expect(
        FALLBACK_COORD_SOURCES.test(String((c as {coord_source?: string}).coord_source || '')),
      ).toBe(false);
    }
    expect(ids.size).toBe(slovakia.length);
  });

  test('exact brand counts; exclusions absent; FitCamp as Form Factory', () => {
    const byBrand: Record<string, number> = {};
    for (const c of slovakia) byBrand[c.brand!] = (byBrand[c.brand!] || 0) + 1;
    for (const [brand, n] of Object.entries(EXPECTED_BRAND_BREAKDOWN)) {
      expect(byBrand[brand]).toBe(n);
    }
    expect(Object.keys(byBrand).sort()).toEqual(Object.keys(EXPECTED_BRAND_BREAKDOWN).sort());
    expect(report.brand_breakdown).toEqual(byBrand);

    expect(slovakia.every(c => !/budatínska|europa bc|slnečnice|slnecnice/i.test(c.name))).toBe(
      true,
    );
    expect(slovakia.every(c => !/digital\s*park/i.test(c.name))).toBe(true);
    expect(
      slovakia.every(
        c => !(/fitinn/i.test(c.brand || '') && /vivo|petržalka|petrzalka/i.test(c.name)),
      ),
    ).toBe(true);
    expect(slovakia.every(c => !/^FitCamp$/i.test(c.brand || ''))).toBe(true);
    expect(slovakia.some(c => c.brand === 'Form Factory' && /fitcamp/i.test(c.name))).toBe(true);
    expect(
      slovakia.every(
        c => !/efectfit|multisport|mozolani|^maximus/i.test(`${c.brand} ${c.name}`),
      ),
    ).toBe(true);

    expect(report.exclusions?.coming_soon_absent).toBe(true);
    expect(report.exclusions?.digital_park_absent).toBe(true);
    expect(report.exclusions?.fitinn_stale_absent).toBe(true);
    expect(report.exclusions?.fitcamp_legacy_brand_absent).toBe(true);
    expect(report.exclusions?.form_factory_fitcamp_present).toBe(true);
    expect(report.exclusions?.excluded_operators_absent).toBe(true);
  });

  test('canonical READY ↔ production ↔ staging MERGED reconciliation', () => {
    const prod = new Set(slovakia.map(c => c.id));
    const ap = new Set(approved.map(a => a.id));
    const ready = new Set(phase2Ready.map(r => r.id));
    const merged = new Set(
      staging.filter(s => s.import_category === 'MERGED_INTO_CATALOG').map(s => s.id),
    );
    expect(prod.size).toBe(37);
    expect(ap.size).toBe(37);
    expect(ready.size).toBe(37);
    expect(merged.size).toBe(37);
    for (const id of prod) {
      expect(ap.has(id)).toBe(true);
      expect(ready.has(id)).toBe(true);
      expect(merged.has(id)).toBe(true);
    }
    expect(report.staging_reconciliation?.MERGED_INTO_CATALOG).toBe(37);
    expect(report.staging_reconciliation?.NEEDS_COORDINATES).toBe(0);
    expect(report.staging_reconciliation?.NEEDS_REVIEW).toBe(0);
    expect(report.staging_reconciliation?.COMING_SOON).toBe(3);
    expect(report.staging_reconciliation?.CLOSED).toBe(1);
    expect(report.staging_reconciliation?.missing_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.unexpected_production_ids).toEqual([]);
    expect(report.staging_reconciliation?.metadata_drift).toBe('NONE');

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
    expect(unresolved.length).toBe(4); // 3 COMING_SOON + 1 CLOSED
    for (const s of unresolved) {
      expect(prod.has(s.id)).toBe(false);
    }
  });

  test('check-in radius and auto-checkout unchanged at 200 m', () => {
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(report.check_in?.CHECK_IN_RADIUS_METERS).toBe(200);
    expect(report.check_in?.AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const gyms = slovakia.slice(0, 10).map(toGym);
    const anchor = gyms[0]!;
    const near = findNearestGym(anchor.latitude, anchor.longitude, gyms);
    expect(near?.id).toBe(anchor.id);
  });

  test('search smoke: Slovakia cities and brands', () => {
    const sample = slovakia.find(c => /bratislava/i.test(c.city || '')) || slovakia[0]!;
    const entry = buildGymSearchEntry(toGym(sample));
    expect(entry.haystack).toMatch(/slovakia|slovensko|bratislava/i);

    const allHay = slovakia.map(c => buildGymSearchEntry(toGym(c)).haystack).join(' ');
    for (const q of ['slovakia', 'bratislava', 'form factory', 'golem', 'fitinn', 'kosice']) {
      expect(allHay.includes(normalizeGymSearchValue(q))).toBe(true);
    }
  });

  test('merge idempotent', () => {
    expect(idem.second_run_insertions).toBe(0);
    expect(idem.pass).toBe(true);
    expect(idem.final_catalog).toBe(EXPECTED_TOTAL);
  });

  test('proximity: no duplicate IDs; Phase 2 baseline holds', () => {
    expect(report.post_merge?.duplicate_ids).toBe(0);
    expect(report.post_merge?.identical_coordinate_clusters).toBe(0);
    expect(report.post_merge?.same_brand_lte_25m).toBe(0);
    expect(report.post_merge?.same_brand_lte_50m).toBe(0);
    expect(report.post_merge?.same_brand_lte_100m).toBe(0);
    expect(report.post_merge?.same_brand_lte_200m).toBe(0);
    expect(report.post_merge?.different_brand_colocations).toBe(0);
  });
});
