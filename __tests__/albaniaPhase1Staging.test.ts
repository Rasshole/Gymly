/**
 * Albania Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleAlbaniaCoordinate,
  ALBANIA_POSTAL_RE,
  isAlbaniaCountry,
  isMontenegroCountry,
  isNorthMacedoniaCountry,
  isGreeceCountry,
  isBosniaHerzegovinaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {buildGymSearchEntry} from '../src/services/gymSearch/gymSearchIndex';
import {resolveGymOrStub} from '../src/utils/gymDisplay';
import en from '../src/i18n/translations/en';
import da from '../src/i18n/translations/da';
import sv from '../src/i18n/translations/sv';
import nb from '../src/i18n/translations/nb';
import type {DanishGym} from '../src/data/danishGyms';

const MOJIBAKE_RE = /Ã[£¡§ªº¢©¤]|�|â€|Â\s|Ã§|Ã£|Ã¡|Ã©|Ã­|Ã³|Ãº/;
const FALLBACK_COORD_SOURCES =
  /fallback|centroid|city_center|postcode_center|capital.?fallback/i;
const PHASE1_REPORT_TOTAL = 11831;
const PHASE1_REPORT_SHA256 =
  '5ad0b727989bf00f9d72757a4a4d06eb29298a8951f4630e4a7eb5cc81c4dd4e';
const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';

const VALID_STATUS = new Set([
  'READY_TO_IMPORT',
  'NEEDS_COORDINATES',
  'NEEDS_REVIEW',
  'COMING_SOON',
  'CLOSED',
  'DUPLICATE',
  'LEGACY',
  'EXCLUDED',
  'MERGED_INTO_CATALOG',
]);

const REQUIRED_CITIES = [
  'Tirana',
  'Durrës',
  'Vlorë',
  'Shkodër',
  'Elbasan',
  'Fier',
  'Korçë',
  'Berat',
  'Lushnjë',
  'Pogradec',
  'Kavajë',
  'Gjirokastër',
  'Sarandë',
  'Lezhë',
  'Kukës',
  'Peshkopi',
  'Kamëz',
  'Krujë',
];

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
  discovery_class?: string;
  eligibility_candidate?: string;
  territory?: string;
  foreign_probe?: boolean;
  hotel_spa_risk?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Tirana',
    address: partial.address ?? 'Rruga e Durrësit 1',
    postalCode: partial.postalCode ?? '1001',
    country: 'Albania',
    region: 'Albania',
    latitude: partial.latitude ?? 41.3275,
    longitude: partial.longitude ?? 19.8187,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Rruga e Durrësit 1',
      postal_code: partial.postalCode ?? '1001',
      city: partial.city ?? 'Tirana',
      country: 'Albania',
      lat: partial.latitude ?? 41.3275,
      lng: partial.longitude ?? 19.8187,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Albania Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/albania');
  const stagingPath = path.join(dataDir, 'phase1/phase1_staging_snapshot.json');
  const reportPath = path.join(dataDir, 'ALBANIA_PHASE1_READINESS_REPORT.json');
  const readyPath = path.join(dataDir, 'ALBANIA_PHASE1_READY_TO_IMPORT.json');
  const rebrandPath = path.join(dataDir, 'ALBANIA_PHASE1_REBRAND_MAP.json');
  const dupPath = path.join(dataDir, 'ALBANIA_PHASE1_DUPLICATE_ANALYSIS.json');
  const chainPath = path.join(dataDir, 'ALBANIA_PHASE1_CHAIN_INVENTORY.json');
  const cityPath = path.join(dataDir, 'ALBANIA_PHASE1_CITY_COVERAGE.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as StagingRow[];
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as StagingRow[];
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    hard_duplicate_conflicts?: number;
  };
  const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const cityCov = JSON.parse(fs.readFileSync(cityPath, 'utf8')) as {
    cities: Record<string, string>;
  };
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  test('Phase 1 report frozen at 11831; live catalog 11921 post-merge', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Albania').length).toBe(9);
    expect(centers.filter(c => c.id.startsWith('al_')).length).toBe(9);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE1_REPORT_TOTAL);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(report.albania_live).toBe(0);
    expect(report.al_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.albania).toBe('al_');
  });

  test('prior-country regressions intact', () => {
    expect(centers.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(centers.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(centers.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(centers.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging IDs unique al_*; statuses valid; READY = 0; Phase 2 required', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThan(50);
    for (const r of staging) {
      expect(r.id).toMatch(/^al_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
    expect(ready.length).toBe(0);
    expect(report.ready_to_import).toBe(0);
    expect(report.needs_review).toBeGreaterThan(20);
    expect(report.excluded).toBeGreaterThan(30);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(report.potential_class_a_operators).toBe(1);
    expect(report.market).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(report.phase2_required).toBe(true);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe('ALBANIA PHASE 2 REQUIRED BEFORE MERGE');
  });

  test('DQ: postcodes/coords for reviewable rows; no READY leakage', () => {
    const reviewable = staging.filter(
      r =>
        !r.foreign_probe &&
        (r.territory === 'Albania' || !r.territory) &&
        ['NEEDS_REVIEW', 'NEEDS_COORDINATES', 'READY_TO_IMPORT'].includes(
          r.import_category,
        ) &&
        r.discovery_class !== 'regional_gap' &&
        r.discovery_class !== 'international_probe',
    );
    for (const r of reviewable) {
      if (r.postal_code && r.postal_code !== 'n/a') {
        expect(ALBANIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      }
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleAlbaniaCoordinate(r.lat, r.lng)).toBe(true);
        expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(
          false,
        );
      }
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(
        false,
      );
    }
    expect(report.data_quality.hotel_spa_leakage_ready).toBe(0);
    expect(report.data_quality.foreign_ready).toEqual([]);
    expect(report.data_quality.fallback_ready).toEqual([]);
    expect(ready.filter(r => r.hotel_spa_risk).length).toBe(0);
  });

  test('Class A audit + chain inventory; Tirana/Durrës deep audits', () => {
    expect(chain.qualifying_class_a_chains).toBe(0);
    expect(chain.potential_class_a_operators).toBe(1);
    expect(chain.operators.Repeat.discovered_units).toBe(3);
    expect(staging.filter(r => r.brand === 'Repeat' && r.city === 'Tirana').length).toBe(
      3,
    );
    expect(staging.filter(r => r.city === 'Tirana').length).toBeGreaterThan(15);
    expect(staging.filter(r => r.city === 'Durrës').length).toBeGreaterThan(2);
    expect(staging.filter(r => r.city === 'Sarandë').length).toBeGreaterThan(0);
    expect(staging.filter(r => r.city === 'Peshkopi').length).toBeGreaterThan(0);
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    for (const city of REQUIRED_CITIES) {
      expect(cityCov.cities[city]).toBeTruthy();
      expect(report.city_coverage[city]).toBeTruthy();
    }
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.cross_border.montenegro_ready).toBe(0);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(report.cross_border.mk_ready).toBe(0);
    expect(report.cross_border.greece_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicate_conflicts).toBe(
      0,
    );
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('Dibër/Debar and Ohrid/Struga identity safety', () => {
    const debarProbe = staging.find(r => r.name?.includes('Debar MK'));
    const ohridProbe = staging.find(r => r.name?.includes('Ohrid MK'));
    const peshkopi = staging.filter(
      r => r.city === 'Peshkopi' && r.territory === 'Albania',
    );
    const pogradec = staging.filter(
      r => r.city === 'Pogradec' && r.territory === 'Albania',
    );
    expect(debarProbe?.import_category).toBe('EXCLUDED');
    expect(ohridProbe?.import_category).toBe('EXCLUDED');
    expect(peshkopi.length).toBeGreaterThan(0);
    expect(pogradec.length).toBeGreaterThan(0);
  });

  test('country resolution, i18n, orphan al_*, search index', () => {
    expect(isAlbaniaCountry('Albania')).toBe(true);
    expect(isAlbaniaCountry('Shqipëri')).toBe(true);
    expect(isAlbaniaCountry('Republika e Shqipërisë')).toBe(true);
    expect(isAlbaniaCountry('Albanien')).toBe(true);
    expect(isMontenegroCountry('Albania')).toBe(false);
    expect(isNorthMacedoniaCountry('Albania')).toBe(false);
    expect(isGreeceCountry('Albania')).toBe(false);
    expect(isBosniaHerzegovinaCountry('Albania')).toBe(false);
    expect(gymCountryTranslationKey('Albania')).toBe('countries.albania');
    expect(en.countries.albania).toBe('Albania');
    expect(da.countries.albania).toBeTruthy();
    expect(sv.countries.albania).toBeTruthy();
    expect(nb.countries.albania).toBeTruthy();

    const stub = resolveGymOrStub('al_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Albania/i);

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'al_testprobe01',
        name: 'Probe Gym Tirana',
        city: 'Tirana',
        brand: 'Probe',
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(
      /albania|shqip|tirana|palest/,
    );
  });

  test('projected 11831 at Phase 1; check-in 200 m; Phase 1 SHA artifacts frozen', () => {
    expect(report.projected_catalog).toBe(PHASE1_REPORT_TOTAL);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    const shaBefore = fs
      .readFileSync(path.join(dataDir, 'ALBANIA_PHASE1_SHA_BEFORE.txt'), 'utf8')
      .trim();
    const shaAfterFile = fs
      .readFileSync(path.join(dataDir, 'ALBANIA_PHASE1_SHA_AFTER.txt'), 'utf8')
      .trim();
    expect(shaBefore).toBe(PHASE1_REPORT_SHA256);
    expect(shaAfterFile).toBe(PHASE1_REPORT_SHA256);
  });
});
