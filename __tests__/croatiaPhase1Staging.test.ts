/**
 * Croatia Phase 1 staging validation — discovery + staging only (no production merge).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleCroatiaCoordinate,
  CROATIA_POSTAL_RE,
  isCroatiaCountry,
} from '../src/utils/gymCountry';
import {GYM_ID_PREFIX} from '../src/data/gymIds';
import {CHECK_IN_RADIUS_METERS} from '../src/config/dataConfig';
import {AUTO_CHECKOUT_DISTANCE_METERS} from '../src/config/activeCheckinGeofenceConfig';
import {gymCountryTranslationKey} from '../src/utils/gymCountryLabel';
import {
  normalizeGymSearchValue,
  compactGymSearchValue,
} from '../src/services/gymSearch/gymSearchNormalize';
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
const FOREIGN =
  /\b(slovenia|ljubljana|hungary|budapest|serbia|beograd|bosnia|sarajevo|montenegro|podgorica|mostar|neum|trieste)\b/i;

const REQUIRED_CITIES = [
  'Zagreb',
  'Split',
  'Rijeka',
  'Osijek',
  'Zadar',
  'Pula',
  'Varaždin',
  'Slavonski Brod',
  'Karlovac',
  'Šibenik',
  'Dubrovnik',
];

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Zagreb',
    address: partial.address ?? 'Ilica 1',
    postalCode: partial.postalCode ?? '10000',
    country: 'Croatia',
    region: 'Croatia',
    latitude: partial.latitude ?? 45.815,
    longitude: partial.longitude ?? 15.982,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Ilica 1',
      postal_code: partial.postalCode ?? '10000',
      city: partial.city ?? 'Zagreb',
      country: 'Croatia',
      lat: partial.latitude ?? 45.815,
      lng: partial.longitude ?? 15.982,
      is_active: true,
    },
  } as DanishGym;
}

describe('Croatia Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/croatia');
  const stagingPath = path.join(dataDir, 'phase1/phase1_staging_snapshot.json');
  const reportPath = path.join(dataDir, 'CROATIA_PHASE1_READINESS_REPORT.json');
  const readyPath = path.join(dataDir, 'CROATIA_PHASE1_READY_TO_IMPORT.json');
  const rebrandPath = path.join(dataDir, 'CROATIA_PHASE1_REBRAND_MAP.json');
  const dupPath = path.join(dataDir, 'CROATIA_PHASE1_DUPLICATE_ANALYSIS.json');
  const cityPath = path.join(dataDir, 'CROATIA_PHASE1_CITY_COVERAGE.json');
  const langPath = path.join(dataDir, 'CROATIA_PHASE1_LANGUAGE_ALIAS_AUDIT.json');
  const crossPath = path.join(dataDir, 'CROATIA_PHASE1_CROSS_BORDER_AUDIT.json');
  const hotelPath = path.join(dataDir, 'CROATIA_PHASE1_HOTEL_RESORT_AUDIT.json');
  const shaBeforePath = path.join(dataDir, 'phase1/PHASE1_SHA_BEFORE.txt');
  const shaAfterPath = path.join(dataDir, 'phase1/PHASE1_SHA_AFTER.txt');
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
    foreign_probe?: boolean;
    territory?: string;
  }>;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8')) as typeof staging;
  const rebrand = JSON.parse(fs.readFileSync(rebrandPath, 'utf8')) as {
    unresolved_conflicts?: number;
  };
  const dup = JSON.parse(fs.readFileSync(dupPath, 'utf8')) as {
    hard_duplicate_conflicts?: number;
    phase1_counts?: {identical_coords?: number};
  };
  const cityCov = JSON.parse(fs.readFileSync(cityPath, 'utf8')) as {
    cities: Record<string, string>;
    unexplained_b_gaps: number;
    unexplained_d_gaps: number;
  };
  const langAudit = JSON.parse(fs.readFileSync(langPath, 'utf8')) as {performed?: boolean};
  const crossBorder = JSON.parse(fs.readFileSync(crossPath, 'utf8')) as Record<string, number>;
  const hotelAudit = JSON.parse(fs.readFileSync(hotelPath, 'utf8')) as {
    hotel_resort_ready_leakage: number;
  };
  const shaBefore = fs.readFileSync(shaBeforePath, 'utf8').trim();
  const shaAfter = fs.readFileSync(shaAfterPath, 'utf8').trim();
  const sha = crypto.createHash('sha256').update(fs.readFileSync(centersPath)).digest('hex');

  test('production frozen at 11921; SHA unchanged; Croatia hr_* live from prior merge', () => {
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaBefore).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(ALL_GYM_CENTERS.filter(c => c.id.startsWith('hr_')).length).toBe(80);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Croatia').length).toBe(80);
    expect(GYM_ID_PREFIX.croatia).toBe('hr_');
    expect(report.production_total).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(LIVE_PRODUCTION_SHA256);
  });

  test('prior-country regressions including Serbia 63', () => {
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Serbia').length).toBe(63);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Kosovo').length).toBe(18);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Albania').length).toBe(9);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Bosnia and Herzegovina').length).toBe(31);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(ALL_GYM_CENTERS.filter(c => c.country === 'Iceland').length).toBe(27);
  });

  test('Phase 1 staging snapshot: hr_* IDs; READY = Croatia; 80 Class A chain rows', () => {
    expect(staging.every(r => r.id.startsWith('hr_'))).toBe(true);
    expect(new Set(staging.map(r => r.id)).size).toBe(staging.length);
    expect(ready.length).toBe(80);
    expect(report.ready_count).toBe(80);
    for (const r of ready) {
      expect(r.country).toBe('Croatia');
      expect(r.import_category).toBe('READY_TO_IMPORT');
    }
    expect(ready.filter(r => r.brand === 'Gyms4you').length).toBe(48);
    expect(ready.filter(r => r.brand === 'THE Fitness').length).toBe(21);
    expect(ready.filter(r => r.brand === 'Gibi Gib').length).toBe(4);
    expect(ready.filter(r => r.brand === 'Fitness Centar Joker').length).toBe(4);
    expect(ready.filter(r => r.brand === 'Multihealth').length).toBe(3);
    expect((report.class_a_chain_names as string[]).length).toBeGreaterThanOrEqual(5);
  });

  test('READY data quality: postcodes, coords, no fallback/mojibake/foreign text', () => {
    const ids = new Set<string>();
    for (const r of ready) {
      expect(r.id).toMatch(/^hr_[a-f0-9]{10}$/);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(CROATIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lng)).toBe(true);
      expect(isPlausibleCroatiaCoordinate(r.lat!, r.lng!)).toBe(true);
      expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(false);
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
      expect(FOREIGN.test(`${r.name} ${r.address} ${r.city}`)).toBe(false);
    }
    const dq = report.data_quality as Record<string, number>;
    expect(dq.invalid_ready_postcodes).toBe(0);
    expect(dq.invalid_ready_coordinates).toBe(0);
    expect(dq.fallback_ready_coordinates).toBe(0);
    expect(dq.missing_ready_fields).toBe(0);
    expect(dq.mojibake).toBe(0);
    expect(dq.foreign_ready_outliers).toBe(0);
  });

  test('cross-border safety: SI/BA/RS/ME/HU/IT outliers 0; Neum/Brod gates clean', () => {
    expect(crossBorder.slovenia_ready).toBe(0);
    expect(crossBorder.bosnia_ready).toBe(0);
    expect(crossBorder.serbia_ready).toBe(0);
    expect(crossBorder.montenegro_ready).toBe(0);
    expect(crossBorder.hungary_ready).toBe(0);
    expect(crossBorder.italy_ready).toBe(0);
    expect(crossBorder.neum_croatia_collisions).toBe(0);
    expect(crossBorder.brod_identity_collisions).toBe(0);
    expect(
      staging.some(r => r.import_category === 'READY_TO_IMPORT' && r.foreign_probe),
    ).toBe(false);
    expect(staging.filter(r => r.foreign_probe && r.import_category === 'EXCLUDED').length).toBeGreaterThan(
      10,
    );
  });

  test('hotel/spa/specialist/institutional READY leakage = 0', () => {
    expect(hotelAudit.hotel_resort_ready_leakage).toBe(0);
    const dq = report.data_quality as Record<string, number>;
    expect(dq.hotel_resort_ready_leakage).toBe(0);
    expect(dq.specialist_ready_leakage).toBe(0);
    expect(dq.institutional_ready_leakage).toBe(0);
    expect(ready.some(r => /orlandofit/i.test(r.brand))).toBe(false);
    expect(ready.some(r => /^Play Fitness$/i.test(r.brand))).toBe(false);
  });

  test('duplicates, diacritics, rebrands; city coverage B/D gaps 0', () => {
    expect(dup.hard_duplicate_conflicts ?? 0).toBe(0);
    expect(dup.phase1_counts?.identical_coords ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(report.duplicate_analysis).toMatchObject({diacritic_duplicate_conflicts: 0});
    expect(cityCov.unexplained_b_gaps).toBe(0);
    expect(cityCov.unexplained_d_gaps).toBe(0);
    for (const city of REQUIRED_CITIES) {
      expect(cityCov.cities[city]).toBeDefined();
    }
    const blob = staging.map(s => `${s.name} ${s.city}`).join('\n');
    expect(blob).toMatch(/č|ć|š|ž|đ/i);
  });

  test('i18n, search aliases, orphan hr_*, check-in 200 m; Phase 2 required', () => {
    expect(isCroatiaCountry('Croatia')).toBe(true);
    expect(isCroatiaCountry('Hrvatska')).toBe(true);
    expect(gymCountryTranslationKey('Croatia')).toBe('countries.croatia');
    expect(en.countries.croatia).toBe('Croatia');
    expect(da.countries.croatia).toBe('Kroatien');
    expect(sv.countries.croatia).toBe('Kroatien');
    expect(nb.countries.croatia).toBe('Kroatia');

    expect(normalizeGymSearchValue('Varaždin')).toBe('varazdin');
    expect(normalizeGymSearchValue('Šibenik')).toBe('sibenik');
    expect(compactGymSearchValue('10000')).toBe('10000');

    const entry = buildGymSearchEntry(
      fakeGym({id: 'hr_probe', city: 'Zagreb', address: 'Ilica 1', postalCode: '10000'}),
    );
    expect(entry.haystack).toMatch(/croatia|hrvatska|zagreb/i);

    const stub = resolveGymOrStub('hr_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(/Croatia/i);

    expect(isPlausibleCroatiaCoordinate(46.056, 14.508)).toBe(false);
    expect(isPlausibleCroatiaCoordinate(44.7866, 20.4489)).toBe(false);

    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);
    expect(langAudit.performed).toBe(true);

    expect(report.market_model).toBe('CHAIN_LED');
    expect(report.phase2_required).toBe(true);
    expect(report.verdict).toBe('CROATIA PHASE 2 REQUIRED BEFORE MERGE');
    expect(report.projected_catalog).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.crosses_12500_if_merged).toBe(false);
    expect(report.global_stress_qa_required_after_merge).toBe(false);
  });
});
