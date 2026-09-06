/**
 * Montenegro Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleMontenegroCoordinate,
  MONTENEGRO_POSTAL_RE,
  isMontenegroCountry,
  isMoldovaCountry,
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
const CURRENT_PRODUCTION_TOTAL = 11921; // live after Bosnia merge
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE1_PRODUCTION_TOTAL = 11749;
const PHASE1_REPORT_SHA256 =
  '753f4651f4a6b75576165c61ab0ef604aff41575a90118fc96956bc40094aec8';

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
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Podgorica',
    address: partial.address ?? 'Slobode 1',
    postalCode: partial.postalCode ?? '81000',
    country: 'Montenegro',
    region: 'Montenegro',
    latitude: partial.latitude ?? 42.43,
    longitude: partial.longitude ?? 19.26,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Slobode 1',
      city: partial.city ?? 'Podgorica',
      postal_code: partial.postalCode ?? '81000',
      country: 'Montenegro',
      lat: partial.latitude ?? 42.43,
      lng: partial.longitude ?? 19.26,
      is_active: true,
      is_coming_soon: false,
    } as any,
  };
}

describe('Montenegro Phase 1 staging (no production merge)', () => {
  const centersPath = path.join(__dirname, '../src/data/centers.json');
  const sha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(centersPath))
    .digest('hex');

  // Live staging is Phase 2; Phase 1 conclusions frozen under phase2/
  const staging = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../data/montenegro/phase2/phase1_staging_snapshot.json'),
      'utf8',
    ),
  ) as StagingRow[];
  const ready = require('../data/montenegro/MONTENEGRO_PHASE1_READY_TO_IMPORT.json') as StagingRow[];
  const report = require('../data/montenegro/MONTENEGRO_PHASE1_READINESS_REPORT.json') as {
    production_total: number;
    production_sha256: string;
    ready_to_import: number;
    needs_review: number;
    needs_coordinates: number;
    qualifying_class_a_chains: number;
    class_a_locations: number;
    city_coverage: Record<string, string>;
    unexplained_b_gaps: number;
    unexplained_d_gaps: number;
    small_market_assessment: string;
    phase2_required: boolean;
    merge_ready: boolean;
    projected_catalog: number;
    crosses_12500: boolean;
    global_stress_qa_required_now: boolean;
    verdict: string;
    cross_border: Record<string, number>;
    data_quality: {hard_duplicate_conflicts: number; mojibake: string[]};
  };
  const rebrand = require('../data/montenegro/MONTENEGRO_PHASE1_REBRAND_MAP.json') as {
    unresolved_conflicts: number;
  };
  const dup = require('../data/montenegro/montenegro_duplicate_analysis.json') as {
    hard_duplicate_conflicts: number;
  };

  test('production reflects Bosnia merge (11831 / ME 26); Phase 1 report freeze', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('me_')).length).toBe(26);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.production_total).toBe(PHASE1_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(GYM_ID_PREFIX.montenegro).toBe('me_');
  });

  test('prior-country regression intact', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging IDs unique me_* ; statuses valid', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.every(r => /^me_[a-f0-9]{10}$/.test(r.id))).toBe(true);
    for (const r of staging) {
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
  });

  test('READY purity: 0 READY; no CLOSED/EXCLUDED in READY artifact', () => {
    expect(ready.length).toBe(0);
    expect(report.ready_to_import).toBe(0);
    expect(ready.every(r => r.import_category === 'READY_TO_IMPORT')).toBe(true);
    expect(
      ready.some(r => r.import_category === 'CLOSED' || r.import_category === 'EXCLUDED'),
    ).toBe(false);
  });

  test('Class A = 0; independent path recommended; Phase 2 required', () => {
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(report.small_market_assessment).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(report.phase2_required).toBe(true);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe('MONTENEGRO PHASE 2 REQUIRED BEFORE MERGE');
  });

  test('ME postcodes + coords for review rows; no fallback READY', () => {
    const reviewable = staging.filter(
      r =>
        (r.import_category === 'NEEDS_REVIEW' || r.import_category === 'NEEDS_COORDINATES') &&
        r.territory === 'Montenegro' &&
        !r.foreign_probe &&
        r.discovery_class !== 'regional_gap' &&
        r.discovery_class !== 'international_probe',
    );
    for (const r of reviewable) {
      if (r.postal_code && r.postal_code !== 'n/a') {
        expect(MONTENEGRO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      }
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleMontenegroCoordinate(r.lat, r.lng)).toBe(true);
        expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      }
    }
    expect(report.data_quality.mojibake.length).toBe(0);
    for (const r of staging) {
      expect(
        MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`),
      ).toBe(false);
    }
  });

  test('cross-border contamination READY = 0', () => {
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.cross_border.bosnia_ready).toBe(0);
    expect(report.cross_border.croatia_ready).toBe(0);
    expect(report.cross_border.albania_ready).toBe(0);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(
      ready.some(
        r =>
          /Dubrovnik|Trebinje|Shkod|Novi Pazar|Pej/i.test(r.city) ||
          r.foreign_probe === true,
      ),
    ).toBe(false);
  });

  test('territorial gate rejects foreign probes', () => {
    expect(isPlausibleMontenegroCoordinate(42.6507, 18.0944)).toBe(false); // Dubrovnik
    expect(isPlausibleMontenegroCoordinate(42.71197, 18.34362)).toBe(false); // Trebinje
    expect(isPlausibleMontenegroCoordinate(42.0683, 19.5126)).toBe(false); // Shkodër
    expect(isPlausibleMontenegroCoordinate(43.1367, 20.5122)).toBe(false); // Novi Pazar
    expect(isPlausibleMontenegroCoordinate(42.6593, 20.2887)).toBe(false); // Pejë
    expect(isPlausibleMontenegroCoordinate(42.4304, 19.2594)).toBe(true); // Podgorica
  });

  test('duplicates / rebrand / city matrix', () => {
    expect(dup.hard_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts).toBe(0);
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    for (const city of [
      'Podgorica',
      'Nikšić',
      'Budva',
      'Bar',
      'Herceg Novi',
      'Kotor',
      'Tivat',
      'Bijelo Polje',
      'Berane',
      'Ulcinj',
      'Cetinje',
      'Pljevlja',
      'Rožaje',
    ]) {
      expect(report.city_coverage[city]).toBeTruthy();
    }
  });

  test('search / country aliases / orphan me_* / check-in unchanged', () => {
    expect(isMontenegroCountry('Montenegro')).toBe(true);
    expect(isMontenegroCountry('Crna Gora')).toBe(true);
    expect(isMoldovaCountry('Montenegro')).toBe(false);
    expect(gymCountryTranslationKey('Montenegro')).toBe('countries.montenegro');
    expect(en.countries.montenegro).toBe('Montenegro');
    expect(da.countries.montenegro).toBe('Montenegro');
    expect(sv.countries.montenegro).toBe('Montenegro');
    expect(nb.countries.montenegro).toBe('Montenegro');

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'me_probe00001',
        name: 'Capital Fitness Podgorica',
        city: 'Podgorica',
        brand: 'The Capital Fitness Center',
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(/montenegro|crna gora|podgorica/);

    const stub = resolveGymOrStub('me_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Montenegro/i);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
  });

  test('projected catalog below 12500; no Global Stress QA now', () => {
    expect(report.projected_catalog).toBe(PHASE1_PRODUCTION_TOTAL);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
  });
});
