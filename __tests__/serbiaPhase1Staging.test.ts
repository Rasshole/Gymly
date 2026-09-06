/**
 * Serbia Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleSerbiaCoordinate,
  SERBIA_POSTAL_RE,
  isSerbiaCountry,
  isKosovoCountry,
  isPlausibleKosovoCoordinate,
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
const CURRENT_PRODUCTION_TOTAL = 11921;
const LIVE_PRODUCTION_SHA256 =
  'de118760217108ec7dfec4d6085584d1c6b0bad267c0031130998b16b15d624d';
const PHASE1_REPORT_TOTAL = 11858;
const PHASE1_REPORT_SHA =
  'f32fd0af4b1efe26d3da5676264b9a08bdc47ed6bd0a472b8b3278578896f5c5';

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
  'Belgrade',
  'Novi Sad',
  'Niš',
  'Kragujevac',
  'Subotica',
  'Pančevo',
  'Čačak',
  'Kraljevo',
  'Novi Pazar',
  'Kruševac',
  'Leskovac',
  'Užice',
  'Zrenjanin',
  'Smederevo',
  'Valjevo',
  'Šabac',
  'Sombor',
  'Vranje',
  'Bujanovac',
  'Preševo',
  'Pirot',
  'Sremska Mitrovica',
];

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Belgrade',
    address: partial.address ?? 'Knez Mihailova 1',
    postalCode: partial.postalCode ?? '11000',
    country: 'Serbia',
    region: 'Serbia',
    latitude: partial.latitude ?? 44.8176,
    longitude: partial.longitude ?? 20.4633,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Knez Mihailova 1',
      postal_code: partial.postalCode ?? '11000',
      city: partial.city ?? 'Belgrade',
      country: 'Serbia',
      lat: partial.latitude ?? 44.8176,
      lng: partial.longitude ?? 20.4633,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Serbia Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/serbia');
  const stagingPath = path.join(dataDir, 'phase1/phase1_staging_snapshot.json');
  const reportPath = path.join(dataDir, 'SERBIA_PHASE1_READINESS_REPORT.json');
  const readyPath = path.join(dataDir, 'SERBIA_PHASE1_READY_TO_IMPORT.json');
  const rebrandPath = path.join(dataDir, 'SERBIA_PHASE1_REBRAND_MAP.json');
  const dupPath = path.join(dataDir, 'SERBIA_PHASE1_DUPLICATE_ANALYSIS.json');
  const chainPath = path.join(dataDir, 'SERBIA_PHASE1_CHAIN_INVENTORY.json');
  const cityPath = path.join(dataDir, 'SERBIA_PHASE1_CITY_COVERAGE.json');
  const langPath = path.join(dataDir, 'SERBIA_PHASE1_LANGUAGE_ALIAS_AUDIT.json');
  const crossPath = path.join(dataDir, 'SERBIA_PHASE1_CROSS_BORDER_AUDIT.json');
  const centersPath = path.join(__dirname, '../src/data/centers.json');

  const staging = JSON.parse(fs.readFileSync(stagingPath, 'utf8')) as Array<{
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
    eligibility_candidate?: string;
    territory?: string;
    foreign_probe?: boolean;
    hotel_spa_risk?: boolean;
  }>;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as typeof staging;
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
  const langAudit = JSON.parse(fs.readFileSync(langPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const crossBorder = JSON.parse(fs.readFileSync(crossPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const centersRaw = fs.readFileSync(centersPath);
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  test('Phase 1 report frozen (11858 / RS 0); live catalog 11921 post-merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('rs_')).length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(report.production_total).toBe(PHASE1_REPORT_TOTAL);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA);
    expect(report.serbia_live).toBe(0);
    expect(report.rs_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.serbia).toBe('rs_');
  });

  test('prior-country regressions intact including Kosovo 18', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(
      31,
    );
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('staging IDs rs_*; READY country Serbia; no Kosovo READY as Serbia', () => {
    expect(staging.length).toBe(126);
    expect(staging.every(r => r.id.startsWith('rs_'))).toBe(true);
    expect(new Set(staging.map(r => r.id)).size).toBe(staging.length);
    for (const r of ready) {
      expect(r.country).toBe('Serbia');
      expect(r.id.startsWith('rs_')).toBe(true);
      expect(r.import_category).toBe('READY_TO_IMPORT');
      expect(isKosovoCountry(r.country)).toBe(false);
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleKosovoCoordinate(r.lat, r.lng)).toBe(false);
      }
    }
    expect(ready.length).toBe(56);
    expect(report.ready_to_import).toBe(56);
    expect(report.needs_review).toBe(34);
    expect(report.needs_coordinates).toBe(6);
    expect(report.excluded).toBe(30);
  });

  test('Class A chains: Ahilej 33 + Non Stop 16 + Mega Gym 7 = 56 READY', () => {
    expect(report.qualifying_class_a_chains).toBe(3);
    expect(report.class_a_locations).toBe(56);
    expect(chain.operators?.Ahilej?.class_a).toBe(true);
    expect(chain.operators?.Ahilej?.discovered_units).toBe(33);
    expect(chain.operators?.['Non Stop Fitness']?.class_a).toBe(true);
    expect(chain.operators?.['Non Stop Fitness']?.discovered_units).toBe(16);
    expect(chain.operators?.['Mega Gym']?.class_a).toBe(true);
    expect(chain.operators?.['Mega Gym']?.discovered_units).toBe(7);
    expect(ready.filter(r => r.brand === 'Ahilej').length).toBe(33);
    expect(ready.filter(r => r.brand === 'Non Stop Fitness').length).toBe(16);
    expect(ready.filter(r => r.brand === 'Mega Gym').length).toBe(7);
    expect(report.class_a_estates_complete).toBe(true);
  });

  test('READY purity: postcodes, coords, no fallback/mojibake/Kosovo leakage', () => {
    for (const r of ready) {
      expect(SERBIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleSerbiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(false);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(r.eligibility_candidate).toBe('CHAIN_CLASS_A');
    }
    expect(report.data_quality.kosovo_ready_leakage).toBe(0);
    expect(report.data_quality.hotel_spa_leakage_ready).toBe(0);
    expect(report.data_quality.fallback_ready).toEqual([]);
  });

  test('Mitrovica identity gate; cross-border READY outliers 0', () => {
    expect(crossBorder.mitrovica_identity_gate?.sremska_mitrovica_serbia).toBe(true);
    expect(crossBorder.mitrovica_identity_gate?.kosovo_mitrovica_excluded).toBe(true);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(report.cross_border.hungary_ready).toBe(0);
    expect(report.cross_border.romania_ready).toBe(0);
    expect(report.cross_border.mk_ready).toBe(0);
    expect(report.cross_border.ba_ready).toBe(0);
    expect(
      staging.some(
        r =>
          r.import_category === 'READY_TO_IMPORT' &&
          (r.foreign_probe || r.territory !== 'Serbia'),
      ),
    ).toBe(false);
    expect(
      staging.some(
        r => r.import_category === 'READY_TO_IMPORT' && isPlausibleKosovoCoordinate(r.lat!, r.lng!),
      ),
    ).toBe(false);
  });

  test('city coverage terminal; B/D gaps 0; Phase 2 required', () => {
    for (const city of REQUIRED_CITIES) {
      expect(cityCov.cities[city]).toBeDefined();
      expect(report.city_coverage[city]).toBeDefined();
    }
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.market).toBe('MIXED_CHAIN_INDEPENDENT');
    expect(report.phase2_required).toBe(true);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe('SERBIA PHASE 2 REQUIRED BEFORE MERGE');
  });

  test('duplicates / rebrands / exclusions leakage', () => {
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicate_conflicts).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    const liveIds = new Set(ALL_GYM_CENTERS.map(c => c.id));
    const excluded = staging.filter(r => r.import_category === 'EXCLUDED');
    for (const r of excluded) {
      expect(liveIds.has(r.id)).toBe(false);
    }
    for (const r of staging) {
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
  });

  test('Serbian language audit; i18n; orphan rs_*; check-in 200 m', () => {
    expect(langAudit.performed).toBe(true);
    expect(langAudit.languages).toContain('Serbian');
    expect(langAudit.languages).toContain('Latin');
    expect(langAudit.languages).toContain('Cyrillic');

    expect(gymCountryTranslationKey('Serbia')).toBe('countries.serbia');
    expect(en.countries.serbia).toBe('Serbia');
    expect(da.countries.serbia).toBe('Serbien');
    expect(sv.countries.serbia).toBe('Serbien');
    expect(nb.countries.serbia).toBe('Serbia');

    const stub = resolveGymOrStub('rs_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Serbia/i);
    expect(isSerbiaCountry('Srbija')).toBe(true);
    expect(isSerbiaCountry('Republika Srbija')).toBe(true);

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'rs_test_probe',
        name: 'Ahilej Belgrade',
        city: 'Belgrade',
        brand: 'Ahilej',
        latitude: 44.8176,
        longitude: 20.4633,
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(/serbia|beograd|teretana|srbija/i);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    const shaAfter = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(report.projected_catalog).toBe(11914);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
  });
});