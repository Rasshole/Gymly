/**
 * North Macedonia Phase 1 staging validation — discovery + staging only.
 * Production centers.json must remain frozen. No merge in Phase 1.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {ALL_GYM_CENTERS} from '../src/data/centerRegistry';
import {
  isPlausibleNorthMacedoniaCoordinate,
  NORTH_MACEDONIA_POSTAL_RE,
  isNorthMacedoniaCountry,
  isMontenegroCountry,
  isMoldovaCountry,
  isGreeceCountry,
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
const PHASE1_FROZEN_SHA =
  '6df5a27d1671a5b5721b63e04b2f4e891ed3c5058fa24ede7d370eaaeb1f5112';
const PHASE1_PRODUCTION_TOTAL = 11775;
const PHASE1_REPORT_SHA256 =
  '2eaa8b9f0ea10fce0a3ab0336f9312e6dc7ff77f463ee1669737f880ae6f0698';

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
  'Skopje',
  'Bitola',
  'Kumanovo',
  'Prilep',
  'Tetovo',
  'Ohrid',
  'Veles',
  'Štip',
  'Gostivar',
  'Strumica',
  'Kavadarci',
  'Kočani',
  'Kičevo',
  'Gevgelija',
  'Debar',
  'Radoviš',
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
  albanian_audit?: boolean;
};

function fakeGym(partial: Partial<DanishGym> & {id: string}): DanishGym {
  return {
    id: partial.id,
    name: partial.name ?? 'Probe Gym',
    city: partial.city ?? 'Skopje',
    address: partial.address ?? 'Ilindenska 1',
    postalCode: partial.postalCode ?? '1000',
    country: 'North Macedonia',
    region: 'North Macedonia',
    latitude: partial.latitude ?? 41.9981,
    longitude: partial.longitude ?? 21.4254,
    brand: partial.brand ?? 'Probe',
    _center: {
      id: partial.id,
      name: partial.name ?? 'Probe Gym',
      brand: partial.brand ?? 'Probe',
      address: partial.address ?? 'Ilindenska 1',
      postal_code: partial.postalCode ?? '1000',
      city: partial.city ?? 'Skopje',
      country: 'North Macedonia',
      lat: partial.latitude ?? 41.9981,
      lng: partial.longitude ?? 21.4254,
      is_active: true,
      is_coming_soon: false,
    },
  } as DanishGym;
}

describe('North Macedonia Phase 1 staging (no production merge)', () => {
  const dataDir = path.join(__dirname, '../data/north-macedonia');
  const stagingPath = path.join(dataDir, 'phase1/phase1_staging_snapshot.json');
  const reportPath = path.join(
    dataDir,
    'NORTH_MACEDONIA_PHASE1_READINESS_REPORT.json',
  );
  const readyPath = path.join(
    dataDir,
    'NORTH_MACEDONIA_PHASE1_READY_TO_IMPORT.json',
  );
  const rebrandPath = path.join(dataDir, 'NORTH_MACEDONIA_REBRAND_MAP.json');
  const dupPath = path.join(dataDir, 'NORTH_MACEDONIA_DUPLICATE_ANALYSIS.json');
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
  const centersRaw = fs.readFileSync(centersPath);
  const centers = JSON.parse(centersRaw.toString('utf8')) as Array<{
    id: string;
    country?: string;
  }>;
  const sha = crypto.createHash('sha256').update(centersRaw).digest('hex');

  test('production reflects BA merge (11831 / MK 25); Phase 1 report freeze', () => {
    expect(centers.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(sha).toBe(LIVE_PRODUCTION_SHA256);
    expect(centers.filter(c => c.country === 'North Macedonia').length).toBe(25);
    expect(centers.filter(c => c.id.startsWith('mk_')).length).toBe(25);
    expect(centers.filter(c => c.country === 'Montenegro').length).toBe(26);
    expect(centers.filter(c => c.country === 'Moldova').length).toBe(28);
    expect(centers.filter(c => c.country === 'San Marino').length).toBe(6);
    expect(centers.filter(c => c.country === 'Monaco').length).toBe(4);
    expect(centers.filter(c => c.country === 'Andorra').length).toBe(12);
    expect(centers.filter(c => c.country === 'Liechtenstein').length).toBe(7);
    expect(centers.filter(c => c.country === 'Iceland').length).toBe(27);
    expect(ALL_GYM_CENTERS.length).toBe(CURRENT_PRODUCTION_TOTAL);
    expect(report.production_total).toBe(PHASE1_PRODUCTION_TOTAL);
    expect(report.production_sha256).toBe(PHASE1_REPORT_SHA256);
    expect(report.north_macedonia_live).toBe(0);
    expect(report.mk_prefix_live).toBe(0);
    expect(GYM_ID_PREFIX.northMacedonia).toBe('mk_');
  });

  test('staging IDs unique mk_*; statuses valid; READY = 0', () => {
    const ids = staging.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(staging.length).toBeGreaterThan(50);
    for (const r of staging) {
      expect(r.id).toMatch(/^mk_[a-f0-9]{10}$/);
      expect(VALID_STATUS.has(r.import_category)).toBe(true);
    }
    expect(ready.length).toBe(0);
    expect(report.ready_to_import).toBe(0);
    expect(report.qualifying_class_a_chains).toBe(0);
    expect(report.class_a_locations).toBe(0);
    expect(report.small_market_assessment).toBe('INDEPENDENT_PHASE_RECOMMENDED');
    expect(report.phase2_required).toBe(true);
    expect(report.merge_ready).toBe(false);
    expect(report.verdict).toBe(
      'NORTH MACEDONIA PHASE 2 REQUIRED BEFORE MERGE',
    );
  });

  test('DQ: postcodes/coords for reviewable MK rows; no READY leakage', () => {
    const reviewable = staging.filter(
      r =>
        !r.foreign_probe &&
        (r.territory === 'North Macedonia' || !r.territory) &&
        ['NEEDS_REVIEW', 'NEEDS_COORDINATES', 'READY_TO_IMPORT'].includes(
          r.import_category,
        ) &&
        r.discovery_class !== 'regional_gap' &&
        r.discovery_class !== 'international_probe',
    );
    for (const r of reviewable) {
      if (r.postal_code && r.postal_code !== 'n/a') {
        expect(NORTH_MACEDONIA_POSTAL_RE.test(String(r.postal_code))).toBe(true);
      }
      if (r.lat != null && r.lng != null) {
        expect(isPlausibleNorthMacedoniaCoordinate(r.lat, r.lng)).toBe(true);
        expect(FALLBACK_COORD_SOURCES.test(String(r.coord_source || ''))).toBe(
          false,
        );
      }
      expect(MOJIBAKE_RE.test(`${r.name} ${r.address} ${r.city} ${r.brand}`)).toBe(
        false,
      );
    }
    expect(report.data_quality?.mojibake?.length ?? 0).toBe(0);
    expect(report.data_quality?.foreign_ready?.length ?? 0).toBe(0);
    expect(report.data_quality?.fallback_ready?.length ?? 0).toBe(0);
  });

  test('cross-border READY = 0; territorial gate rejects neighbors', () => {
    expect(report.cross_border.greece_ready).toBe(0);
    expect(report.cross_border.kosovo_ready).toBe(0);
    expect(report.cross_border.serbia_ready).toBe(0);
    expect(report.cross_border.bulgaria_ready).toBe(0);
    expect(report.cross_border.albania_ready).toBe(0);
    expect(report.cross_border.greek_macedonia_false_positives_ready).toBe(0);

    expect(isPlausibleNorthMacedoniaCoordinate(40.6401, 22.9444)).toBe(false); // Thessaloniki
    expect(isPlausibleNorthMacedoniaCoordinate(40.782, 21.41)).toBe(false); // Florina
    expect(isPlausibleNorthMacedoniaCoordinate(40.8, 22.05)).toBe(false); // Edessa
    expect(isPlausibleNorthMacedoniaCoordinate(40.99, 22.87)).toBe(false); // Kilkis
    expect(isPlausibleNorthMacedoniaCoordinate(42.6629, 21.1655)).toBe(false); // Pristina
    expect(isPlausibleNorthMacedoniaCoordinate(42.3706, 21.155)).toBe(false); // Ferizaj
    expect(isPlausibleNorthMacedoniaCoordinate(42.4637, 21.4694)).toBe(false); // Gjilan
    expect(isPlausibleNorthMacedoniaCoordinate(42.5514, 21.9003)).toBe(false); // Vranje
    expect(isPlausibleNorthMacedoniaCoordinate(42.3067, 21.65)).toBe(false); // Preševo
    expect(isPlausibleNorthMacedoniaCoordinate(42.2833, 22.6911)).toBe(false); // Kyustendil
    expect(isPlausibleNorthMacedoniaCoordinate(42.0119, 23.0908)).toBe(false); // Blagoevgrad
    expect(isPlausibleNorthMacedoniaCoordinate(40.6186, 20.7808)).toBe(false); // Korçë
    expect(isPlausibleNorthMacedoniaCoordinate(40.902, 20.652)).toBe(false); // Pogradec
    expect(isPlausibleNorthMacedoniaCoordinate(41.9981, 21.4254)).toBe(true); // Skopje
  });

  test('city coverage + Skopje municipalities + Albanian / Ohrid audits', () => {
    for (const city of REQUIRED_CITIES) {
      expect(report.city_coverage[city]).toBeTruthy();
    }
    expect(report.city_coverage.Skopje).toBe('independent_present_candidate');
    expect(report.city_coverage.Bitola).toBe('independent_present_candidate');
    expect(report.city_coverage.Tetovo).toBe('independent_present_candidate');
    expect(report.city_coverage.Ohrid).toBe('independent_present_candidate');
    expect(report.city_coverage.Kičevo).toBe('independent_present_candidate');
    expect(report.skopje_municipalities.Centar).toBeTruthy();
    expect(report.skopje_municipalities.Karpoš).toBeTruthy();
    expect(report.skopje_municipalities.Aerodrom).toBeTruthy();
    expect(report.skopje_municipalities['Kisela Voda']).toBeTruthy();
    expect(report.skopje_municipalities['Gazi Baba']).toBeTruthy();
    expect(report.skopje_municipalities.Čair).toBeTruthy();
    expect(report.skopje_municipalities.Butel).toBeTruthy();
    expect(report.skopje_municipalities.Saraj).toBeTruthy();
    expect(report.skopje_municipalities['Šuto Orizari']).toBeTruthy();
    expect(report.skopje_municipalities['Gjorče Petrov']).toBeTruthy();

    expect(report.albanian_language_audit.performed).toBe(true);
    expect(report.albanian_language_audit.additional_legitimate_candidates).toBe(
      true,
    );
    expect(report.ohrid_tourism_audit.performed).toBe(true);
    expect(report.ohrid_tourism_audit.hotel_spa_ready_leakage).toBe(0);
    expect(report.unexplained_b_gaps).toBe(0);
    expect(report.unexplained_d_gaps).toBe(0);
  });

  test('duplicates / rebrands; check-in; search/i18n/orphan', () => {
    expect(dup.hard_duplicate_conflicts ?? 0).toBe(0);
    expect(rebrand.unresolved_conflicts ?? 0).toBe(0);
    expect(CHECK_IN_RADIUS_METERS).toBe(200);
    expect(AUTO_CHECKOUT_DISTANCE_METERS).toBe(200);

    expect(isNorthMacedoniaCountry('North Macedonia')).toBe(true);
    expect(isNorthMacedoniaCountry('Северна Македонија')).toBe(true);
    expect(isNorthMacedoniaCountry('Macedonia')).toBe(true);
    expect(isNorthMacedoniaCountry('Greek Macedonia')).toBe(false);
    expect(isGreeceCountry('North Macedonia')).toBe(false);
    expect(isMontenegroCountry('North Macedonia')).toBe(false);
    expect(isMoldovaCountry('North Macedonia')).toBe(false);
    expect(gymCountryTranslationKey('North Macedonia')).toBe(
      'countries.northMacedonia',
    );
    expect(en.countries.northMacedonia).toBe('North Macedonia');
    expect(da.countries.northMacedonia).toBe('Nordmakedonien');
    expect(sv.countries.northMacedonia).toBe('Nordmakedonien');
    expect(nb.countries.northMacedonia).toBe('Nord-Makedonia');

    const entry = buildGymSearchEntry(
      fakeGym({
        id: 'mk_testprobe01',
        name: 'Athletic Fitness Skopje',
        city: 'Skopje',
        brand: 'Athletic Fitness',
      }),
    );
    expect(entry.haystack.toLowerCase()).toMatch(
      /north macedonia|северна|skopje|скопје/,
    );

    const stub = resolveGymOrStub('mk_nonexistent_test');
    expect(String((stub as {region?: string}).region || '')).toMatch(
      /North Macedonia/i,
    );
    expect(resolveGymOrStub('me_nonexistent_test').region).toMatch(/Montenegro/i);
    expect(resolveGymOrStub('md_nonexistent_test').region).toMatch(/Moldova/i);
  });

  test('projected catalog unchanged; no 12,500 cross; SHA still frozen', () => {
    expect(report.projected_catalog).toBe(PHASE1_PRODUCTION_TOTAL);
    expect(report.crosses_12500).toBe(false);
    expect(report.global_stress_qa_required_now).toBe(false);
    const shaAfter = crypto
      .createHash('sha256')
      .update(fs.readFileSync(centersPath))
      .digest('hex');
    expect(shaAfter).toBe(LIVE_PRODUCTION_SHA256);
    expect(shaAfter).toBe(sha);
  });
});
