/**
 * Kosovo Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleKosovoCoordinate,
  KOSOVO_POSTAL_RE,
  isKosovoCountry,
  isAlbaniaCountry,
  isMontenegroCountry,
  isNorthMacedoniaCountry,
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
const PHASE1_REPORT_TOTAL = 11840;
const PHASE1_REPORT_SHA256 =
  'a1aba09e9ea375e8aa3c82c719556182ad07d8251c31ec142e307670e340aca0';

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
  'Prishtina',
  'Fushë Kosovë',
  'Prizren',
  'Pejë',
  'Gjakovë',
  'Ferizaj',
  'Gjilan',
  'Mitrovicë',
  'North Mitrovica',
  'Vushtrri',
  'Podujevë',
  'Lipjan',
  'Drenas',
  'Skenderaj',
  'Rahovec',
  'Malishevë',
  'Suharekë',
  'Kaçanik',
  'Klina',
  'Deçan',
  'Istog',
  'Dragash',
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
    city: partial.city ?? 'Prishtina',
    address: partial.address ?? 'Rruga Nëna Terezë 1',
    postalCode: partial.postalCode ?? '10000',
    country: 'Kosovo',
    region: 'Kosovo',
    latitude: partial.latitude ?? 42.6629,
    longitude: partial.longitude ?? 21.1655,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Rruga Nëna Terezë 1',
      postal_code: partial.postalCode ?? '10000',
      city: partial.city ?? 'Prishtina',
      country: 'Kosovo',
      lat: partial.latitude ?? 42.6629,
      lng: partial.longitude ?? 21.1655,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('Kosovo Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/kosovo');
  const stagingPath = path.join(dataDir, 'phase1/phase1_staging_snapshot.json');
  const reportPath = path.join(dataDir, 'KOSOVO_PHASE1_READINESS_REPORT.json');
  const readyPath = path.join(dataDir, 'KOSOVO_PHASE1_READY_TO_IMPORT.json');
  const rebrandPath = path.join(dataDir, 'KOSOVO_PHASE1_REBRAND_MAP.json');
  const dupPath = path.join(dataDir, 'KOSOVO_PHASE1_DUPLICATE_ANALYSIS.json');
  const chainPath = path.join(dataDir, 'KOSOVO_PHASE1_CHAIN_INVENTORY.json');
  const cityPath = path.join(dataDir, 'KOSOVO_PHASE1_CITY_COVERAGE.json');
  const langPath = path.join(dataDir, 'KOSOVO_PHASE1_LANGUAGE_ALIAS_AUDIT.json');
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
  const langAudit = JSON.parse(fs.readFileSync(langPath, 'utf8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  test('Phase 1 report frozen at 11840; live catalog 11921 post-merge', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(centers.filter(c => c.id.startsWith('xk_')).length).toBe(18);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE1_REPORT_TOTAL);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(report.kosovo_live).toBe(0);
    expect(report.xk_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.kosovo).toBe('xk_');
  });

  test('prior-country regressions intact including Albania 9', () => {
    expect(centers.filter(c => c.country === 'Albania').length).toBe(9);
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

  test('staging IDs unique xk_*; statuses valid; READY = 0; Phase 2 required', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBe(86);
    for (const r of staging) {
      expect(r.id).toMatch(/^xk_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
    expect(ready.length).toBe(0);
    expect(report.ready_to_import).toBe(0);
    expect(report.needs_review).toBe(36);
    expect(report.needs_coordinates).toBe(10);
    expect(report.excluded).toBe(40);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(report.potential_class_a_operators).toBe(1);
    expect(report.market).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(report.phase2_required).toBe(true);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe('KOSOVO PHASE 2 REQUIRED BEFORE MERGE');
  });

  test('North Kosovo rows remain country=Kosovo; no separate Serbian prefix', () => {
    const north = staging.filter(r =>
      ['North Mitrovica', 'Zvečan', 'Leposaviq', 'Zubin Potok'].includes(r.city),
    );
    expect(north.length).toBeGreaterThan(0);
    for (const r of north) {
      if (!r.foreign_probe) {
        expect(r.country).toBe('Kosovo');
        expect(r.id.startsWith('xk_')).toBe(true);
      }
    }
    expect(staging.some(r => r.id.startsWith('rs_'))).toBe(false);
    expect(staging.some(r => r.id.startsWith('sr_'))).toBe(false);
  });

  test('DQ: postcodes/coords for reviewable rows; no READY leakage', () => {
    const reviewable = staging.filter(
      r =>
        !r.foreign_probe &&
        (r.territory === 'Kosovo' || !r.territory) &&
        ['NEEDS_REVIEW', 'NEEDS_COORDINATES', 'READY_TO_IMPORT'].includes(
          r.import_category,
        ) &&
        r.discovery_class !== 'regional_gap' &&
        r.discovery_class !== 'international_probe',
    );
    for (const r of reviewable) {
      if (r.postal_code && r.postal_code !== 'n/a') {
        expect(KOSOVO_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      }
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleKosovoCoordinate(r.lat, r.lng)).toBe(true);
        expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
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

  test('Class A audit + Prishtina/North Kosovo deep audits', () => {
    expect(chain.qualifying_class_a_chains).toBe(0);
    expect(chain.potential_class_a_operators).toBe(1);
    expect(staging.filter(r => r.city === 'Prishtina').length).toBeGreaterThan(15);
    expect(staging.filter(r => r.city === 'Fushë Kosovë').length).toBeGreaterThan(0);
    expect(staging.filter(r => r.city === 'Prizren').length).toBeGreaterThan(0);
    expect(staging.filter(r => r.city === 'Pejë').length).toBeGreaterThan(0);
    expect(staging.filter(r => r.city === 'Gjakovë').length).toBeGreaterThan(0);
    expect(staging.filter(r => r.city === 'North Mitrovica').length).toBeGreaterThan(0);
  });

  test('city coverage terminal; B/D gaps 0; cross-border 0', () => {
    for (const city of REQUIRED_CITIES) {
      expect(cityCov.cities[city]).toBeTruthy();
      expect(report.city_coverage[city]).toBeTruthy();
    }
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
    expect(report.cross_border.albania_ready).toBe(0);
    expect(report.cross_border.montenegro_ready).toBe(0);
    expect(report.cross_border.mk_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(dup.hard_duplicate_conflicts ?? report.data_quality.hard_duplicate_conflicts).toBe(
      0,
    );
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
  });

  test('Albanian and Serbian language discovery audits performed', () => {
    expect(langAudit.performed).toBe(true);
    expect(langAudit.languages).toContain('Albanian');
    expect(langAudit.languages).toContain('Serbian');
    expect(langAudit.cities_audited_albanian).toContain('Prishtina');
    expect(langAudit.cities_audited_serbian).toContain('North Mitrovica');
    expect(langAudit.serbian_audit_candidates).toBeGreaterThan(0);
  });

  test('country resolution, i18n, orphan xk_*, search index', () => {
    expect(isKosovoCountry('Kosovo')).toBe(true);
    expect(isKosovoCountry('Kosova')).toBe(true);
    expect(isKosovoCountry('Republika e Kosovës')).toBe(true);
    expect(isAlbaniaCountry('Kosovo')).toBe(false);
    expect(isMontenegroCountry('Kosovo')).toBe(false);
    expect(isNorthMacedoniaCountry('Kosovo')).toBe(false);
    expect(gymCountryTranslationKey('Kosovo')).toBe('countries.kosovo');
    expect(en.countries.kosovo).toBe('Kosovo');
    expect(da.countries.kosovo).toBeTruthy();
    expect(sv.countries.kosovo).toBeTruthy();
    expect(nb.countries.kosovo).toBeTruthy();

    const stub = resolveGymOrStub('xk_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Kosovo/i);

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'xk_test00001',
        name: 'Probe Gym Prishtina',
        city: 'Prishtina',
        brand: 'Probe',
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(/kosovo|prishtina|kosova/);
  });

  test('projected 11840 at Phase 1; check-in 200 m; Phase 1 SHA artifacts frozen', () => {
    expect(report.projected_catalog).toBe(PHASE1_REPORT_TOTAL);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    const shaBefore = fs
      .readFileSync(path.join(dataDir, 'KOSOVO_PHASE1_SHA_BEFORE.txt'), 'utf8')
      .trim();
    const shaAfterFile = fs
      .readFileSync(path.join(dataDir, 'KOSOVO_PHASE1_SHA_AFTER.txt'), 'utf8')
      .trim();
    expect(shaBefore).toBe(PHASE1_REPORT_SHA256);
    expect(shaAfterFile).toBe(PHASE1_REPORT_SHA256);
  });
});
